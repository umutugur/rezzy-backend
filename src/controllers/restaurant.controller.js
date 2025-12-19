import mongoose from "mongoose";
import Menu from "../models/Menu.js";
import Reservation from "../models/Reservation.js";
import CoreCategory from "../models/CoreCategory.js";       // ✅ yeni
import MenuCategory from "../models/MenuCategory.js";
import { generateQRDataURL, signQR } from "../utils/qr.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import Restaurant, { BUSINESS_TYPES } from "../models/Restaurant.js";

// --- AuthZ helper (multi-organization aware) ---
function canManageRestaurant(user, restaurantId) {
  if (!user) return false;
  if (user.role === "admin") return true;

  const targetId = String(restaurantId);

  // Legacy single-restaurant binding
  if (user.restaurantId && String(user.restaurantId) === targetId) return true;

  // New membership binding
  const rms = Array.isArray(user.restaurantMemberships)
    ? user.restaurantMemberships
    : [];

  return rms.some((m) => {
     // backend token payload'ında "restaurant" olabilir; client user'da "id" var.
   const restRef = m?.restaurant ?? m?.id ?? null;
  const restId =
     restRef && typeof restRef === "object" && restRef._id
       ? restRef._id
       : restRef;
    const role = String(m?.role || "");
    return (
     String(restId) === targetId &&
     ["location_manager", "staff"].includes(role)
   );
  });
}

