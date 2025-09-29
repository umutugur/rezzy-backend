import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import Menu from "../models/Menu.js";
import Reservation from "../models/Reservation.js";
// ---------------------------------------------------------------
// QR kodu üretimi için yardımcı fonksiyonlar. Orijinal projede utils/qr.js
// içerisinde tanımlanan signQR ve generateQRDataURL fonksiyonları burada
// yeniden tanımlandı. QR kodu JSON formatında { rid, mid, ts, sig }
// payload'ını içeren bir Data URL döndürür.
import crypto from "crypto";
import QRCode from "qrcode";

/**
 * QR verisini imzala. rid: rezervasyon ID'si, mid: restoran/işletme ID'si,
 * ts: zaman damgası. Ortaya çıkan sig alanı HMAC SHA-256 imzasıdır.
 */
function signQR({ rid, mid, ts }) {
  const payload = `${rid}.${mid}.${ts}`;
  const secret = process.env.QR_HMAC_SECRET || "rezzy-secret";
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return { payload, sig };
}

/**
 * Verilen bilgilerle QR kodu oluşturup Data URL olarak döndürür. Bu
 * fonksiyon QRCode kütüphanesinin toDataURL metodunu kullanır.
 */
async function generateQRDataURL({ rid, mid, ts }) {
  const { sig } = signQR({ rid, mid, ts });
  const json = JSON.stringify({ rid, mid, ts, sig });
  // QRCode.toDataURL otomatik olarak data:image/png;base64,... döndürür.
  return QRCode.toDataURL(json);
}

/*
 * Bu dosya restoranlar için tüm CRUD işlemlerini ve rezervasyon
 * müsaitlik hesaplamasını içerir. Orijinal depoda sadece temel
 * fonksiyonlar vardı. Aşağıdaki güncellemeler restoran panelinde
 * çalışma saatleri, masa listesi ve rezervasyon politikalarının
 * güncellenebilmesi için yeni uçlar eklenmiştir.
 */

// Yeni restoran oluştur
export const createRestaurant = async (req, res, next) => {
  try {
    const body = { ...req.body, owner: req.user.id };
    const rest = await Restaurant.create(body);
    res.json(rest);
  } catch (e) {
    next(e);
  }
};

// Aktif restoranları listele
export const listRestaurants = async (req, res, next) => {
  try {
    const { city, query } = req.query || {};

    const q = { isActive: true };
    if (city) q.city = String(city);

    // isim araması (case-insensitive)
    if (query && String(query).trim().length > 0) {
      q.name = { $regex: String(query).trim(), $options: "i" };
    }

    const data = await Restaurant.find(q)
      .select("name city priceRange rating photos description")
      .sort({ rating: -1, name: 1 });

    res.json(data);
  } catch (e) {
    next(e);
  }
};

// Tek bir restoran getir (menülerle birlikte)
export const getRestaurant = async (req, res, next) => {
  try {
    const rest = await Restaurant.findById(req.params.id);
    if (!rest) throw { status: 404, message: "Restaurant not found" };
    const menus = await Menu.find({
      restaurantId: rest._id,
      isActive: true,
    });
    res.json({ ...rest.toObject(), menus });
  } catch (e) {
    next(e);
  }
};

// Yeni menü oluştur (panelde kullanılır)
export const createMenu = async (req, res, next) => {
  try {
    // sahibi kontrol et (admin hariç)
    if (req.user.role !== "admin") {
      const r = await Restaurant.findById(req.params.id);
      if (!r || r.owner.toString() !== req.user.id)
        throw { status: 403, message: "Forbidden" };
    }
    const m = await Menu.create({
      ...req.body,
      restaurantId: req.params.id,
    });
    res.json(m);
  } catch (e) {
    next(e);
  }
};

/*
 * Genel restoran güncellemesi.
 * Bu uç, restoranın temel özelliklerini (isim, adres, fotoğraflar vb.)
 * günceller. Panelde masa listesi, çalışma saatleri ve politikalar için
 * ayrı uçlar kullanmalısınız.
 */
