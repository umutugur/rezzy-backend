import mongoose from "mongoose";
import Menu from "../models/Menu.js";
import Restaurant from "../models/Restaurant.js";
import Reservation from "../models/Reservation.js";
import { dayjs } from "../utils/dates.js";
import { generateQRDataURL, verifyQR } from "../utils/qr.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import { notifyUser, notifyRestaurantOwner } from "../services/notification.service.js";

/** persons dizisi tam 1..N ve benzersiz ise INDEX, aksi halde COUNT */
function detectModeStrict(selections = []) {
  const persons = selections.map(s => Number(s.person) || 0).filter(n => n > 0);
  const n = selections.length;
  if (!n || persons.length !== n) return "count";
  const uniq = new Set(persons);
  const maxP = Math.max(...persons);
  const minP = Math.min(...persons);
  return (uniq.size === n && minP === 1 && maxP === n) ? "index" : "count";
}

function computeTotalsStrict(selections = []) {
  const mode = detectModeStrict(selections);
  if (mode === "index") {
    const partySize = selections.length; // N
    const totalPrice = selections.reduce((a, s) => a + (Number(s.price) || 0), 0);
    return { mode, partySize, totalPrice };
  }
  // COUNT
  const partySize = selections.reduce((a, s) => a + (Number(s.person) || 0), 0);
  const totalPrice = selections.reduce((a, s) =>
    a + (Number(s.person) * (Number(s.price) || 0)), 0);
  return { mode, partySize, totalPrice };
}

function computeDeposit(restaurant, totalPrice) {
  const cfg = {
    type:
      restaurant?.depositType ||
      restaurant?.settings?.depositType ||
      ((restaurant?.depositRate ??
        restaurant?.depositPercent ??
        restaurant?.settings?.depositRate ??
        restaurant?.settings?.depositPercent) != null
        ? "percent"
        : (restaurant?.depositAmount ?? restaurant?.settings?.depositAmount) != null
        ? "flat"
        : "percent"),
    ratePercent: Number(
      restaurant?.depositRate ??
      restaurant?.depositPercent ??
      restaurant?.settings?.depositRate ??
      restaurant?.settings?.depositPercent ?? 0
    ) || 0,
    flatAmount: Number(restaurant?.depositAmount ?? restaurant?.settings?.depositAmount ?? 0) || 0,
    minAmount: Number(restaurant?.minDeposit ?? restaurant?.settings?.minDeposit ?? 0) || 0,
  };

  let depositAmount = 0;
  if (cfg.type === "flat") depositAmount = cfg.flatAmount;
  else depositAmount = Math.round(totalPrice * (Math.max(0, cfg.ratePercent) / 100));

  if (depositAmount === 0 && cfg.ratePercent === 0 && cfg.flatAmount === 0) {
    depositAmount = Math.round(totalPrice * 0.20);
  }

  if (cfg.minAmount > 0) depositAmount = Math.max(depositAmount, cfg.minAmount);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) depositAmount = 0;
  if (depositAmount > totalPrice) depositAmount = totalPrice;
  return depositAmount;
}

/** POST /api/reservations
 * body: { restaurantId, dateTimeISO, selections:[{ person, menuId }] }
 * NOT: FE’den partySize gelse bile YOK SAYILIR; tek kaynak selections.
 */
export const createReservation = async (req, res, next) => {
  try {
    const { restaurantId, dateTimeISO, selections = [] } = req.body;

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) throw { status: 404, message: "Restaurant not found" };
    if (!Array.isArray(selections) || selections.length === 0)
      throw { status: 400, message: "At least one selection is required" };

    const ids = selections.map(s => s.menuId).filter(Boolean);
    const menus = await Menu.find({ _id: { $in: ids }, isActive: true }).lean();
    const priceMap = new Map(menus.map(m => [String(m._id), Number(m.pricePerPerson || 0)]));

    const missing = ids.filter(id => !priceMap.has(String(id)));
    if (missing.length) throw { status: 400, message: "Some menus are inactive or not found", detail: missing };

    const withPrices = selections.map(s => ({
      person: Number(s.person) || 0,
      menuId: s.menuId,
      price: priceMap.get(String(s.menuId)) ?? 0,
    }));

    const { mode, partySize, totalPrice } = computeTotalsStrict(withPrices);
    if (partySize <= 0) throw { status: 400, message: "partySize must be at least 1 based on selections" };

    const depositAmount = computeDeposit(restaurant, totalPrice);

    const r = await Reservation.create({
      restaurantId,
      userId: req.user.id,
      dateTimeUTC: new Date(dateTimeISO),
      partySize,
      selections: withPrices,
      totalPrice,
      depositAmount,
      status: "pending", // dekont yüklenecek → restoran onayı beklenir
    });

    res.json({
      reservationId: r._id.toString(),
      partySize: r.partySize,
      total: r.totalPrice,
      deposit: r.depositAmount,
      status: r.status,
      selectionMode: mode,
    });
  } catch (e) { next(e); }
};

