import mongoose from "mongoose";
import Menu from "../models/Menu.js";
import Restaurant from "../models/Restaurant.js";
import Reservation from "../models/Reservation.js";
import { dayjs } from "../utils/dates.js";
import { generateQRDataURL, verifyQR } from "../utils/qr.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import { notifyUser, notifyRestaurantOwner } from "../services/notification.service.js";
import joi from "joi";

/** persons dizisi tam 1..N ve benzersiz ise INDEX, aksi halde COUNT */
function detectModeStrict(selections = []) {
  const persons = selections.map((s) => Number(s.person) || 0).filter((n) => n > 0);
  const n = selections.length;
  if (!n || persons.length !== n) return "count";
  const uniq = new Set(persons);
  const maxP = Math.max(...persons);
  const minP = Math.min(...persons);
  return uniq.size === n && minP === 1 && maxP === n ? "index" : "count";
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
  const totalPrice = selections.reduce(
    (a, s) => a + Number(s.person) * (Number(s.price) || 0),
    0
  );
  return { mode, partySize, totalPrice };
}

function computeDeposit(restaurant, totalPrice) {
  const cfg = {
    type:
      restaurant?.depositType ||
      restaurant?.settings?.depositType ||
      (restaurant?.depositRate ??
      restaurant?.depositPercent ??
      restaurant?.settings?.depositRate ??
      restaurant?.settings?.depositPercent) != null
        ? "percent"
        : (restaurant?.depositAmount ?? restaurant?.settings?.depositAmount) != null
        ? "flat"
        : "percent",
    ratePercent:
      Number(
        restaurant?.depositRate ??
          restaurant?.depositPercent ??
          restaurant?.settings?.depositRate ??
          restaurant?.settings?.depositPercent ??
          0
      ) || 0,
    flatAmount:
      Number(restaurant?.depositAmount ?? restaurant?.settings?.depositAmount ?? 0) || 0,
    minAmount:
      Number(restaurant?.minDeposit ?? restaurant?.settings?.minDeposit ?? 0) || 0,
  };

  let depositAmount = 0;
  if (cfg.type === "flat") depositAmount = cfg.flatAmount;
  else depositAmount = Math.round(totalPrice * (Math.max(0, cfg.ratePercent) / 100));

  if (depositAmount === 0 && cfg.ratePercent === 0 && cfg.flatAmount === 0) {
    depositAmount = Math.round(totalPrice * 0.2);
  }

  if (cfg.minAmount > 0) depositAmount = Math.max(depositAmount, cfg.minAmount);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) depositAmount = 0;
  if (depositAmount > totalPrice) depositAmount = totalPrice;
  return depositAmount;
}

