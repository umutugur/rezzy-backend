import mongoose from "mongoose";
import UserAddress from "../models/UserAddress.js";

function getUserId(req) {
  const v = req.user?.id ?? req.user?._id;
  return v ? String(v) : null;
}

function assertCustomer(req) {
  const uid = getUserId(req);
  if (!uid) throw { status: 401, message: "Unauthorized" };
  return uid;
}

function normalizePoint(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

function normalizeAddressText(v) {
  return String(v ?? "").trim();
}

export const listMyAddresses = async (req, res, next) => {
  try {
    const userId = assertCustomer(req);

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
    const userId = assertCustomer(req);

    const {
      title = "Ev",
      fullAddress,
      googleMapsUrl = null,
      placeId = null,
      note = "",
      location,
      makeDefault = false,
    } = req.body || {};

    const addr = normalizeAddressText(fullAddress);
    if (!addr || addr.length < 5) {
      throw { status: 400, message: "fullAddress is required" };
    }

    const coords = normalizePoint(location?.coordinates);
    if (!coords) {
      throw { status: 400, message: "location.coordinates must be [lng, lat]" };
    }

    const existingCount = await UserAddress.countDocuments({ userId, isActive: true });
    const willBeDefault = existingCount === 0 ? true : !!makeDefault;

    if (willBeDefault) {
      await UserAddress.updateMany({ userId, isActive: true }, { $set: { isDefault: false } });
    }

    const doc = await UserAddress.create({
      userId: new mongoose.Types.ObjectId(userId),
      title,
      fullAddress: addr,
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
    const userId = assertCustomer(req);
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

    if (title !== undefined) {
      const t = String(title).trim();
      if (t) doc.title = t;
    }

    // fullAddress: DEĞİŞİYORSA -> location.coordinates ZORUNLU
    if (fullAddress !== undefined) {
      const nextAddr = normalizeAddressText(fullAddress);
      if (nextAddr.length < 5) throw { status: 400, message: "fullAddress is too short" };

      const prevAddr = normalizeAddressText(doc.fullAddress);
      const isChanged = nextAddr !== prevAddr;

      if (isChanged) {
        const coords = normalizePoint(location?.coordinates);
        if (!coords) {
          throw {
            status: 400,
            message: "location.coordinates is required when fullAddress changes",
          };
        }
        doc.location = { type: "Point", coordinates: coords };
      }

      doc.fullAddress = nextAddr;
    }

    if (googleMapsUrl !== undefined) doc.googleMapsUrl = googleMapsUrl || null;
    if (placeId !== undefined) doc.placeId = placeId || null;

    if (note !== undefined) doc.note = String(note || "");

    // fullAddress değişmiyorsa location ayrıca güncellenebilir
    if (fullAddress === undefined && location?.coordinates !== undefined) {
      const coords = normalizePoint(location?.coordinates);
      if (!coords) throw { status: 400, message: "location.coordinates must be [lng, lat]" };
      doc.location = { type: "Point", coordinates: coords };
    }

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
    const userId = assertCustomer(req);
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
    const userId = assertCustomer(req);
    const id = req.params.id;

    const doc = await UserAddress.findOne({ _id: id, userId, isActive: true });
    if (!doc) throw { status: 404, message: "Address not found" };

    const wasDefault = !!doc.isDefault;

    doc.isActive = false;
    doc.isDefault = false;
    await doc.save();

    if (wasDefault) {
      const nextDefault = await UserAddress.findOne({ userId, isActive: true }).sort({
        updatedAt: -1,
      });

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