import mongoose from "mongoose";
import Menu from "../models/Menu.js";
import Restaurant from "../models/Restaurant.js";
import Reservation from "../models/Reservation.js";
import User from "../models/User.js"; // ✅ Stripe müşteri için
import { fmtTR, dayjs} from "../utils/dates.js";
import { generateQRDataURL, verifyQR } from "../utils/qr.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import { notifyUser, notifyRestaurantOwner } from "../services/notification.service.js";
import { addIncident, computeUnderAttendWeight } from "../services/userRisk.service.js";
import joi from "joi";
import Stripe from "stripe";

// ✅ Stripe client (env varsa aktif)
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" })
  : null;

// Bölge → para birimi eşlemesi
function mapRegionToCurrency(region) {
  const r = String(region || "").toUpperCase();

  // İngiltere
  if (r === "UK" || r === "GB" || r === "UK-GB" || r === "EN") return "GBP";

  // KKTC (sende genelde CY kullanılıyor) ve Türkiye → TRY
  if (r === "CY" || r === "CY-TRNC" || r === "TR" || r === "TR-TR") return "TRY";

  // Default: TRY
  return "TRY";
}

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

// controllers/reservation.controller.js

export const createReservation = async (req, res, next) => {
  try {
    if (req.user?.role === "guest") {
      return res.status(401).json({
        message: "Rezervasyon oluşturmak için lütfen giriş yapın veya kayıt olun."
      });
    }

    const { restaurantId, dateTimeISO, selections = [], partySize } = req.body;

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) throw { status: 404, message: "Restaurant not found" };

    // ⬇️ ZAMAN KONTROLÜ aynen
    const dt = new Date(dateTimeISO);
    if (Number.isNaN(dt.getTime())) throw { status: 400, message: "Invalid dateTimeISO" };

    const minLeadMin =
      Number(
        restaurant?.settings?.minAdvanceMinutes ??
        restaurant?.minAdvanceMinutes ??
        0
      ) || 0;

    const now = new Date();
    const earliestAllowed = new Date(now.getTime() + minLeadMin * 60 * 1000);

    if (dt.getTime() <= earliestAllowed.getTime()) {
      const baseMsg =
        minLeadMin > 0
          ? `Rezervasyon en erken ${minLeadMin} dakika sonrasına alınabilir`
          : "Geçmiş saate rezervasyon yapılamaz";
      throw { status: 400, message: baseMsg };
    }
    // ⬆️ zaman kontrolü bitiş

    let withPrices = [];
    let mode = "count";
    let computedPartySize = 0;
    let totalPrice = 0;

    if (Array.isArray(selections) && selections.length > 0) {
      // ✅ eski akış (menü seçilmiş)
      const ids = selections.map((s) => s.menuId).filter(Boolean);
      const menus = await Menu.find({ _id: { $in: ids }, isActive: true }).lean();
      const priceMap = new Map(
        menus.map((m) => [String(m._id), Number(m.pricePerPerson || 0)])
      );

      const missing = ids.filter((id) => !priceMap.has(String(id)));
      if (missing.length)
        throw { status: 400, message: "Some menus are inactive or not found", detail: missing };

      withPrices = selections.map((s) => ({
        person: Number(s.person) || 0,
        menuId: s.menuId,
        price: priceMap.get(String(s.menuId)) ?? 0,
      }));

      const totals = computeTotalsStrict(withPrices);
      mode = totals.mode;
      computedPartySize = totals.partySize;
      totalPrice = totals.totalPrice;

      if (computedPartySize <= 0) {
        throw { status: 400, message: "partySize must be at least 1 based on selections" };
      }
    } else {
      // ✅ yeni akış (fix menü seçilmedi)
      computedPartySize = Number(partySize) || 0;
      if (computedPartySize <= 0) {
        throw { status: 400, message: "partySize is required when no menu selected" };
      }
      totalPrice = 0;
      withPrices = [];
      mode = "count";
    }

    const depositAmount = computeDeposit(restaurant, totalPrice);

    const r = await Reservation.create({
      restaurantId,
      userId: req.user.id,
      dateTimeUTC: dt,
      partySize: computedPartySize,
      selections: withPrices,
      totalPrice,
      depositAmount,
      status: "pending",

      paymentProvider: null,
      paymentIntentId: null,
      depositPaid: false,
      depositStatus: "pending",
      paidCurrency: null,
      paidAmount: 0,
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
 * POST /api/reservations/:rid/stripe-intent
 * - Sadece depozito için Stripe PaymentIntent oluşturur
 * - Havale sistemi aynen durur; bu endpoint sadece "Kart / Apple Pay / Google Pay" seçeneği için
 */
export const createStripePaymentIntentForReservation = async (req, res, next) => {
  try {
    if (!stripe) {
      throw {
        status: 500,
        message: "Stripe henüz yapılandırılmamış. STRIPE_SECRET_KEY env değişkenini kontrol edin.",
      };
    }

    const { rid } = req.params;
    const { saveCard = true } = req.body || {};

    const reservation = await Reservation.findById(rid).populate("restaurantId");
    if (!reservation) throw { status: 404, message: "Reservation not found" };

    // 🔒 Sadece kendi rezervasyonu için ödeme
    if (
      req.user.role === "customer" &&
      String(reservation.userId) !== String(req.user.id)
    ) {
      throw { status: 403, message: "Forbidden" };
    }

    // Zaten ödenmişse
    if (reservation.depositPaid === true || reservation.depositStatus === "paid") {
      return res.status(400).json({
        message: "Bu rezervasyon için depozito zaten ödenmiş görünüyor.",
      });
    }

    if (!reservation.depositAmount || reservation.depositAmount <= 0) {
      return res.status(400).json({
        message: "Bu rezervasyon için Stripe ile alınacak bir depozito bulunmuyor.",
      });
    }

    const restaurant =
      reservation.restaurantId ||
      (await Restaurant.findById(reservation.restaurantId).lean());
    if (!restaurant) {
      throw { status: 404, message: "Restaurant not found for reservation" };
    }

    // 💱 Bölgeden para birimi
    const currency = mapRegionToCurrency(
      restaurant.region || (restaurant.settings && restaurant.settings.region)
    );

    // 👤 Kullanıcı (Stripe customer)
    const user = await User.findById(reservation.userId);
    if (!user) throw { status: 404, message: "User not found" };

    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.name || undefined,
        metadata: { appUserId: String(user._id) },
      });

      stripeCustomerId = customer.id;
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // 💰 Tutar (minor unit)
    const amountMinor = Math.round(Number(reservation.depositAmount) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw {
        status: 400,
        message: "Deposit amount is invalid for Stripe payment",
      };
    }

    // 🔄 Daha önce oluşturulmuş PI var mı?
    let paymentIntent;

    if (reservation.paymentProvider === "stripe" && reservation.paymentIntentId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(
          reservation.paymentIntentId
        );

        if (
          existing &&
          existing.status !== "succeeded" &&
          existing.status !== "canceled" &&
          existing.amount === amountMinor &&
          existing.currency.toUpperCase() === currency.toUpperCase()
        ) {
          paymentIntent = existing;
        }
      } catch (err) {
        console.warn(
          "[Stripe] retrieve existing PaymentIntent failed:",
          err && err.message ? err.message : err
        );
      }
    }

    // 🔐 META – sade stringler
    const restaurantIdForMeta = (() => {
      if (restaurant && restaurant._id && mongoose.Types.ObjectId.isValid(restaurant._id)) {
        return String(restaurant._id);
      }
      if (mongoose.Types.ObjectId.isValid(reservation.restaurantId)) {
        return String(reservation.restaurantId);
      }
      return "";
    })();

    const metadata = {
      app: "rezzy",
      type: "reservation_deposit",
      reservationId: String(reservation._id),
      restaurantId: restaurantIdForMeta,
      userId: String(user._id),
      depositAmount: String(reservation.depositAmount),
      region: restaurant.region || "",
    };

    console.log("[Stripe] PI metadata:", metadata);

    // ➕ Yeni PaymentIntent
    if (!paymentIntent) {
      const params = {
        amount: amountMinor,
        currency: currency.toLowerCase(),
        customer: stripeCustomerId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
        metadata: metadata,
      };

      if (saveCard) {
        params.setup_future_usage = "off_session"; // 👈 TS YOK, düz JS
      }

      paymentIntent = await stripe.paymentIntents.create(params);
    }

    // 🔄 Reservation kaydını güncelle
    reservation.paymentProvider = "stripe";
    reservation.paymentIntentId = paymentIntent.id;
    reservation.depositStatus = "pending";
    reservation.depositPaid = false;
    reservation.paidCurrency = currency.toUpperCase();
    await reservation.save();

    // 🔑 Ephemeral key – PaymentSheet için şart
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: stripeCustomerId },
      { apiVersion: "2024-06-20" }
    );

    // ✔️ Frontend formatı
    return res.json({
      paymentIntentClientSecret: paymentIntent.client_secret,
      customerId: stripeCustomerId,
      ephemeralKey: ephemeralKey.secret,
      paymentIntentId: paymentIntent.id,
      currency: currency.toUpperCase(),
      amount: reservation.depositAmount,
      depositStatus: reservation.depositStatus,
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
      body: `${fmtTR(r.dateTimeUTC)} için talebin restorana iletildi. Onaylanınca QR kodun açılacak.`,
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
      body: `${fmtTR(r.dateTimeUTC)} • ${r.partySize} kişilik rezervasyon bekliyor. Lütfen kontrol edin.`,
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

        // ✅ Stripe alanları
        paymentProvider: r.paymentProvider || null,
        paymentIntentId: r.paymentIntentId || null,
        depositPaid: !!r.depositPaid,
        depositStatus: r.depositStatus || "pending",
        paidCurrency: r.paidCurrency || null,
        paidAmount: r.paidAmount || 0,
      }))
    );
  } catch (e) {
    next(e);
  }
};