export const updateRestaurant = async (req, res, next) => {
  try {
    const allowed = [
      "name",
      "address",
      "phone",
      "city",
      "priceRange",
      "rating",
      "iban",
      "openingHours",
      "photos",
      "description",
      "social",
      "depositRate",
      "cancelPolicy",
      "graceMinutes",
      "isActive",
    ];
    const $set = {};
    for (const k of allowed) {
      if (typeof req.body[k] !== "undefined") $set[k] = req.body[k];
    }
    // Yetki kontrolü: admin değilse sahip olmalı
    if (req.user.role !== "admin") {
      const own = await Restaurant.findById(req.params.id).select("owner");
      if (!own || own.owner.toString() !== req.user.id)
        throw { status: 403, message: "Forbidden" };
    }
    const updated = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true }
    );
    if (!updated)
      throw { status: 404, message: "Restaurant not found" };
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/*
 * Rezervasyon uygunluk hesabı.
 * İstenen tarih ve kişi sayısı için olası zaman dilimlerini hesaplar.
 * slotMinutes, blackoutDates ve min/max party size gibi politikaları dikkate alır.
 */
export const getAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const date = String(req.query.date || "");
    const partySize = Math.max(1, parseInt(req.query.partySize || "1", 10));

    // tarih formatı kontrolü
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw { status: 400, message: "Invalid date format. Expecting YYYY-MM-DD" };
    }

    const r = await Restaurant.findById(id).select(
      "openingHours isActive slotMinutes minPartySize maxPartySize blackoutDates"
    );

    // SADECE YOKSA 404 AT — isActive false olsa bile devam et
    if (!r) throw { status: 404, message: "Restaurant not found" };

    // Kara gün kontrolü
    if (Array.isArray(r.blackoutDates) && r.blackoutDates.includes(date)) {
      return res.json({ date, partySize, slots: [] });
    }
    // Parti büyüklüğü kontrolü
    if (typeof r.minPartySize === "number" && partySize < r.minPartySize) {
      return res.json({ date, partySize, slots: [] });
    }
    if (typeof r.maxPartySize === "number" && partySize > r.maxPartySize) {
      return res.json({ date, partySize, slots: [] });
    }

    // YYYY-MM-DD'i UTC gece yarısına sabitle
    const d = new Date(`${date}T00:00:00Z`);
    const dayIdx = d.getUTCDay(); // 0=Sun .. 6=Sat

    // openingHours: Array of objects { day, open, close, isClosed }
    // Kayıt yoksa varsayılanı kullan (10:00-23:00)
    let oh = Array.isArray(r.openingHours)
      ? r.openingHours.find((h) => h?.day === dayIdx)
      : null;
    if (!oh) {
      oh = { day: dayIdx, open: "10:00", close: "23:00", isClosed: false };
    }

    const slots = [];
    if (oh.isClosed) {
      return res.json({ date, partySize, slots });
    }

    const toMins = (hhmm) => {
      const [h, m] = String(hhmm || "").split(":").map((x) => parseInt(x, 10));
      const hh = Number.isFinite(h) ? h : 0;
      const mm = Number.isFinite(m) ? m : 0;
      return hh * 60 + mm;
    };
    const pad = (n) => String(n).padStart(2, "0");
    const labelOf = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

    const start = toMins(oh.open || "10:00");
    const end   = toMins(oh.close || "23:00");
    const step  = r.slotMinutes && r.slotMinutes > 0 ? r.slotMinutes : 90;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      return res.json({ date, partySize, slots });
    }

    // en az 60 dk oturum varsayımı
    for (let t = start; t + 60 <= end; t += step) {
      const label = labelOf(t);
      const timeISO = new Date(`${date}T${label}:00.000Z`).toISOString();
      slots.push({ timeISO, label, isAvailable: true });
    }

    return res.json({ date, partySize, slots });
  } catch (e) {
    next(e);
  }
};




/*
 * Çalışma saatlerini güncelle
 */
export const updateOpeningHours = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hours = req.body.openingHours;
    // yetki kontrolü
    if (req.user.role !== "admin") {
      const rest = await Restaurant.findById(id).select("owner");
      if (!rest || String(rest.owner) !== String(req.user.id)) {
        throw { status: 403, message: "Forbidden" };
      }
    }
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $set: { openingHours: hours } },
      { new: true }
    );
    if (!updated) throw { status: 404, message: "Restaurant not found" };
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/*
 * Masaları güncelle
 */