/** POST /api/reservations/:rid/receipt
 * Sadece pending iken dekont yüklenebilir/değiştirilebilir.
 * Sonrasında restoran onay/ret verecek.
 */
export const uploadReceipt = async (req, res, next) => {
  try {
    const f = req.file
      || (Array.isArray(req.files) && req.files[0])
      || (req.files?.file && req.files.file[0])
      || (req.files?.receipt && req.files.receipt[0]);
    if (!f || !f.buffer) return res.status(400).json({ message: "Dosya yüklenmedi" });
    req.file = f;

    const r = await Reservation.findById(req.params.rid);
    if (!r) throw { status: 404, message: "Reservation not found" };

    if (req.user.role === "customer" && String(r.userId) !== String(req.user.id))
      throw { status: 403, message: "Forbidden" };

    if (r.status !== "pending")
      return res.status(400).json({ message: "Bu durumda dekont yüklenemez", status: r.status });

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: process.env.CLOUDINARY_FOLDER,
      resource_type: req.file.mimetype === "application/pdf" ? "raw" : "auto",
    });

    r.receiptUrl = result.secure_url;
    r.receiptUploadedAt = new Date();
    await r.save();

    // Bildirimler:
    await notifyUser(r.userId, {
      title: "Rezervasyon isteğin alındı",
      body:  "Restoran onayı bekleniyor. Onaylanınca QR kodun açılacak.",
      data:  { type: "reservation_pending", rid: String(r._id) },
      key:   `cust:pending:${r._id}`,
      type:  "reservation_pending"
    });

    await notifyRestaurantOwner(r.restaurantId, {
      title: "Yeni rezervasyon isteği",
      body:  "Dekont yüklendi. Kontrol edip onaylayın.",
      data:  { type: "restaurant_new_request", rid: String(r._id), section: "verification" },
      key:   `rest:new:${r._id}`,
      type:  "restaurant_new_request"
    });

    res.json({
      receiptUrl: r.receiptUrl,
      status: r.status,
      public_id: result.public_id,
      receiptUploadedAt: r.receiptUploadedAt,
      message: "Dekont yüklendi. Rezervasyon isteği restoran onayını bekliyor.",
    });
  } catch (e) { next(e); }
};

/** GET /api/reservations (kullanıcının listesi) */
export const listMyReservations = async (req, res, next) => {
  try {
    const q = { userId: req.user.id };
    if (req.query.status) q.status = req.query.status;

    const items = await Reservation.find(q)
      .populate("restaurantId", "_id name")
      .sort({ dateTimeUTC: -1 })
      .lean();

    res.json(items.map(r => ({
      _id: r._id,
      restaurantId: r.restaurantId,
      dateTimeUTC: r.dateTimeUTC,
      status: r.status,
      receiptUrl: r.receiptUrl,
      partySize: r.partySize,
      totalPrice: r.totalPrice,
      depositAmount: r.depositAmount,
      receiptUploadedAt: r.receiptUploadedAt || null,
    })));
  } catch (e) { next(e); }
};