/* ---------- CREATE RESTAURANT ---------- */
export const createRestaurant = async (req, res, next) => {
  try {
    const body = { ...req.body, owner: req.user.id };

    if (typeof body.region === "string") {
      const r = body.region.trim().toUpperCase();
      body.region = r || undefined;
    }

    // GeoJSON location normalize
    if (body.location && Array.isArray(body.location.coordinates)) {
      const [lng, lat] = body.location.coordinates.map(Number);
      body.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }

    // ✅ 1) Restoranı oluştur
    const rest = await Restaurant.create(body);

    // ✅ 2) Core kategorileri çek (businessType bazlı)
    const businessType = rest.businessType || "restaurant";
    const lang = (rest.preferredLanguage || "tr").toLowerCase();

    const coreCats = await CoreCategory.find({
      isActive: true,
      businessTypes: businessType, // Array içinde eşleşme
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    // ✅ 3) Restoran altına kopyala
    if (coreCats.length) {
      const docs = coreCats.map((c) => {
        const pack = c.i18n?.[lang] || c.i18n?.tr; // fallback tr
        return {
          restaurantId: rest._id,
          coreCategoryId: c._id,
          title: pack?.title || c.key,
          description: pack?.description || "",
          order: Number(c.order || 0),
          isActive: true,
        };
      });

      await MenuCategory.insertMany(docs);
    }

    res.json(rest);
  } catch (e) {
    next(e);
  }
};
// Aktif restoranları listele
// Aktif restoranları listele
export const listRestaurants = async (req, res, next) => {
  const start = Date.now();
  console.log("[listRestaurants] START", req.query);

  try {
    const {
      city,
      query,
      region,
      lat,
      lng,
      people,
      date,
      timeRange,
      budget,
      style,
      fromAssistant,
    } = req.query || {};

    // Her zaman: sadece aktif restoranlar
    const filter = { isActive: true };
    const andClauses = [];

    if (region) filter.region = String(region).trim().toUpperCase();
    if (city) filter.city = String(city).trim();

    // İsim araması (küçük dataset için regex OK)
    if (query && String(query).trim().length > 0) {
      const q = String(query).trim();
      filter.name = { $regex: q, $options: "i" };
      // Büyük veri olursa text index'e geçebiliriz
      // filter.$text = { $search: q };
    }

    // --- Assistant tabanlı ek filtreler (people / budget / style) ---
    let partySize = null;
    if (people !== undefined) {
      const n = Number(people);
      if (Number.isFinite(n) && n > 0 && n <= 50) {
        partySize = n;
      }
    }

    // minPartySize / maxPartySize ile yaklaşık kişi sayısı filtresi
    if (partySize !== null) {
      andClauses.push({
        $or: [
          { minPartySize: { $lte: partySize } },
          { minPartySize: { $exists: false } },
        ],
      });
      andClauses.push({
        $or: [
          { maxPartySize: { $gte: partySize } },
          { maxPartySize: { $exists: false } },
        ],
      });
    }

    // Bütçe → priceRange
    if (budget && typeof budget === "string" && budget.trim()) {
      filter.priceRange = budget.trim();
    }

    // Tarz / kategori → businessType + açıklama/isim üzerinden arama
    if (style && typeof style === "string" && style.trim()) {
      const sRaw = style.trim();
      const sNorm = sRaw.replace(/\s+/g, "_"); // "fast food" → "fast_food"

      andClauses.push({
        $or: [
          { businessType: { $regex: sNorm, $options: "i" } },
          { description: { $regex: sRaw, $options: "i" } },
          { name: { $regex: sRaw, $options: "i" } },
        ],
      });
    }

    if (andClauses.length) {
      if (filter.$and) filter.$and = filter.$and.concat(andClauses);
      else filter.$and = andClauses;
    }

    const hasLat =
      lat !== undefined &&
      lat !== null &&
      !Number.isNaN(Number(lat));
    const hasLng =
      lng !== undefined &&
      lng !== null &&
      !Number.isNaN(Number(lng));

    // --- Yardımcı: foto filtresi (yalnızca http/https, base64 yok) ---
    const sanitizePhotos = (arr) => {
      if (!Array.isArray(arr) || arr.length === 0) return [];
      const first = String(arr[0] || "");
      if (!first) return [];
      if (first.startsWith("data:")) return []; // base64’i listeye koyma
      if (first.length > 1024) return []; // anormal uzun stringleri ele
      if (!/^https?:\/\//i.test(first)) return []; // sadece http/https
      return [first]; // sadece ilk foto ile dönüyoruz
    };

    // -----------------------------
    // 1) Konumlu istek (geoNear)
    // -----------------------------
    if (hasLat && hasLng) {
      const latNum = Number(lat);
      const lngNum = Number(lng);

      console.log("[listRestaurants] geoNear filter:", filter);
      const geoStart = Date.now();

      const raw = await Restaurant.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [lngNum, latNum] },
            distanceField: "distance",
            spherical: true,
            query: filter,
          },
        },
        {
          $project: {
            name: 1,
            city: 1,
            region: 1,
            priceRange: 1,
            rating: 1,
            location: 1,
            mapAddress: 1,
            photos: { $slice: ["$photos", 1] },
            logoUrl: 1,
            distance: 1,
          },
        },
        { $sort: { distance: 1, rating: -1, name: 1 } },
      ]);

      const geoDur = Date.now() - geoStart;

      if (raw.length > 0) {
        const data = raw.map((d) => ({
          _id: d._id,
          name: d.name,
          city: d.city,
          region: d.region,
          priceRange: d.priceRange,
          rating: d.rating,
          location: d.location,
          mapAddress: d.mapAddress,
          photos: sanitizePhotos(d.photos),
          logoUrl: d.logoUrl || null,
          // distance şimdilik gönderilmiyor
        }));

        const size = JSON.stringify(data).length;
        console.log("[listRestaurants] END geoNear", {
          dur: Date.now() - start,
          qdur: geoDur,
          count: data.length,
          size,
        });

        // ✅ Konumu olan restoranlar bulundu → direkt dön
        return res.json(data);
      }

      // ✅ Hiç konumlu restoran yoksa normal find()’a düş
      console.log(
        "[listRestaurants] geoNear empty, falling back to find()",
        { geoDur, filter }
      );
    }

    // -----------------------------
    // 2) Normal istek (region / city)
    // -----------------------------
    console.log("[listRestaurants] filter:", filter);

    const qStart = Date.now();

    const baseQuery = Restaurant.find(filter)
      .select(
        "name city region priceRange rating location mapAddress photos logoUrl"
      )
      .slice("photos", 1)
      .sort({ rating: -1, name: 1 })
      .lean();

    const shouldHintIndex = !query && !hasLat && !hasLng;
    if (shouldHintIndex) {
      baseQuery.hint("isActive_region_rating_name");
    }

    const docs = await baseQuery.exec();
    const qdur = Date.now() - qStart;

    const data = docs.map((d) => ({
      _id: d._id,
      name: d.name,
      city: d.city,
      region: d.region,
      priceRange: d.priceRange,
      rating: d.rating,
      location: d.location,
      mapAddress: d.mapAddress,
      photos: sanitizePhotos(d.photos),
      logoUrl: d.logoUrl || null,
    }));

    const size = JSON.stringify(data).length;
    console.log("[listRestaurants] END find", {
      qdur,
      dur: Date.now() - start,
      count: data.length,
      size,
    });

    return res.json(data);
  } catch (e) {
    console.error("[listRestaurants] ERROR", e);
    return next(e);
  }
};