/** POST /api/reservations */
export const createReservation = async (req, res, next) => {
  try {
    const { restaurantId, dateTimeISO, selections = [] } = req.body;

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) throw { status: 404, message: "Restaurant not found" };
    if (!Array.isArray(selections) || selections.length === 0)
      throw { status: 400, message: "At least one selection is required" };

    const ids = selections.map((s) => s.menuId).filter(Boolean);
    const menus = await Menu.find({ _id: { $in: ids }, isActive: true }).lean();
    const priceMap = new Map(menus.map((m) => [String(m._id), Number(m.pricePerPerson || 0)]));

    const missing = ids.filter((id) => !priceMap.has(String(id)));
    if (missing.length)
      throw { status: 400, message: "Some menus are inactive or not found", detail: missing };

    const withPrices = selections.map((s) => ({
      person: Number(s.person) || 0,
      menuId: s.menuId,
      price: priceMap.get(String(s.menuId)) ?? 0,
    }));

    const { mode, partySize, totalPrice } = computeTotalsStrict(withPrices);
    if (partySize <= 0)
      throw { status: 400, message: "partySize must be at least 1 based on selections" };

    const depositAmount = computeDeposit(restaurant, totalPrice);

    const r = await Reservation.create({
      restaurantId,
      userId: req.user.id,
      dateTimeUTC: new Date(dateTimeISO),
      partySize,
      selections: withPrices,
      totalPrice,
      depositAmount,
      status: "pending",
    });

    // (İsteğe bağlı) burada da restorana “yeni talep” bildirimi atılabilir.

    res.json({
      reservationId: r._id.toString(),
      partySize: r.partySize,
      total: r.totalPrice,
      deposit: r.depositAmount,
      status: r.status,
      selectionMode: mode,
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/reservations/:rid/receipt */
export const uploadReceipt = async (req, res, next) => {
  try {
    const f =
      req.file ||
      (Array.isArray(req.files) && req.files[0]) ||
      (req.files?.file && req.files.file[0]) ||
      (req.files?.receipt && req.files.receipt[0]);
    if (!f || !f.buffer)
      return res.status(400).json({ message: "Dosya yüklenmedi" });
    req.file = f;

    const r = await Reservation.findById(req.params.rid);
    if (!r) throw { status: 404, message: "Reservation not found" };

    if (req.user.role === "customer" && String(r.userId) !== String(req.user.id))
      throw { status: 403, message: "Forbidden" };

    if (r.status !== "pending")
      return res
        .status(400)
        .json({ message: "Bu durumda dekont yüklenemez", status: r.status });

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: process.env.CLOUDINARY_FOLDER,
      resource_type: req.file.mimetype === "application/pdf" ? "raw" : "auto",
    });

    r.receiptUrl = result.secure_url;
    r.receiptUploadedAt = new Date();
    await r.save();

    // Müşteri — pending
    await notifyUser(r.userId, {
      title: "Talebin alındı ✅",
      body: `${dayjs(r.dateTimeUTC).format(
        "DD.MM.YYYY HH:mm"
      )} için talebin restorana iletildi. Onaylanınca QR kodun açılacak.`,
      data: {
        type: "reservation_pending",
        rid: String(r._id),
        section: "reservation",
      },
      key: `cust:pending:${r._id}`,
      type: "reservation_pending",
    });

    // Restoran sahibi — yeni istek
    await notifyRestaurantOwner(r.restaurantId, {
      title: "Yeni rezervasyon talebi",
      body: `${dayjs(r.dateTimeUTC).format(
        "DD.MM.YYYY HH:mm"
      )} • ${r.partySize} kişilik rezervasyon bekliyor. Lütfen kontrol edin.`,
      data: {
        type: "restaurant_new_request",
        rid: String(r._id),
        section: "verification",
      },
      key: `rest:new:${r._id}`,
      type: "restaurant_new_request",
    });

    res.json({
      receiptUrl: r.receiptUrl,
      status: r.status,
      public_id: result.public_id,
      receiptUploadedAt: r.receiptUploadedAt,
      message: "Dekont yüklendi. Rezervasyon isteği restoran onayını bekliyor.",
    });
  } catch (e) {
    next(e);
  }
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

    res.json(
      items.map((r) => ({
        _id: r._id,
        restaurantId: r.restaurantId,
        dateTimeUTC: r.dateTimeUTC,
        status: r.status,
        receiptUrl: r.receiptUrl,
        partySize: r.partySize,
        totalPrice: r.totalPrice,
        depositAmount: r.depositAmount,
        receiptUploadedAt: r.receiptUploadedAt || null,
        underattended: !!r.underattended,
      }))
    );
  } catch (e) {
    next(e);
  }
};