/** GET /api/reservations/:rid */
export const getReservation = async (req, res, next) => {
  try {
    const rDoc = await Reservation.findById(req.params.rid)
      .populate("restaurantId", "_id name")
      .lean();

    if (!rDoc) return res.status(404).json({ message: "Reservation not found" });
    if (req.user.role === "customer" && String(rDoc.userId) !== String(req.user.id))
      return res.status(403).json({ message: "Forbidden" });

    const { mode, partySize, totalPrice } = computeTotalsStrict(rDoc.selections || []);
    const restaurant = await Restaurant.findById(rDoc.restaurantId?._id || rDoc.restaurantId).lean();
    const depositAmount = computeDeposit(restaurant, totalPrice);

    const patch = {};
    let need = false;
    if (partySize > 0 && partySize !== rDoc.partySize) { patch.partySize = partySize; need = true; }
    if (totalPrice !== rDoc.totalPrice)               { patch.totalPrice = totalPrice; need = true; }
    if (depositAmount !== rDoc.depositAmount)         { patch.depositAmount = depositAmount; need = true; }
    if (need) {
      await Reservation.updateOne({ _id: rDoc._id }, { $set: patch }).catch(()=>{});
      Object.assign(rDoc, patch);
      console.log("NORMALIZE", rDoc._id.toString(), "mode:", mode, "patch:", patch);
    }

    const menuIds = (rDoc.selections || []).map(s => s.menuId).filter(Boolean);
    const menus = await Menu.find({ _id: { $in: menuIds } })
      .select("_id name title pricePerPerson")
      .lean();

    res.json({
      _id: rDoc._id,
      restaurantId: rDoc.restaurantId,
      userId: rDoc.userId,
      dateTimeUTC: rDoc.dateTimeUTC,
      status: rDoc.status,
      receiptUrl: rDoc.receiptUrl,
      qrSig: rDoc.qrSig,

      partySize: rDoc.partySize,
      selections: rDoc.selections,
      totalPrice: rDoc.totalPrice,
      depositAmount: rDoc.depositAmount,

      selectionMode: mode,
      menus: menus.map(m => ({
        _id: m._id,
        name: m.name || m.title || "",
        pricePerPerson: Number(m.pricePerPerson || 0),
      })),

      checkinAt: rDoc.checkinAt,
      cancelledAt: rDoc.cancelledAt,
      noShowAt: rDoc.noShowAt,
      createdAt: rDoc.createdAt,
      updatedAt: rDoc.updatedAt,
      receiptUploadedAt: rDoc.receiptUploadedAt || null,
    });
  } catch (e) { next(e); }
};

/** POST /api/reservations/:rid/approve */
export const approveReservation = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if (!r) throw { status: 404, message: "Reservation not found" };
    if (req.user.role !== "admin" && r.restaurantId.owner.toString() !== req.user.id)
      throw { status: 403, message: "Forbidden" };

    r.status = "confirmed";
    const ts = r.dateTimeUTC.toISOString();
    const qr = await generateQRDataURL({ rid: r._id.toString(), mid: r.restaurantId._id.toString(), ts });
    r.qrSig = "generated";
    await r.save();

    await notifyUser(r.userId, {
      title: "Rezervasyonun onaylandı",
      body:  "Girişte QR kodunu okutmayı unutma.",
      data:  { type: "reservation_confirmed", rid: String(r._id), section: "qrcode" },
      key:   `cust:confirmed:${r._id}`,
      type:  "reservation_confirmed"
    });

    res.json({ ok: true, qrDataUrl: qr });
  } catch (e) { next(e); }
};

/** POST /api/reservations/:rid/reject */
export const rejectReservation = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if (!r) throw { status: 404, message: "Reservation not found" };
    if (req.user.role !== "admin" && r.restaurantId.owner.toString() !== req.user.id)
      throw { status: 403, message: "Forbidden" };

    r.status = "cancelled";
    r.cancelledAt = new Date();
    await r.save();

    await notifyUser(r.userId, {
      title: "Rezervasyonun onaylanmadı",
      body:  "Uygun başka bir saat seçebilirsin.",
      data:  { type: "reservation_rejected", rid: String(r._id) },
      key:   `cust:rejected:${r._id}`,
      type:  "reservation_rejected"
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
};

/** POST /api/reservations/:rid/cancel */
export const cancelReservation = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid);
    if (!r) throw { status: 404, message: "Reservation not found" };
    if (r.userId.toString() !== req.user.id && req.user.role === "customer")
      throw { status: 403, message: "Forbidden" };
    r.status = "cancelled";
    r.cancelledAt = new Date();
    await r.save();
    res.json({ ok: true, status: r.status });
  } catch (e) { next(e); }
};