export const updateTables = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tables = req.body.tables;
    if (req.user.role !== "admin") {
      const rest = await Restaurant.findById(id).select("owner");
      if (!rest || String(rest.owner) !== String(req.user.id)) {
        throw { status: 403, message: "Forbidden" };
      }
    }
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $set: { tables } },
      { new: true }
    );
    if (!updated) throw { status: 404, message: "Restaurant not found" };
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/*
 * Rezervasyon politikalarını güncelle
 */
export const updatePolicies = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      minPartySize,
      maxPartySize,
      slotMinutes,
      depositRequired,
      depositAmount,
      blackoutDates,
    } = req.body;
    if (req.user.role !== "admin") {
      const rest = await Restaurant.findById(id).select("owner");
      if (!rest || String(rest.owner) !== String(req.user.id)) {
        throw { status: 403, message: "Forbidden" };
      }
    }
    const $set = {};
    if (typeof minPartySize !== "undefined") $set.minPartySize = minPartySize;
    if (typeof maxPartySize !== "undefined") $set.maxPartySize = maxPartySize;
    if (typeof slotMinutes !== "undefined") $set.slotMinutes = slotMinutes;
    if (typeof depositRequired !== "undefined") $set.depositRequired = depositRequired;
    if (typeof depositAmount !== "undefined") $set.depositAmount = depositAmount;
    if (typeof blackoutDates !== "undefined") $set.blackoutDates = blackoutDates;
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $set },
      { new: true }
    );
    if (!updated) throw { status: 404, message: "Restaurant not found" };
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/*
 * Menüler listesini toplu olarak güncelle. Front-end panelinden gelen
 * menü dizisi üzerinden mevcut kayıtlar güncellenir, yeni olanlar
 * eklenir ve listede olmayan menüler pasifleştirilir. Menü nesnesi
 * aşağıdaki alanlara sahip olmalıdır: { _id?, title, description?, pricePerPerson, isActive? }.
 */
export const updateMenus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const list = Array.isArray(req.body.menus) ? req.body.menus : [];
    // yetki kontrolü
    if (req.user.role !== "admin") {
      const rest = await Restaurant.findById(id).select("owner");
      if (!rest || String(rest.owner) !== String(req.user.id)) {
        throw { status: 403, message: "Forbidden" };
      }
    }
    const existing = await Menu.find({ restaurantId: id });
    const map = new Map();
    existing.forEach((m) => map.set(String(m._id), m));
    const result = [];
    for (const m of list) {
      if (m._id && map.has(String(m._id))) {
        const doc = map.get(String(m._id));
        if (typeof m.title !== "undefined") doc.title = m.title;
        if (typeof m.description !== "undefined") doc.description = m.description;
        if (typeof m.pricePerPerson === "number") doc.pricePerPerson = m.pricePerPerson;
        if (typeof m.isActive !== "undefined") doc.isActive = m.isActive;
        await doc.save();
        result.push(doc);
        map.delete(String(m._id));
      } else {
        const created = await Menu.create({
          title: m.title,
          description: m.description,
          pricePerPerson: m.pricePerPerson,
          isActive: m.isActive !== false,
          restaurantId: id,
        });
        result.push(created);
      }
    }
    // listede olmayan menüleri pasifleştir
    for (const doc of map.values()) {
      doc.isActive = false;
      await doc.save();
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/*
 * Fotoğraf ekle. fileUrl alanı, yüklenen görselin tam URL'sini veya
 * Base64 verisini içermelidir. Veritabanında photos alanına eklenir.
 */
export const addPhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fileUrl } = req.body;
    if (!fileUrl) {
      throw { status: 400, message: "fileUrl is required" };
    }
    if (req.user.role !== "admin") {
      const rest = await Restaurant.findById(id).select("owner");
      if (!rest || String(rest.owner) !== String(req.user.id)) {
        throw { status: 403, message: "Forbidden" };
      }
    }
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $push: { photos: fileUrl } },
      { new: true }
    );
    if (!updated) throw { status: 404, message: "Restaurant not found" };
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/*
 * Fotoğraf sil. url alanı, silmek istediğiniz fotoğrafın URL'si olmalıdır.
 */