/* ---------- GET RESTAURANT (menus) ---------- */
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

/* ---------- CREATE MENU ---------- */
export const createMenu = async (req, res, next) => {
  try {
    if (!canManageRestaurant(req.user, req.params.id)) {
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

/* ---------- UPDATE RESTAURANT (genel) ---------- */
export const updateRestaurant = async (req, res, next) => {
  try {
    const allowed = [
      "name",
      "address",
      "phone",
      "city",
      "region",
      "priceRange",
      "rating",
      "iban",
      "ibanName",
      "bankName",
      "email",
      "openingHours",
      "photos",
      "description",
      "social",
      "depositRate",
      "cancelPolicy",
      "graceMinutes",
      "isActive",
      "location",
      "mapAddress",
      "placeId",
      "googleMapsUrl",

      // ✅ NEW
      "businessType",
    ];

    const $set = {};
    for (const k of allowed) {
      if (typeof req.body[k] !== "undefined") $set[k] = req.body[k];
    }

    // photos sanitize aynı kalsın
    if (Array.isArray($set.photos)) {
      $set.photos = $set.photos.filter(
        (p) => typeof p === "string" && (p.startsWith("http://") || p.startsWith("https://"))
      );
      if ($set.photos.length === 0) delete $set.photos;
    }

    if (typeof $set.region === "string") {
      const r = $set.region.trim().toUpperCase();
      if (r) $set.region = r;
      else delete $set.region;
    }

    // ✅ businessType normalize + core list kontrol
    if (typeof $set.businessType === "string") {
      const bt = $set.businessType.trim().toLowerCase();
      if (BUSINESS_TYPES.includes(bt)) $set.businessType = bt;
      else $set.businessType = "other";
    }

    if ($set.location && Array.isArray($set.location.coordinates)) {
      const [lng, lat] = $set.location.coordinates.map(Number);
      $set.location = { type: "Point", coordinates: [lng, lat] };
    }

    if (!canManageRestaurant(req.user, req.params.id)) {
      throw { status: 403, message: "Forbidden" };
    }

    const updated = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true }
    );

    if (!updated) throw { status: 404, message: "Restaurant not found" };

    res.json(updated);
  } catch (e) {
    next(e);
  }
};

/* ---------- getAvailability (değişmedi) ---------- */
// ... (buradan sonrası senin mevcut dosyandakiyle aynı, dokunmadım)

export const getAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const date = String(req.query.date || "");
    const partySize = Math.max(1, parseInt(req.query.partySize || "1", 10));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw { status: 400, message: "Invalid date format. Expecting YYYY-MM-DD" };
    }

    const r = await Restaurant.findById(id).select(
      "openingHours isActive slotMinutes minPartySize maxPartySize blackoutDates"
    );

    if (!r) throw { status: 404, message: "Restaurant not found" };

    if (!r.isActive) {
      return res.json({ date, partySize, slots: [] });
    }

    if (Array.isArray(r.blackoutDates) && r.blackoutDates.includes(date)) {
      return res.json({ date, partySize, slots: [] });
    }
    if (typeof r.minPartySize === "number" && partySize < r.minPartySize) {
      return res.json({ date, partySize, slots: [] });
    }
    if (typeof r.maxPartySize === "number" && partySize > r.maxPartySize) {
      return res.json({ date, partySize, slots: [] });
    }

    const d = new Date(`${date}T00:00:00Z`);
    const dayIdx = d.getUTCDay();

    let oh = Array.isArray(r.openingHours)
      ? r.openingHours.find((h) => h?.day === dayIdx)
      : null;
    if (!oh) oh = { day: dayIdx, open: "10:00", close: "23:00", isClosed: false };

    const slots = [];
    if (oh.isClosed) return res.json({ date, partySize, slots });

    const toMins = (hhmm) => {
      const [h, m] = String(hhmm || "").split(":").map((x) => parseInt(x, 10));
      return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    };
    const pad = (n) => String(n).padStart(2, "0");
    const labelOf = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

    const start = toMins(oh.open || "10:00");
    const end = toMins(oh.close || "23:00");
    const step = r.slotMinutes && r.slotMinutes > 0 ? r.slotMinutes : 90;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      return res.json({ date, partySize, slots });
    }

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
export const updateOpeningHours = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hours = req.body.openingHours;
    if (!canManageRestaurant(req.user, id)) {
      throw { status: 403, message: "Forbidden" };
    }
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $set: { openingHours: hours } },
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
 * Masaları güncelle
 */
