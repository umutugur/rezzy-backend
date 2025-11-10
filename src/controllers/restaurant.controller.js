import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import Menu from "../models/Menu.js";
import Reservation from "../models/Reservation.js";
import { generateQRDataURL, signQR } from "../utils/qr.js";

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

    const rest = await Restaurant.create(body);
    res.json(rest);
  } catch (e) {
    next(e);
  }
};
// Aktif restoranları listele

export const listRestaurants = async (req, res, next) => {
  const start = Date.now();
  console.log("[listRestaurants] START", req.query);

  try {
    const { city, query, region, lat, lng } = req.query || {};
    const filter = { isActive: true };

    if (region) {
      filter.region = String(region).trim().toUpperCase();
    }

    if (city) {
      filter.city = String(city);
    }

    if (query && String(query).trim().length > 0) {
      filter.name = { $regex: String(query).trim(), $options: "i" };
    }

    const hasLat =
      typeof lat !== "undefined" &&
      lat !== null &&
      !Number.isNaN(Number(lat));
    const hasLng =
      typeof lng !== "undefined" &&
      lng !== null &&
      !Number.isNaN(Number(lng));

    if (hasLat && hasLng) {
      const latNum = Number(lat);
      const lngNum = Number(lng);

      console.log("[listRestaurants] geoNear filter:", filter);

      const data = await Restaurant.aggregate([
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
            priceRange: 1,
            rating: 1,
            photos: 1,
            description: 1,
            location: 1,
            mapAddress: 1,
          },
        },
        { $sort: { distance: 1, rating: -1, name: 1 } },
      ]);

      console.log("[listRestaurants] END geoNear", {
        dur: Date.now() - start,
        count: data.length,
      });

      return res.json(data);
    }

    console.log("[listRestaurants] filter:", filter);

    const data = await Restaurant.find(filter)
      .select(
        "name city priceRange rating photos description location mapAddress"
      )
      .sort({ rating: -1, name: 1 });

    console.log("[listRestaurants] END find", {
      dur: Date.now() - start,
      count: data.length,
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
    ];

    const $set = {};
    for (const k of allowed) {
      if (typeof req.body[k] !== "undefined") $set[k] = req.body[k];
    }
    if (typeof $set.region === "string") {
      const r = $set.region.trim().toUpperCase();
      if (r) $set.region = r;
      else delete $set.region;
    }

    // GeoJSON normalize
    if ($set.location && Array.isArray($set.location.coordinates)) {
      const [lng, lat] = $set.location.coordinates.map(Number);
      $set.location = {
        type: "Point",
        coordinates: [lng, lat],
      };
    }

    // Yetki
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
    if (req.user.role !== "admin") {
      const rest = await Restaurant.findById(id).select("owner");
      if (!rest || String(rest.owner) !== String(req.user.id)) {
        throw { status: 403, message: "Forbidden" };
      }
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
    if (!updated)
      throw { status: 404, message: "Restaurant not found" };
    res.json(updated);
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
export const fetchReservationsByRestaurant = async (
  req,
  res,
  next
) => {
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

    const items = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(lim)
      .lean();

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

    const isOwner =
      req.user?.role === "admin" ||
      (req.user?.role === "restaurant" &&
        String(r?.restaurantId?.owner) ===
          String(req.user.id));
    if (!isOwner)
      return next({ status: 403, message: "Forbidden" });

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