/** GET /api/reservations/:rid */
export const getReservation = async (req, res, next) => {
  try {
    const rDoc = await Reservation.findById(req.params.rid)
      .populate("restaurantId", "_id name")
      .lean();

    if (!rDoc) return res.status(404).json({ message: "Reservation not found" });
    if (
      req.user.role === "customer" &&
      String(rDoc.userId) !== String(req.user.id)
    )
      return res.status(403).json({ message: "Forbidden" });

    const { mode, partySize, totalPrice } = computeTotalsStrict(rDoc.selections || []);
    const restaurant = await Restaurant.findById(
      rDoc.restaurantId?._id || rDoc.restaurantId
    ).lean();
    const depositAmount = computeDeposit(restaurant, totalPrice);

    const patch = {};
    let need = false;
    if (partySize > 0 && partySize !== rDoc.partySize) {
      patch.partySize = partySize;
      need = true;
    }
    if (totalPrice !== rDoc.totalPrice) {
      patch.totalPrice = totalPrice;
      need = true;
    }
    if (depositAmount !== rDoc.depositAmount) {
      patch.depositAmount = depositAmount;
      need = true;
    }
    if (need) {
      await Reservation.updateOne({ _id: rDoc._id }, { $set: patch }).catch(() => {});
      Object.assign(rDoc, patch);
      console.log("NORMALIZE", rDoc._id.toString(), "mode:", mode, "patch:", patch);
    }

    const menuIds = (rDoc.selections || []).map((s) => s.menuId).filter(Boolean);
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
      menus: menus.map((m) => ({
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
      underattended: !!rDoc.underattended,
    });
  } catch (e) {
    next(e);
  }
};

/** POST /api/reservations/:rid/approve */
export const approveReservation = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if (!r) throw { status: 404, message: "Reservation not found" };
    if (req.user.role !== "admin" && r.restaurantId.owner.toString() !== req.user.id)
      throw { status: 403, message: "Forbidden" };

    r.status = "confirmed";

    // deterministik taban tarih
    const baseDate = r.qrTs || r.dateTimeUTC || r.createdAt || new Date();
    if (!r.qrTs) r.qrTs = baseDate; // sadece ilk onayda setle

    const rid = r._id.toString();
    const mid = r.restaurantId._id.toString();
    const ts = baseDate;

    const qrDataUrl = await generateQRDataURL({ rid, mid, ts });
    await r.save();

    // Müşteri — onay
    try {
      await notifyUser(r.userId, {
        title: "Rezervasyonun onaylandı 🎉",
        body: `${dayjs(r.dateTimeUTC).format(
          "DD.MM.YYYY HH:mm"
        )} • QR kodun hazır. Rezzy > Rezervasyonlarım üzerinden erişebilirsin.`,
        data: { type: "reservation_approved", rid: String(r._id), section: "qrcode" },
        key: `cust:approved:${r._id}`,
        type: "reservation_approved",
      });
    } catch (e) {
      console.warn("[approveReservation] notifyUser warn:", e?.message || e);
    }

    res.json({ ok: true, qrDataUrl });
  } catch (e) {
    next(e);
  }
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

    // Müşteri — reddedildi
    await notifyUser(r.userId, {
      title: "Üzgünüz, rezervasyon onaylanmadı",
      body: `Uygun başka bir saat deneyebilirsin. İstersen farklı bir restoran da seçebilirsin.`,
      data: { type: "reservation_rejected", rid: String(r._id), section: "reservation" },
      key: `cust:rejected:${r._id}`,
      type: "reservation_rejected",
    });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/** POST /api/reservations/:rid/cancel */
export const cancelReservation = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if (!r) throw { status: 404, message: "Reservation not found" };
    if (r.userId.toString() !== req.user.id && req.user.role === "customer")
      throw { status: 403, message: "Forbidden" };

    r.status = "cancelled";
    r.cancelledAt = new Date();
    await r.save();

    // Restoran — müşteri iptali
    try {
      await notifyRestaurantOwner(r.restaurantId._id, {
        title: "Rezervasyon iptal edildi",
        body: `${dayjs(r.dateTimeUTC).format(
          "DD.MM.YYYY HH:mm"
        )} tarihli rezervasyon, müşteri tarafından iptal edildi.`,
        data: { type: "reservation_cancelled", rid: String(r._id), section: "reservations" },
        key: `rest:cancelled:${r._id}`,
        type: "reservation_cancelled",
      });
    } catch (e) {
      console.warn("[cancelReservation] notifyRestaurantOwner warn:", e?.message || e);
    }

    res.json({ ok: true, status: r.status });
  } catch (e) {
    next(e);
  }
};

