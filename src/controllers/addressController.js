import mongoose from "mongoose";
import UserAddress from "../models/UserAddress.js";

function assertCustomer(req) {
  // admin de kullanabilir istersen kaldırabilirsin
  if (!req.user?.id) throw { status: 401, message: "Unauthorized" };
}

function normalizePoint(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

export const listMyAddresses = async (req, res, next) => {
  try {
    assertCustomer(req);
    const userId = req.user.id;

    const rows = await UserAddress.find({ userId, isActive: true })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean();

    return res.json({ items: rows });
  } catch (e) {
    return next(e);
  }
};

export const createAddress = async (req, res, next) => {
  try {
    assertCustomer(req);
    const userId = req.user.id;

    const {
      title = "Ev",
      fullAddress,
      googleMapsUrl = null,
      placeId = null,
      note = "",
      location,
      makeDefault = false,
    } = req.body || {};

    if (!fullAddress || String(fullAddress).trim().length < 5) {
      throw { status: 400, message: "fullAddress is required" };
    }

    const coords = normalizePoint(location?.coordinates);
    if (!coords) throw { status: 400, message: "location.coordinates must be [lng, lat]" };

    // Kullanıcının aktif adres sayısı
    const existingCount = await UserAddress.countDocuments({ userId, isActive: true });
    const willBeDefault = existingCount === 0 ? true : !!makeDefault;

    // default yapılacaksa diğerlerini kapat
    if (willBeDefault) {
      await UserAddress.updateMany({ userId, isActive: true }, { $set: { isDefault: false } });
    }

    const doc = await UserAddress.create({
      userId: new mongoose.Types.ObjectId(userId),
      title,
      fullAddress: String(fullAddress).trim(),
      googleMapsUrl,
      placeId,
      note,
      location: { type: "Point", coordinates: coords },
      isDefault: willBeDefault,
      isActive: true,
    });

    return res.status(201).json({ item: doc });
  } catch (e) {
    return next(e);
  }
};

export const updateAddress = async (req, res, next) => {
  try {
    assertCustomer(req);
    const userId = req.user.id;
    const id = req.params.id;

    const doc = await UserAddress.findOne({ _id: id, userId, isActive: true });
    if (!doc) throw { status: 404, message: "Address not found" };

    const {
      title,
      fullAddress,
      googleMapsUrl,
      placeId,
      note,
      location,
      makeDefault,
    } = req.body || {};

    if (title !== undefined) doc.title = String(title).trim() || doc.title;

    if (fullAddress !== undefined) {
      const v = String(fullAddress).trim();
      if (v.length < 5) throw { status: 400, message: "fullAddress is too short" };
      doc.fullAddress = v;
    }

    if (googleMapsUrl !== undefined) doc.googleMapsUrl = googleMapsUrl || null;
    if (placeId !== undefined) doc.placeId = placeId || null;
    if (note !== undefined) doc.note = String(note || "");

    if (location?.coordinates !== undefined) {
      const coords = normalizePoint(location?.coordinates);
      if (!coords) throw { status: 400, message: "location.coordinates must be [lng, lat]" };
      doc.location = { type: "Point", coordinates: coords };
    }

    // Default ayarı istenmişse
    if (makeDefault === true) {
      await UserAddress.updateMany({ userId, isActive: true }, { $set: { isDefault: false } });
      doc.isDefault = true;
    }

    await doc.save();
    return res.json({ item: doc });
  } catch (e) {
    return next(e);
  }
};

export const makeDefaultAddress = async (req, res, next) => {
  try {
    assertCustomer(req);
    const userId = req.user.id;
    const id = req.params.id;

    const doc = await UserAddress.findOne({ _id: id, userId, isActive: true });
    if (!doc) throw { status: 404, message: "Address not found" };

    await UserAddress.updateMany({ userId, isActive: true }, { $set: { isDefault: false } });
    doc.isDefault = true;
    await doc.save();

    return res.json({ item: doc });
  } catch (e) {
    return next(e);
  }
};

export const deleteAddress = async (req, res, next) => {
  try {
    assertCustomer(req);
    const userId = req.user.id;
    const id = req.params.id;

    const doc = await UserAddress.findOne({ _id: id, userId, isActive: true });
    if (!doc) throw { status: 404, message: "Address not found" };

    const wasDefault = !!doc.isDefault;

    doc.isActive = false;
    doc.isDefault = false;
    await doc.save();

    // default silindiyse başka bir adresi default yap
    if (wasDefault) {
      const nextDefault = await UserAddress.findOne({ userId, isActive: true }).sort({ updatedAt: -1 });
      if (nextDefault) {
        await UserAddress.updateMany({ userId, isActive: true }, { $set: { isDefault: false } });
        nextDefault.isDefault = true;
        await nextDefault.save();
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
};