import mongoose from "mongoose";
import Menu from "../models/Menu.js";
import Restaurant from "../models/Restaurant.js";
import Reservation from "../models/Reservation.js";
import { dayjs } from "../utils/dates.js";
import { generateQRDataURL, verifyQR } from "../utils/qr.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";

/* ------------------------------ helpers ------------------------------ */
// iki modu da hesapla: "index" ve "count"
function computeBothTotals(selections) {
  const persons = (selections || []).map(s => Number(s.person) || 0).filter(n => n > 0);
  const uniq = new Set(persons);
  const maxP = persons.length ? Math.max(...persons) : 0;

  // index modu: kişi sayısı = max(person), toplam = sadece fiyatların toplamı
  const indexParty = maxP;
  const indexTotal = (selections || []).reduce((a, s) => a + (Number(s.price) || 0), 0);

  // count modu: kişi sayısı = Σ person, toplam = Σ (price × person)
  const countParty = (selections || []).reduce((a, s) => a + (Number(s.person) || 0), 0);
  const countTotal = (selections || []).reduce((a, s) => a + (Number(s.price) * (Number(s.person) || 0)), 0);

  // basit bir “heuristic” öneri
  const looksIndex =
    persons.length > 0 &&
    persons.every(n => Number.isInteger(n) && n >= 1) &&
    uniq.size === persons.length &&
    maxP <= (selections?.length || 0) + 1;

  const suggested = looksIndex ? "index" : "count";
  return {
    index: { party: indexParty, total: indexTotal },
    count: { party: countParty, total: countTotal },
    suggested
  };
}

function chooseMode({ index, count, suggested }, expectedPartySize, explicitMode) {
  if (explicitMode === "index" || explicitMode === "count") return explicitMode;

  if (Number.isFinite(expectedPartySize)) {
    const matchIndex = index.party === expectedPartySize;
    const matchCount = count.party === expectedPartySize;

    if (matchIndex && !matchCount) return "index";
    if (matchCount && !matchIndex) return "count";
    if (matchIndex && matchCount) {
      // her ikisi de uyuyorsa: fiyatı kullanıcı lehine korumak için daha düşük total'i seç
      return index.total <= count.total ? "index" : "count";
    }

    // hiçbiri birebir uymuyorsa: en yakın olana yaklaş
    const dIndex = Math.abs(index.party - expectedPartySize);
    const dCount = Math.abs(count.party - expectedPartySize);
    if (dIndex < dCount) return "index";
    if (dCount < dIndex) return "count";
    return suggested;
  }

  return suggested;
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
  if (cfg.type === "flat") {
    depositAmount = cfg.flatAmount;
  } else {
    depositAmount = Math.round(totalPrice * (Math.max(0, cfg.ratePercent) / 100));
  }

  // hiçbir alan yoksa makul fallback (%20)
  if (depositAmount === 0 && cfg.ratePercent === 0 && cfg.flatAmount === 0) {
    depositAmount = Math.round(totalPrice * 0.20);
  }

  if (cfg.minAmount > 0) depositAmount = Math.max(depositAmount, cfg.minAmount);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) depositAmount = 0;
  if (depositAmount > totalPrice) depositAmount = totalPrice;

  return { depositAmount, cfg };
}

/* ----------------------------- controllers --------------------------- */
/**
 * POST /api/reservations
 * body: { restaurantId, dateTimeISO, selections:[{ person, menuId }], partySize?, selectionMode? }
 */