export const updateTables = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tables = req.body.tables;
    if (!canManageRestaurant(req.user, id)) {
      throw { status: 403, message: "Forbidden" };
    }
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $set: { tables } },
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
      checkinWindowBeforeMinutes,
      checkinWindowAfterMinutes,
    } = req.body;
    if (!canManageRestaurant(req.user, id)) {
      throw { status: 403, message: "Forbidden" };
    }
    const $set = {};
    if (typeof minPartySize !== "undefined")
      $set.minPartySize = minPartySize;
    if (typeof maxPartySize !== "undefined")
      $set.maxPartySize = maxPartySize;
    if (typeof slotMinutes !== "undefined")
      $set.slotMinutes = slotMinutes;
    if (typeof depositRequired !== "undefined")
      $set.depositRequired = depositRequired;
    if (typeof depositAmount !== "undefined")
      $set.depositAmount = depositAmount;
    if (typeof blackoutDates !== "undefined")
      $set.blackoutDates = blackoutDates;
    if (
      typeof checkinWindowBeforeMinutes !== "undefined"
    )
      $set.checkinWindowBeforeMinutes =
        checkinWindowBeforeMinutes;
    if (typeof checkinWindowAfterMinutes !== "undefined")
      $set.checkinWindowAfterMinutes =
        checkinWindowAfterMinutes;
    const updated = await Restaurant.findByIdAndUpdate(
      id,
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
 * Menüler toplu güncelle
 */
export const updateMenus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const list = Array.isArray(req.body.menus)
      ? req.body.menus
      : [];
    if (!canManageRestaurant(req.user, id)) {
      throw { status: 403, message: "Forbidden" };
    }
    const existing = await Menu.find({ restaurantId: id });
    const map = new Map();
    existing.forEach((m) => map.set(String(m._id), m));
    const result = [];
    for (const m of list) {
      if (m._id && map.has(String(m._id))) {
        const doc = map.get(String(m._id));
        if (typeof m.title !== "undefined") doc.title = m.title;
        if (typeof m.description !== "undefined")
          doc.description = m.description;
        if (typeof m.pricePerPerson === "number")
          doc.pricePerPerson = m.pricePerPerson;
        if (typeof m.isActive !== "undefined")
          doc.isActive = m.isActive;
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
    // listede olmayanları pasifleştir
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
 * Fotoğraf ekle
 */
export const addPhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { fileUrl } = req.body || {};
    const f = req.file;

    // Yetki kontrolü (multi-org aware)
    if (!canManageRestaurant(req.user, id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    let finalUrl = null;

    // 0) Multipart geldiyse en güvenlisi bu
    if (f?.buffer) {
      const uploadResult = await uploadBufferToCloudinary(f.buffer, {
        folder:
          process.env.CLOUDINARY_FOLDER_RESTAURANTS ||
          "rezvix/restaurants",                    // ⬅️ restoranlar için ayrı klasör
        resource_type: "image",
      });
      finalUrl = uploadResult.secure_url;
    }
    // 1) Doğrudan http/https URL
    else if (fileUrl && (fileUrl.startsWith("http://") || fileUrl.startsWith("https://"))) {
      finalUrl = fileUrl.trim();
    }
    // 2) data URL (base64) fallback
    else if (fileUrl && fileUrl.startsWith("data:")) {
      const match = fileUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ message: "Invalid data URL format" });
      }
      const buffer = Buffer.from(match[2], "base64");
      const uploadResult = await uploadBufferToCloudinary(buffer, {
        folder:
          process.env.CLOUDINARY_FOLDER_RESTAURANTS ||
          "rezvix/restaurants",
        resource_type: "image",
      });
      finalUrl = uploadResult.secure_url;
    } else {
      return res.status(400).json({
        message:
          "Görsel bulunamadı. Multipart 'file' alanı gönderin ya da 'fileUrl' olarak http/https veya data URL verin.",
      });
    }

    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $push: { photos: finalUrl } },
      { new: true }
    ).select("_id photos");

    if (!updated) return res.status(404).json({ message: "Restaurant not found" });

    return res.json({ ok: true, photos: updated.photos || [] });
  } catch (e) {
    next(e);
  }
};