export const removePhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { url } = req.body;
    if (!url) {
      throw { status: 400, message: "url is required" };
    }
    if (req.user.role !== "admin") {
      const rest = await Restaurant.findById(id).select("owner");
      if (!rest || String(rest.owner) !== String(req.user.id)) {
        throw { status: 403, message: "Forbidden" };
      }
    }
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $pull: { photos: url } },
      { new: true }
    );
    if (!updated) throw { status: 404, message: "Restaurant not found" };
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/*
 * Panelde rezervasyon listesi görüntülemek için sahte bir uç. Gerçek
 * projede Reservation modelinden ilgili kayıtları çekmelisiniz. Burada
 * boş dizi döndürülür.
 */
export const fetchReservationsByRestaurant = async (req, res, next) => {
  try {
    const { id } = req.params;  // <-- route: /:id/reservations
    const { status, limit = 30, cursor } = req.query;

    const mid = (() => {
      try { return new mongoose.Types.ObjectId(String(id)); }
      catch { return null; }
    })();

    // Esnek koşul: ObjectId alanı, string alanı, veya gömülü _id
    const baseOr = [];
    if (mid) baseOr.push({ restaurantId: mid }, { "restaurantId._id": mid });
    baseOr.push({ restaurantId: String(id) }); // string tutulan kayıtlar için

    const q = { $or: baseOr };
    if (status) q.status = String(status);

    const lim = Math.min(100, Number(limit) || 30);
    if (cursor) {
      q._id = { $lt: new mongoose.Types.ObjectId(String(cursor)) };
    }

    const items = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(lim)
      .lean();

    // DEBUG (geçici): sunucu logunda ne geldiğini görün
    console.log("[fetchReservationsByRestaurant] id=", id, "status=", status, "count=", items.length);

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/*
 * Rezervasyon durumu güncelle. Statü "confirmed" olduğunda sahte
 * bir QR kodu üretip geri döndürür. Gerçek projede Reservation
 * dokümanını güncelleyip ilgili alanları değiştirmelisiniz.
 */
export const updateReservationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rawStatus = String(req.body?.status || "").trim().toLowerCase();

    // FE ile BE aynı dili konuşsun
    const allowed = new Set(["pending", "confirmed", "cancelled", "arrived", "no_show"]);
    if (!allowed.has(rawStatus)) {
      return next({ status: 400, message: `Invalid status: ${rawStatus}` });
    }

    const r = await Reservation.findById(id).populate("restaurantId", "_id owner");
    if (!r) return next({ status: 404, message: "Reservation not found" });

    const isOwner =
      req.user?.role === "admin" ||
      (req.user?.role === "restaurant" && String(r?.restaurantId?.owner) === String(req.user.id));
    if (!isOwner) return next({ status: 403, message: "Forbidden" });

    // Durum güncelle
    r.status = rawStatus;

    // Yardımcı timestamp alanları
    if (rawStatus === "cancelled") r.cancelledAt = new Date();
    if (rawStatus === "arrived") {
      r.checkinAt = r.checkinAt || new Date();
      r.arrivedCount = r.arrivedCount || r.partySize;
    }

    // Onay’da QR üret (panelden gösterim için)
    if (rawStatus === "confirmed" && r.restaurantId?._id) {
      const ts = r.dateTimeUTC?.toISOString?.() || new Date().toISOString();
      await generateQRDataURL({
        rid: r._id.toString(),
        mid: r.restaurantId._id.toString(),
        ts,
      });
      r.qrSig = "generated";
    }

    await r.save();

    // FE’in rahatça state patchlemesi için yeterli alanları dönelim
    return res.json({
      _id: r._id.toString(),
      status: r.status,
      dateTimeUTC: r.dateTimeUTC,
      partySize: r.partySize,
      totalPrice: r.totalPrice,
      depositAmount: r.depositAmount,
      receiptUrl: r.receiptUrl,
      restaurantId: r.restaurantId?._id || r.restaurantId,
      updatedAt: r.updatedAt,
    });
  } catch (e) {
    next(e);
  }
};

/*
 * Bir rezervasyon için QR kodu döndürür. Reservation modeline
 * erişemediğimiz için sahte bir QR üretiyoruz.
 */
export const getReservationQR = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Rezerve edilen QR kodunu oluştur ve döndür
    const ts = Date.now();
    const url = await generateQRDataURL({ rid: id, mid: "", ts });
    res.json({ qrUrl: url });
  } catch (e) {
    next(e);
  }
};