/** GET /api/reservations/:rid */
export const getReservation = async (req, res, next) => {
  try {
    // 👇 Restoranın harita alanlarını da dahil ederek populate et
    const rDoc = await Reservation.findById(req.params.rid)
      .populate(
        "restaurantId",
        [
          "_id",
          "name",
          "address",
          "city",
          "mapAddress",
          "placeId",
          "googleMapsUrl",
          // GeoJSON içindeki sadece koordinasyon alanını seç
          "location.coordinates",
          "region",
        ].join(" ")
      )
      .lean();

    if (!rDoc) return res.status(404).json({ message: "Reservation not found" });
    if (req.user.role === "customer" && String(rDoc.userId) !== String(req.user.id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // —— Toplam/party/deposit normalize (mevcut mantık) ——
    const { mode, partySize, totalPrice } = computeTotalsStrict(rDoc.selections || []);

    // rDoc.restaurantId, populate’lı (objedir); yine de garanti olsun diye id’den de çekiyoruz
    const restId = rDoc?.restaurantId?._id || rDoc?.restaurantId;
    const restaurant = await Restaurant.findById(restId).lean();

    const depositAmount = computeDeposit(restaurant, totalPrice);

    const patch = {};
    let need = false;
    if (partySize > 0 && partySize !== rDoc.partySize) { patch.partySize = partySize; need = true; }
    if (totalPrice !== rDoc.totalPrice) { patch.totalPrice = totalPrice; need = true; }
    if (depositAmount !== rDoc.depositAmount) { patch.depositAmount = depositAmount; need = true; }
    if (need) {
      await Reservation.updateOne({ _id: rDoc._id }, { $set: patch }).catch(() => {});
      Object.assign(rDoc, patch);
      console.log("NORMALIZE", rDoc._id.toString(), "mode:", mode, "patch:", patch);
    }

    // — Menüler —
    const menuIds = (rDoc.selections || []).map((s) => s.menuId).filter(Boolean);
    const menus = await Menu.find({ _id: { $in: menuIds } })
      .select("_id name title pricePerPerson")
      .lean();

    // — Restoranı client’a açık ve sabit bir formatla gönder —
    const restaurantSafe = (() => {
      const src = rDoc?.restaurantId && typeof rDoc.restaurantId === "object"
        ? rDoc.restaurantId
        : restaurant || {};

      // Koordinatlar GeoJSON: [lng, lat]
      const coords = Array.isArray(src?.location?.coordinates) ? src.location.coordinates : undefined;
      const lng = typeof coords?.[0] === "number" ? coords[0] : undefined;
      const lat = typeof coords?.[1] === "number" ? coords[1] : undefined;

      return {
        _id: String(src?._id || restId || ""),
        name: src?.name || "",
        address: src?.address || "",
        city: src?.city || "",
        mapAddress: src?.mapAddress || "",
        placeId: src?.placeId || "",
        googleMapsUrl: src?.googleMapsUrl || "",
        coordinates: (typeof lat === "number" && typeof lng === "number")
          ? { lat, lng } // 👈 frontend’de direkt kullanılabilir
          : undefined,
        region: src?.region || restaurant?.region || "",
      };
    })();

    res.json({
      _id: rDoc._id,
      // restaurantId alanını objeye sabitle (geri uyum için de tutuyoruz)
      restaurantId: restaurantSafe,          // 👈 artık burada tüm harita alanları var
      restaurant: restaurantSafe,            // (opsiyonel) explicit anahtar
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

      // ✅ Stripe alanları
      paymentProvider: rDoc.paymentProvider || null,
      paymentIntentId: rDoc.paymentIntentId || null,
      depositPaid: !!rDoc.depositPaid,
      depositStatus: rDoc.depositStatus || "pending",
      paidCurrency: rDoc.paidCurrency || null,
      paidAmount: rDoc.paidAmount || 0,
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
        body: `${fmtTR(r.dateTimeUTC)} • QR kodun hazır. Rezzy > Rezervasyonlarım üzerinden erişebilirsin.`,
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

    // --- Geç iptal ise incident ekle (ör: < 2 saat kala iptal)
    try {
      const diffMs = new Date(r.dateTimeUTC) - Date.now();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours < 2 && diffHours > -24) {
        await addIncident({
          userId: r.userId,
          type: "LATE_CANCEL",
          reservationId: r._id.toString(),
        });
      }
    } catch (e) {
      console.warn("[cancelReservation] addIncident warn:", e?.message || e);
    }

    // Restoran — müşteri iptali
    try {
      await notifyRestaurantOwner(r.restaurantId._id, {
        title: "Rezervasyon iptal edildi",
        body: `${fmtTR(r.dateTimeUTC)} tarihli rezervasyon, müşteri tarafından iptal edildi.`,
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

    // --- Risk incident (UNDER_ATTEND / GOOD_ATTEND)
    try {
      if (isUnder) {
        const w = computeUnderAttendWeight({
          partySize: r.partySize,
          arrivedCount: arrived,
          thresholdPercent: threshold,
        });
        if (w > 0) {
          await addIncident({
            userId: r.userId,
            type: "UNDER_ATTEND",
            baseWeight: Math.min(1, w),
            reservationId: r._id.toString(),
          });
        }
      } else {
        await addIncident({
          userId: r.userId,
          type: "GOOD_ATTEND",
          reservationId: r._id.toString(),
        });
      }
    } catch (e) {
      console.warn("[checkin] addIncident warn:", e?.message || e);
    }

    // Müşteri — check-in
    try {
      await notifyUser(r.userId, {
        title: "Check-in tamam ✅",
        body: `İyi eğlenceler! ${fmtTR(r.dateTimeUTC)} rezervasyonun için girişin alındı.`,
        data: { type: "checkin", rid: String(r._id), section: "reservation" },
        key: `cust:checkin:${r._id}`,
        type: "checkin",
      });
    } catch (e) {
      console.warn("[checkin] notifyUser warn:", e?.message || e);
    }

    res.json({
      ok: true,
      rid: String(r._id),
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

    // Not: Risk incident burada tekrar EKLENMİYOR (idempotency).
    // Gerekirse geçmiş incident üzerinde düzeltme mantığı ayrıca ele alınabilir.

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

        // ✅ Stripe alanları
        paymentProvider: r.paymentProvider || null,
        paymentIntentId: r.paymentIntentId || null,
        depositPaid: !!r.depositPaid,
        depositStatus: r.depositStatus || "pending",
        paidCurrency: r.paidCurrency || null,
        paidAmount: r.paidAmount || 0,
      })),
      nextCursor,
    });
  } catch (e) {
    next(e);
  }
};

// controllers/reservation.controller.js

export const reservationStatsByRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { start, end } = req.query;

    const match = { restaurantId: new mongoose.Types.ObjectId(rid) };

    // Opsiyonel tarih aralığı (UTC gün başı/sonu)
    if (start || end) {
      const startDay = start ? new Date(`${start}T00:00:00.000Z`) : null;
      const endDay   = end   ? new Date(`${end}T23:59:59.999Z`) : null;
      match.dateTimeUTC = {};
      if (startDay) match.dateTimeUTC.$gte = startDay;
      if (endDay)   match.dateTimeUTC.$lte = endDay;
    }

    const rows = await Reservation.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalPriceSum:     { $sum: { $ifNull: ["$totalPrice", 0] } },
          depositAmountSum:  { $sum: { $ifNull: ["$depositAmount", 0] } },
        },
      },
    ]);

    // Map'e al
    const by = new Map(rows.map(r => [r._id, r]));

    // Sayaçlar
    const pendingCount   = by.get("pending")?.count   || 0;
    const confirmedCount = by.get("confirmed")?.count || 0;
    const arrivedCount   = by.get("arrived")?.count   || 0;
    const noShowCount    = by.get("no_show")?.count   || 0;
    const cancelledCount = by.get("cancelled")?.count || 0;

    // Yeni metrikler:
    // - depositTotal: sadece confirmed + no_show
    const depositTotal =
      (by.get("confirmed")?.depositAmountSum || 0) +
      (by.get("no_show")?.depositAmountSum   || 0);

    // - revenueAmount:
    //   arrived -> totalPrice
    //   confirmed & no_show -> depositAmount
    const arrivedRevenue   = by.get("arrived")?.totalPriceSum || 0;
    const pendingRevenue   = 0; // gelir saymıyoruz
    const cancelledRevenue = 0; // gelir saymıyoruz
    const depositAsRevenue = depositTotal; // confirmed + no_show depozitoları
    const revenueAmount = arrivedRevenue + depositAsRevenue + pendingRevenue + cancelledRevenue;

    // Eski toplamlar (gerek kalmadıysa kullanmayabilirsin)
    const totalCount  = [...by.values()].reduce((a, r) => a + r.count, 0);

    res.json({
      // Range bilgisini düz yazı istersen:
      rangeLabel: formatRangeLabel(start, end),

      // Kartlardaki sayaçlar
      totalCount,
      pendingCount,
      confirmedCount,
      cancelledCount,
      arrivedCount,
      noShowCount,

      // Dashboard tutarları (İSTENEN)
      revenueAmount,   // → “Toplam Ciro (₺)” burada
      depositTotal,    // → “Toplam Depozito (₺)” burada

      // İstersen durum bazlı ham toplamlar da dursun
      byStatus: rows,
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