/*
 * Logo ekle / değiştir
 */
export const uploadLogo = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { fileUrl } = req.body || {};
    const f = req.file;

    if (!id) {
      return res.status(400).json({ message: "Restaurant id required" });
    }

    // Yetki kontrolü (multi-org aware)
    if (!canManageRestaurant(req.user, id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    let finalUrl = null;

    // 0) Multipart file (tercih edilen)
    if (f?.buffer) {
      const uploadResult = await uploadBufferToCloudinary(f.buffer, {
        folder:
          process.env.CLOUDINARY_FOLDER_RESTAURANT_LOGOS ||
          process.env.CLOUDINARY_FOLDER_RESTAURANTS ||
          "rezvix/restaurants/logos",
        resource_type: "image",
      });
      finalUrl = uploadResult.secure_url;
    }
    // 1) Direkt http/https URL
    else if (
      fileUrl &&
      (fileUrl.startsWith("http://") || fileUrl.startsWith("https://"))
    ) {
      finalUrl = fileUrl.trim();
    }
    // 2) data URL (base64) fallback
    else if (fileUrl && fileUrl.startsWith("data:")) {
      const match = fileUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ message: "Invalid data URL format" });
      }
      const buffer = Buffer.from(match[2], "base64");
      const uploadResult = await uploadBufferToCloudinary(buffer, {
        folder:
          process.env.CLOUDINARY_FOLDER_RESTAURANT_LOGOS ||
          process.env.CLOUDINARY_FOLDER_RESTAURANTS ||
          "rezvix/restaurants/logos",
        resource_type: "image",
      });
      finalUrl = uploadResult.secure_url;
    } else {
      return res.status(400).json({
        message:
          "Logo bulunamadı. Multipart 'file' alanı gönderin ya da 'fileUrl' olarak http/https veya data URL verin.",
      });
    }

    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $set: { logoUrl: finalUrl } },
      { new: true }
    ).select("_id name logoUrl");

    if (!updated) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    return res.json({ ok: true, logoUrl: updated.logoUrl });
  } catch (e) {
    next(e);
  }
};

/*
 * Fotoğraf sil
 */