/** POST /api/reservations/checkin  (QR ile) */
export const checkin = async (req, res, next) => {
  try {
    let { rid, mid, ts, sig, arrivedCount, qr } = req.body;

    // Bazı client'lar tek parça "qr" string gönderebilir: "rid/mid/ts/sig"
    // ya da query string formatında olabilir. Bu durumda alanları buradan çekiyoruz.
    if ((!rid || !mid || !ts || !sig) && typeof qr === "string" && qr.trim()) {
      try {
        qr = decodeURIComponent(qr.trim());
      } catch {}
      // Slash ayrımlı format
      const slashParts = qr.split("/");
      if (slashParts.length >= 4) {
        [rid, mid, ts, sig] = slashParts;
      } else {
        // Querystring formatı: rid=...&mid=...&ts=...&sig=...
        const params = {};
        qr.split(/[&?]/).forEach((pair) => {
          const [k, v] = pair.split("=");
          if (k && v) params[k] = v;
        });
        rid = rid || params.rid;
        mid = mid || params.mid;
        ts = ts || params.ts;
        sig = sig || params.sig;
      }
    }

    // URI decode
    const decode = (val) => {
      try {
        return val == null ? val : decodeURIComponent(val);
      } catch {
        return val;
      }
    };
    rid = decode(rid);
    mid = decode(mid);
    sig = decode(sig);
    ts = ts != null ? decode(ts) : ts;

    // Temel format kontrolleri
    if (!rid || !mid || !ts || !sig) {
      throw { status: 400, message: "QR formatı hatalı: rid/mid/ts/sig bekleniyor" };
    }
    if (!/^[0-9a-fA-F]{24}$/.test(String(rid)))
      throw { status: 400, message: "QR rid geçersiz" };
    if (!/^[0-9a-fA-F]{24}$/.test(String(mid)))
      throw { status: 400, message: "QR mid geçersiz" };
    if (!/^[0-9a-fA-F]{64}$/.test(String(sig)))
      throw { status: 400, message: "QR imza (sig) geçersiz" };

    // İmza doğrulaması
    const ok = verifyQR({ rid, mid, ts, sig });
    if (!ok) throw { status: 400, message: "QR imzası doğrulanamadı" };

    // Rezervasyon & restoran eşleşmesi
    const r = await Reservation.findById(rid).populate("restaurantId");
    if (!r || r.restaurantId._id.toString() !== mid) {
      throw { status: 400, message: "QR restoran/rezervasyon uyuşmuyor" };
    }

    // Yetki
    if (req.user.role !== "admin" && String(r.restaurantId.owner) !== String(req.user.id)) {
      throw { status: 403, message: "Yetkisiz işlem" };
    }

    // Zaman penceresi
    const rest = await Restaurant.findById(mid).lean();
    const before = Math.max(0, Number(rest?.checkinWindowBeforeMinutes ?? 15));
    const after = Math.max(0, Number(rest?.checkinWindowAfterMinutes ?? 90));
    const start = dayjs(r.dateTimeUTC).subtract(before, "minute");
    const end = dayjs(r.dateTimeUTC).add(after, "minute");
    if (!(dayjs().isAfter(start) && dayjs().isBefore(end))) {
      throw { status: 400, message: "Check-in zaman penceresi dışında" };
    }

    // arrivedCount: parametre gelmezse rezervasyon partySize değeri kullanılır
    let arrived = Number(arrivedCount);
    if (!Number.isFinite(arrived) || arrived < 0) {
      arrived = r.partySize;
    }
    arrived = Math.max(0, Math.min(arrived, r.partySize));

    const late = Math.max(0, dayjs().diff(dayjs(r.dateTimeUTC), "minute"));

    // Eksik katılım eşiği
    const threshold = Math.max(
      0,
      Math.min(100, Number(rest?.underattendanceThresholdPercent ?? 80))
    );
    const isUnder = arrived < r.partySize * (threshold / 100);

    r.status = "arrived";
    r.arrivedCount = arrived;
    r.lateMinutes = late;
    r.underattended = !!isUnder;
    r.checkinAt = new Date();
    await r.save();

    // Müşteri — check-in
    try {
      await notifyUser(r.userId, {
        title: "Check-in tamam ✅",
        body: `İyi eğlenceler! ${dayjs(r.dateTimeUTC).format(
          "DD.MM.YYYY HH:mm"
        )} rezervasyonun için girişin alındı.`,
        data: { type: "checkin", rid: String(r._id), section: "reservation" },
        key: `cust:checkin:${r._id}`,
        type: "checkin",
      });
    } catch (e) {
      console.warn("[checkin] notifyUser warn:", e?.message || e);
    }

    res.json({
      ok: true,
      rid: string(r.id),
      arrivedCount: r.arrivedCount,
      lateMinutes: r.lateMinutes,
      underattended: r.underattended,
    });
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/reservations/:rid/arrived-count  (check-in sonrası düzeltme) */
export const updateArrivedCount = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { arrivedCount } = req.body;

    const r = await Reservation.findById(rid).populate("restaurantId");
    if (!r) throw { status: 404, message: "Reservation not found" };

    // yetki
    if (req.user.role !== "admin" && String(r.restaurantId.owner) !== String(req.user.id))
      throw { status: 403, message: "Forbidden" };

    // pencere
    const rest = await Restaurant.findById(r.restaurantId._id).lean();
    const before = Math.max(0, Number(rest?.checkinWindowBeforeMinutes ?? 15));
    const after = Math.max(0, Number(rest?.checkinWindowAfterMinutes ?? 90));
    const start = dayjs(r.dateTimeUTC).subtract(before, "minute");
    const end = dayjs(r.dateTimeUTC).add(after, "minute");

    if (!(dayjs().isAfter(start) && dayjs().isBefore(end)))
      throw { status: 400, message: "Outside time window" };

    const arrived = Math.max(
      0,
      Math.min(Number(arrivedCount ?? 0), r.partySize)
    );
    if (!Number.isFinite(arrived)) throw { status: 400, message: "Invalid arrivedCount" };

    // eşik tekrar
    const threshold = Math.max(
      0,
      Math.min(100, Number(rest?.underattendanceThresholdPercent ?? 80))
    );
    const isUnder = arrived < r.partySize * (threshold / 100);

    r.arrivedCount = arrived;
    if (r.status !== "arrived") r.status = "arrived";
    r.underattended = !!isUnder;
    await r.save();

    res.json({ ok: true, arrivedCount: r.arrivedCount, underattended: r.underattended });
  } catch (e) {
    next(e);
  }
};

