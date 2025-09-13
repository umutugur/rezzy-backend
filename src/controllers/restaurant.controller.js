import Restaurant from "../models/Restaurant.js";
import Menu from "../models/Menu.js";

/* Mevcut fonksiyonlar korunur */

export const createRestaurant = async (req, res, next) => {
  try {
    const body = { ...req.body, owner: req.user.id };
    const rest = await Restaurant.create(body);
    res.json(rest);
  } catch (e) { next(e); }
};

export const listRestaurants = async (req, res, next) => {
  try {
    const q = { isActive: true };
    if (req.query.city) q.city = req.query.city;
    const data = await Restaurant.find(q).select(
      "name city priceRange rating photos description"
    );
    res.json(data);
  } catch (e) { next(e); }
};

export const getRestaurant = async (req, res, next) => {
  try {
    const rest = await Restaurant.findById(req.params.id);
    if (!rest) throw { status: 404, message: "Restaurant not found" };
    const menus = await Menu.find({
      restaurantId: rest._id,
      isActive: true,
    });
    res.json({ ...rest.toObject(), menus });
  } catch (e) { next(e); }
};

export const createMenu = async (req, res, next) => {
  try {
    // owner kontrolü (admin hariç)
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
  } catch (e) { next(e); }
};

/* --- Yeni: Restoran Güncelleme --- */
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
    // Yetki kontrolü: admin değilse sahibi olmalı
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
  } catch (e) { next(e); }
};

/* --- Yeni: Müsaitlik Hesabı --- */
export const getAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const date = String(req.query.date || "");
    const partySize = Math.max(1, parseInt(req.query.partySize || "1", 10));

    // tarih formatı kontrolü
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw {
        status: 400,
        message: "Invalid date format. Expecting YYYY-MM-DD",
      };
    }
    const r = await Restaurant.findById(id).select(
      "openingHours isActive"
    );
    if (!r || !r.isActive)
      throw { status: 404, message: "Restaurant not found" };

    const d = new Date(`${date}T00:00:00Z`);
    const dayIdx = d.getUTCDay(); // 0=Sun .. 6=Sat

    // openingHours: { "0": { open, close, isClosed }, "1": {...}, ... }
    const oh =
      r.openingHours &&
      (r.openingHours[dayIdx] || r.openingHours[String(dayIdx)]);
    const slots = [];
    if (!oh || oh.isClosed) {
      return res.json({ date, partySize, slots });
    }
    const toMins = (hhmm) => {
      const [h, m] = String(hhmm).split(":").map(Number);
      return (isFinite(h) ? h : 0) * 60 + (isFinite(m) ? m : 0);
    };
    const pad = (n) => String(n).padStart(2, "0");
    const labelOf = (mins) =>
      `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
    const start = toMins(oh.open || "10:00");
    const end = toMins(oh.close || "23:00");
    const step = 90; // örnek: 90 dakikalık oturum
    for (let t = start; t + 60 <= end; t += step) {
      const label = labelOf(t);
      const timeISO = new Date(
        `${date}T${label}:00.000Z`
      ).toISOString();
      slots.push({
        timeISO,
        label,
        isAvailable: true, // masa kapasite hesabı yok; hep true
      });
    }
    res.json({ date, partySize, slots });
  } catch (e) { next(e); }
};