export const removePhoto = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { url } = req.body;
    if (!url) {
      throw { status: 400, message: "url is required" };
    }
    if (!canManageRestaurant(req.user, id)) {
      throw { status: 403, message: "Forbidden" };
    }
    const updated = await Restaurant.findByIdAndUpdate(
      id,
      { $pull: { photos: url } },
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
 * Panel rezervasyon listesi
 */
export const fetchReservationsByRestaurant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, limit = 30, cursor } = req.query;

    const mid = (() => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })();

    const baseOr = [];
    if (mid) baseOr.push({ restaurantId: mid }, { "restaurantId._id": mid });
    baseOr.push({ restaurantId: String(id) });

    const q = { $or: baseOr };
    if (status) q.status = String(status);

    const lim = Math.min(100, Number(limit) || 30);
    if (cursor) {
      q._id = {
        $lt: new mongoose.Types.ObjectId(String(cursor)),
      };
    }

    // 🔹 Eski: lean ham doküman
    // const items = await Reservation.find(q)
    //   .sort({ _id: -1 })
    //   .limit(lim)
    //   .lean();

    // 🔹 Yeni: userId populate + map ile displayName / guestName / user ekleme
    const docs = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(lim)
      .populate("userId", "_id name fullName displayName email phone")
      .lean();

    const items = docs.map((r) => {
      // user dokümanını çek
      const userDoc =
        r.userId && typeof r.userId === "object" ? r.userId : null;

      // Kullanıcı objesi (Row.user ile uyumlu)
      const user = userDoc
        ? {
            _id: userDoc._id,
            name:
              userDoc.name ||
              userDoc.fullName ||
              userDoc.displayName ||
              "",
            email: userDoc.email || "",
            phone: userDoc.phone || "",
          }
        : null;

      // Guest / müşteri isimlerini toparla
      const guestName =
        (r.guestName && String(r.guestName).trim()) ||
        (r.customerName && String(r.customerName).trim()) ||
        (r.contactName && String(r.contactName).trim()) ||
        (r.name && String(r.name).trim()) ||
        null;

      // displayName öncelik sırası:
      // 1) r.displayName
      // 2) guest/cust/contact/name
      // 3) userDoc.displayName / fullName / name
      // 4) userDoc.email
      // 5) fallback
      const displayName =
        (r.displayName && String(r.displayName).trim()) ||
        guestName ||
        (userDoc?.displayName &&
          String(userDoc.displayName).trim()) ||
        (userDoc?.fullName && String(userDoc.fullName).trim()) ||
        (userDoc?.name && String(userDoc.name).trim()) ||
        (userDoc?.email && String(userDoc.email).trim()) ||
        "İsimsiz misafir";

      return {
        ...r,
        // userId tarafını stringe normalize et (populate sonrası object gelebilir)
        userId: userDoc ? String(userDoc._id) : r.userId,
        user,
        displayName,
        guestName,
      };
    });

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/*
 * Rezervasyon durumu güncelle
 */
export const updateReservationStatus = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;
    const rawStatus = String(
      req.body?.status || ""
    )
      .trim()
      .toLowerCase();
    const allowed = new Set([
      "pending",
      "confirmed",
      "cancelled",
      "arrived",
      "no_show",
    ]);
    if (!allowed.has(rawStatus))
      return next({
        status: 400,
        message: `Invalid status: ${rawStatus}`,
      });

    const r = await Reservation.findById(id).populate(
      "restaurantId",
      "_id owner"
    );
    if (!r)
      return next({
        status: 404,
        message: "Reservation not found",
      });

    const restId = r?.restaurantId?._id || r?.restaurantId;
if (!canManageRestaurant(req.user, restId)) {
  return next({ status: 403, message: "Forbidden" });
}

    r.status = rawStatus;
    if (rawStatus === "confirmed" && !r.qrTs) {
      r.qrTs = r.dateTimeUTC || r.createdAt || new Date();
    }
    if (rawStatus === "cancelled") r.cancelledAt = new Date();
    if (rawStatus === "arrived") {
      r.checkinAt = r.checkinAt || new Date();
      r.arrivedCount = r.arrivedCount || r.partySize;
    }

    await r.save();

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
 * Rezervasyon QR
 */
export const getReservationQR = async (req, res, next) => {
  try {
    const { id: rid } = req.params;

    const r = await Reservation.findById(rid)
      .select("restaurantId dateTimeUTC qrTs createdAt")
      .lean();
    if (!r)
      return next({
        status: 404,
        message: "Reservation not found",
      });

    const mid = (
      r.restaurantId?._id ||
      r.restaurantId ||
      ""
    ).toString();
    if (!mid)
      return next({
        status: 400,
        message: "Reservation has no restaurantId",
      });

    const baseDate =
      r.qrTs || r.dateTimeUTC || r.createdAt || new Date();
    const ts = baseDate;

    const qrUrl = await generateQRDataURL({ rid, mid, ts });
    const { payload } = signQR({ rid, mid, ts });

    res.json({ qrUrl, payload, rid, mid, ts });
  } catch (e) {
    next(e);
  }
};