export const listReservationsByRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { status, limit = 30, cursor, debug } = req.query;

    const isObjId = mongoose.Types.ObjectId.isValid(rid);
    const ridObj = isObjId ? new mongoose.Types.ObjectId(rid) : null;

    const q = {
      $or: [...(ridObj ? [{ restaurantId: ridObj }] : []), { restaurantId: rid }],
    };
    if (status) q.status = status;
    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      q._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    }

    const lim = Math.min(100, Number(limit) || 30);

    if (debug) {
      const anyOne = await Reservation.findOne(q).lean();
      console.log("[RES-LIST][debug] sample:", anyOne
        ? {
            _id: anyOne._id,
            restaurantId: anyOne.restaurantId,
            status: anyOne.status,
            dateTimeUTC: anyOne.dateTimeUTC,
          }
        : "none");
    }

    const items = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(lim + 1)
      .lean();

    const nextCursor = items.length > lim ? String(items[lim - 1]?._id) : undefined;
    const sliced = items.slice(0, lim);

    res.json({
      items: sliced.map((r) => ({
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
        underattended: !!r.underattended,
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

    const startDay = start ? new Date(`${start}T00:00:00.000Z`) : null;
    const endDay = end ? new Date(`${end}T23:59:59.999Z`) : null;

    const dtMatch = {};
    if (startDay) dtMatch.$gte = startDay;
    if (endDay) dtMatch.$lte = endDay;

    const match = { restaurantId: new mongoose.Types.ObjectId(rid) };
    if (startDay || endDay) match.dateTimeUTC = dtMatch;

    const rows = await Reservation.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          c: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$totalPrice", 0] } },
        },
      },
    ]);

    const by = new Map(rows.map((r) => [r._id, r]));
    const totalCount = rows.reduce((a, r) => a + r.c, 0);
    const totalAmount = rows.reduce((a, r) => a + (r.amount || 0), 0);

    const pendingCount = by.get("pending")?.c || 0;
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
  } catch (e) {
    next(e);
  }
};

function formatRangeLabel(start, end) {
  if (!start && !end) return "Tüm zamanlar";
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - ...`;
  return `... - ${end}`;
}