export const createReservation = async (req, res, next) => {
  try {
    const { restaurantId, dateTimeISO, selections = [] } = req.body;
    const expectedPartySize =
      req.body.partySize != null ? Number(req.body.partySize) : null;
    const explicitMode =
      typeof req.body.selectionMode === "string" ? req.body.selectionMode : null; // "index" | "count" | null

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) throw { status: 404, message: "Restaurant not found" };
    if (!Array.isArray(selections) || selections.length === 0)
      throw { status: 400, message: "At least one selection is required" };

    // Menü fiyatlarını çek
    const idList = selections.map((s) => s.menuId).filter(Boolean);
    const objIds = idList.map((id) => new mongoose.Types.ObjectId(id));
    const menus = await Menu.find({ _id: { $in: objIds }, isActive: true }).lean();
    const priceMap = new Map(menus.map((m) => [String(m._id), Number(m.pricePerPerson || 0)]));

    const missing = idList.filter((id) => !priceMap.has(String(id)));
    if (missing.length)
      throw { status: 400, message: "Some menus are inactive or not found", detail: missing };

    // selections + kişi başı fiyat snapshotu
    const withPrices = selections.map((s) => ({
      person: Number(s.person) || 0,
      menuId: s.menuId,
      price: priceMap.get(String(s.menuId)) ?? 0,
    }));

    // iki modu da hesapla; FE'nin niyetine göre modu seç
    const both = computeBothTotals(withPrices);
    const mode = chooseMode(both, expectedPartySize, explicitMode);
    const partySize = mode === "index" ? both.index.party : both.count.party;
    const totalPrice = mode === "index" ? both.index.total : both.count.total;

    if (partySize <= 0) throw { status: 400, message: "partySize must be at least 1 based on selections" };

    // Kapora
    const { depositAmount } = computeDeposit(restaurant, totalPrice);

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

/**
 * POST /api/reservations/:rid/receipt
 */
export const uploadReceipt = async (req, res, next) => {
  try {
    const f =
      req.file ||
      (Array.isArray(req.files) && req.files[0]) ||
      (req.files?.file && req.files.file[0]) ||
      (req.files?.receipt && req.files.receipt[0]);
    if (!f || !f.buffer) return res.status(400).json({ message: "Dosya yüklenmedi" });
    req.file = f;

    const r = await Reservation.findById(req.params.rid);
    if (!r) throw { status: 404, message: "Reservation not found" };
    if (r.userId.toString() !== req.user.id && req.user.role === "customer")
      throw { status: 403, message: "Forbidden" };

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: process.env.CLOUDINARY_FOLDER,
      resource_type: req.file.mimetype === "application/pdf" ? "raw" : "auto",
    });

    r.receiptUrl = result.secure_url;
    await r.save();
    res.json({ receiptUrl: r.receiptUrl, status: r.status, public_id: result.public_id });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/reservations
 */
export const listMyReservations = async (req, res, next) => {
  try {
    const q = { userId: req.user.id };
    if (req.query.status) q.status = req.query.status;

    const items = await Reservation.find(q)
      .populate("restaurantId", "_id name")
      .sort({ dateTimeUTC: -1 })
      .lean();

    const out = items.map((r) => ({
      _id: r._id,
      restaurantId: r.restaurantId,
      dateTimeUTC: r.dateTimeUTC,
      status: r.status,
      receiptUrl: r.receiptUrl,
      partySize: r.partySize,
      totalPrice: r.totalPrice,
      depositAmount: r.depositAmount,
    }));

    res.json(out);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/reservations/:rid
 * Detay – iki modu da hesapla; veriyi normalize et; menü adlarını ekle.
 */
export const getReservation = async (req, res, next) => {
  try {
    const rDoc = await Reservation.findById(req.params.rid)
      .populate("restaurantId", "_id name")
      .lean();
    if (!rDoc) return res.status(404).json({ message: "Reservation not found" });

    if (req.user.role === "customer" && String(rDoc.userId) !== String(req.user.id))
      return res.status(403).json({ message: "Forbidden" });

    const both = computeBothTotals(rDoc.selections || []);
    // DB’de kayıtlı party/total ile iki moddan hangisi daha uyumluysa onu seç
    const byDb = chooseMode(both, rDoc.partySize, null);
    const computedParty = byDb === "index" ? both.index.party : both.count.party;
    const computedTotal = byDb === "index" ? both.index.total : both.count.total;

    // Menüler -> isimleri döndür
    const menuIds = (rDoc.selections || []).map((s) => s.menuId).filter(Boolean);
    const menus = await Menu.find({ _id: { $in: menuIds } })
      .select("_id name title pricePerPerson")
      .lean();

    const patch = {};
    let needUpdate = false;
    if (computedParty > 0 && computedParty !== rDoc.partySize) {
      patch.partySize = computedParty;
      needUpdate = true;
    }
    if (computedTotal !== rDoc.totalPrice) {
      patch.totalPrice = computedTotal;
      needUpdate = true;
    }

    const restaurant = await Restaurant.findById(rDoc.restaurantId?._id || rDoc.restaurantId).lean();
    const { depositAmount } = computeDeposit(restaurant, computedTotal);
    if (depositAmount !== rDoc.depositAmount) {
      patch.depositAmount = depositAmount;
      needUpdate = true;
    }

    if (needUpdate) {
      await Reservation.updateOne({ _id: rDoc._id }, { $set: patch }).catch(() => {});
      Object.assign(rDoc, patch);
      console.log("NORMALIZE", rDoc._id.toString(), "mode:", byDb, "patch:", patch);
    }

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

      selectionMode: byDb,
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
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/reservations/:rid/approve
 */
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
    res.json({ ok: true, qrDataUrl: qr });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/reservations/:rid/reject
 */
export const rejectReservation = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if (!r) throw { status: 404, message: "Reservation not found" };
    if (req.user.role !== "admin" && r.restaurantId.owner.toString() !== req.user.id)
      throw { status: 403, message: "Forbidden" };

    r.status = "cancelled";
    r.cancelledAt = new Date();
    await r.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/reservations/:rid/cancel
 */
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
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/reservations/checkin
 */
export const checkin = async (req, res, next) => {
  try {
    const { rid, mid, ts, sig } = req.body;
    const ok = verifyQR({ rid, mid, ts, sig });
    if (!ok) throw { status: 400, message: "Invalid QR" };

    const r = await Reservation.findById(rid);
    if (!r || r.restaurantId.toString() !== mid) throw { status: 400, message: "QR mismatch" };
    if (r.status === "arrived") return res.json({ ok: true, already: true });

    const rest = await Restaurant.findById(mid).lean();
    const grace = rest?.graceMinutes ?? 15;
    const start = dayjs(r.dateTimeUTC).subtract(grace, "minute");
    const end = dayjs(r.dateTimeUTC).add(90, "minute");
    if (!(dayjs().isAfter(start) && dayjs().isBefore(end))) throw { status: 400, message: "Outside time window" };

    r.status = "arrived";
    r.checkinAt = new Date();
    await r.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};