/** POST /api/reservations/checkin */
export const checkin = async (req,res,next)=>{
  try{
    const { rid, mid, ts, sig, arrivedCount } = req.body;

    const ok = verifyQR({ rid, mid, ts, sig });
    if(!ok) throw { status:400, message:"Invalid QR" };

    const r = await Reservation.findById(rid).populate("restaurantId");
    if(!r || r.restaurantId._id.toString() !== mid) throw { status:400, message:"QR mismatch" };

    // yetki: restoran sahibi veya admin
    if (req.user.role !== "admin" && String(r.restaurantId.owner) !== String(req.user.id))
      throw { status:403, message:"Forbidden" };

    const rest = await Restaurant.findById(mid).lean();
    const grace = rest?.graceMinutes ?? 15;

    const start = dayjs(r.dateTimeUTC).subtract(grace,"minute");
    const end   = dayjs(r.dateTimeUTC).add(90,"minute");

    if (!(dayjs().isAfter(start) && dayjs().isBefore(end)))
      throw { status:400, message:"Outside time window" };

    const arrived = Math.max(0, Number(arrivedCount ?? r.partySize));
    const late = Math.max(0, dayjs().diff(dayjs(r.dateTimeUTC), "minute"));

    r.status = "arrived";
    r.arrivedCount = arrived;
    r.lateMinutes = late;
    r.checkinAt = new Date();
    await r.save();

    res.json({ ok:true, arrivedCount: r.arrivedCount, lateMinutes: r.lateMinutes });
  }catch(e){ next(e); }
};

export const listReservationsByRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { status, limit = 30, cursor, debug } = req.query;

    const isObjId = mongoose.Types.ObjectId.isValid(rid);
    const ridObj = isObjId ? new mongoose.Types.ObjectId(rid) : null;

    const q = {
      $or: [
        ...(ridObj ? [{ restaurantId: ridObj }] : []),
        { restaurantId: rid }
      ],
    };
    if (status) q.status = status;
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      q._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const lim = Math.min(100, Number(limit) || 30);

    if (debug) {
      const anyOne = await Reservation.findOne(q).lean();
      console.log("[RES-LIST][debug] sample:", anyOne ? {
        _id: anyOne._id,
        restaurantId: anyOne.restaurantId,
        status: anyOne.status,
        dateTimeUTC: anyOne.dateTimeUTC
      } : "none");
    }

    const items = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(lim + 1)
      .lean();

    const nextCursor = items.length > lim ? String(items[lim - 1]?._id) : undefined;
    const sliced = items.slice(0, lim);

    res.json({
      items: sliced.map(r => ({
        _id: r._id,
        restaurantId: r.restaurantId,
        userId: r.userId,
        dateTimeUTC: r.dateTimeUTC,
        partySize: r.partySize,
        totalPrice: r.totalPrice,
        depositAmount: r.depositAmount,
        receiptUrl: r.receiptUrl,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      nextCursor,
    });
  } catch (e) {
    next(e);
  }
};

export const reservationStatsByRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { start, end } = req.query;

    const startDay = start ? new Date(start + "T00:00:00.000Z") : null;
    const endDay   = end   ? new Date(end   + "T23:59:59.999Z") : null;

    const dtMatch = {};
    if (startDay) dtMatch.$gte = startDay;
    if (endDay)   dtMatch.$lte = endDay;

    const match = { restaurantId: new mongoose.Types.ObjectId(rid) };
    if (startDay || endDay) match.dateTimeUTC = dtMatch;

    const rows = await Reservation.aggregate([
      { $match: match },
      { $group: {
          _id: "$status",
          c: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$totalPrice", 0] } },
        }
      }
    ]);

    const by = new Map(rows.map(r => [r._id, r]));
    const totalCount = rows.reduce((a, r) => a + r.c, 0);
    const totalAmount = rows.reduce((a, r) => a + (r.amount || 0), 0);

    const pendingCount   = by.get("pending")?.c   || 0;
    const confirmedCount = by.get("confirmed")?.c || 0;
    const cancelledCount = by.get("cancelled")?.c || 0;

    res.json({
      rangeLabel: formatRangeLabel(start, end),
      totalCount,
      totalAmount,
      pendingCount,
      confirmedCount,
      rejectedCount: cancelledCount,
    });
  } catch (e) { next(e); }
};

function formatRangeLabel(start, end) {
  if (!start && !end) return "Tüm zamanlar";
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - ...`;
  return `... - ${end}`;
}
