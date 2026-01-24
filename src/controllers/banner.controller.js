import mongoose from "mongoose";
import Banner from "../models/Banner.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";

function toObjectId(v) {
  try {
    if (!v) return null;
    const s = String(v);
    if (!mongoose.Types.ObjectId.isValid(s)) return null;
    return new mongoose.Types.ObjectId(s);
  } catch {
    return null;
  }
}

function now() {
  return new Date();
}

/**
 * PUBLIC
 * GET /api/banners?placement=home_top&region=TR
 */
export const listActiveBanners = async (req, res, next) => {
  try {
    const placement = String(req.query.placement || "home_top").trim();
    const region = req.query.region ? String(req.query.region).trim().toUpperCase() : null;

    const t = now();
    const q = {
      placement,
      isActive: true,
      $and: [
        { $or: [{ startAt: null }, { startAt: { $lte: t } }] },
        { $or: [{ endAt: null }, { endAt: { $gte: t } }] },
      ],
    };

    // region verilirse: (region = TR) veya (region = null) döner
    if (region) {
      q.$or = [{ region }, { region: null }];
    }

    const items = await Banner.find(q)
      .sort({ order: 1, createdAt: -1 })
      .select("_id title imageUrl linkUrl placement region order targetType restaurantId")
      .lean();

    const mapped = (items || []).map((b) => ({
      ...b,
      action: {
        type: b.targetType,
        restaurantId: b.restaurantId ? String(b.restaurantId) : null,
      },
    }));

    res.json({ items: mapped });
  } catch (e) {
    next(e);
  }
};

/**
 * ADMIN
 * GET /api/admin/banners?placement=home_top&region=TR&active=true
 */
export const adminListBanners = async (req, res, next) => {
  try {
    const placement = req.query.placement ? String(req.query.placement).trim() : null;
    const region = req.query.region ? String(req.query.region).trim().toUpperCase() : null;
    const active = req.query.active;

    const q = {};
    if (placement) q.placement = placement;
    if (region) q.region = region;
    if (active === "true") q.isActive = true;
    if (active === "false") q.isActive = false;

    const items = await Banner.find(q)
      .sort({ placement: 1, order: 1, createdAt: -1 })
      .lean();

    const mapped = (items || []).map((b) => ({
      ...b,
      action: {
        type: b.targetType,
        restaurantId: b.restaurantId ? String(b.restaurantId) : null,
      },
    }));

    res.json({ items: mapped });
  } catch (e) {
    next(e);
  }
};

/**
 * ADMIN
 * POST /api/admin/banners (multipart/form-data)
 * fields: placement, region?, title?, linkUrl?, order?, isActive?, startAt?, endAt?
 * file: image
 */
export const adminCreateBanner = async (req, res, next) => {
  try {
    const placement = String(req.body?.placement || "home_top").trim();
    const region = req.body?.region ? String(req.body.region).trim().toUpperCase() : null;

    const title = req.body?.title ? String(req.body.title).trim() : null;
    const linkUrl = req.body?.linkUrl ? String(req.body.linkUrl).trim() : null;

    const targetType = req.body?.targetType ? String(req.body.targetType).trim() : null;
    const restaurantId = toObjectId(req.body?.restaurantId);

    if (!targetType || !["delivery", "reservation"].includes(targetType)) {
      return res.status(400).json({ message: "targetType must be delivery or reservation" });
    }
    if (!restaurantId) {
      return res.status(400).json({ message: "restaurantId is required" });
    }

    const order = req.body?.order != null ? Number(req.body.order) : 0;
    const isActive = req.body?.isActive != null ? String(req.body.isActive) !== "false" : true;

    const startAt = req.body?.startAt ? new Date(req.body.startAt) : null;
    const endAt = req.body?.endAt ? new Date(req.body.endAt) : null;

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "image file is required" });
    }

    const up = await uploadBufferToCloudinary(req.file.buffer, {
      folder: process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/banners` : "rezvix/banners",
      resource_type: "image",
    });

    const doc = await Banner.create({
      placement,
      region: region || null,
      title,
      linkUrl,
      targetType,
      restaurantId,
      order: Number.isFinite(order) ? order : 0,
      isActive: !!isActive,
      startAt: isNaN(startAt?.getTime?.()) ? null : startAt,
      endAt: isNaN(endAt?.getTime?.()) ? null : endAt,
      imageUrl: up?.secure_url || up?.url,
      createdBy: toObjectId(req.user?.id),
      updatedBy: toObjectId(req.user?.id),
    });

    res.status(201).json({ ok: true, banner: doc });
  } catch (e) {
    next(e);
  }
};

/**
 * ADMIN
 * PATCH /api/admin/banners/:id
 * body: placement?, region?, title?, linkUrl?, order?, isActive?, startAt?, endAt?
 * optionally multipart: image (replace)
 */
export const adminUpdateBanner = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid banner id" });

    const patch = {};

    if (req.body?.placement != null) patch.placement = String(req.body.placement).trim();
    if (req.body?.region != null) {
      const r = String(req.body.region).trim();
      patch.region = r ? r.toUpperCase() : null;
    }
    if (req.body?.title != null) patch.title = String(req.body.title).trim() || null;
    if (req.body?.linkUrl != null) patch.linkUrl = String(req.body.linkUrl).trim() || null;

    if (req.body?.targetType != null) {
      const t = String(req.body.targetType).trim();
      if (!t) return res.status(400).json({ message: "targetType cannot be empty" });
      if (!["delivery", "reservation"].includes(t)) {
        return res.status(400).json({ message: "targetType must be delivery or reservation" });
      }
      patch.targetType = t;
    }

    if (req.body?.restaurantId != null) {
      const rid = toObjectId(req.body.restaurantId);
      if (!rid) return res.status(400).json({ message: "Invalid restaurantId" });
      patch.restaurantId = rid;
    }

    if (req.body?.order != null) {
      const n = Number(req.body.order);
      patch.order = Number.isFinite(n) ? n : 0;
    }
    if (req.body?.isActive != null) patch.isActive = String(req.body.isActive) !== "false";

    if (req.body?.startAt != null) {
      const d = req.body.startAt ? new Date(req.body.startAt) : null;
      patch.startAt = d && !isNaN(d.getTime()) ? d : null;
    }
    if (req.body?.endAt != null) {
      const d = req.body.endAt ? new Date(req.body.endAt) : null;
      patch.endAt = d && !isNaN(d.getTime()) ? d : null;
    }

    if (req.file?.buffer) {
      const up = await uploadBufferToCloudinary(req.file.buffer, {
        folder: process.env.CLOUDINARY_FOLDER ? `${process.env.CLOUDINARY_FOLDER}/banners` : "rezvix/banners",
        resource_type: "image",
      });
      patch.imageUrl = up?.secure_url || up?.url;
    }

    patch.updatedBy = toObjectId(req.user?.id);

    const doc = await Banner.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ message: "Banner not found" });

    res.json({ ok: true, banner: doc });
  } catch (e) {
    next(e);
  }
};

/**
 * ADMIN
 * DELETE /api/admin/banners/:id
 */
export const adminDeleteBanner = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid banner id" });

    const doc = await Banner.findByIdAndDelete(id).lean();
    if (!doc) return res.status(404).json({ message: "Banner not found" });

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};