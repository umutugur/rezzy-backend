// src/controllers/modifierGroups.controller.js
import mongoose from "mongoose";
import ModifierGroup from "../models/ModifierGroup.js";

import {
  createModifierGroupSchema,
  updateModifierGroupSchema,
  addModifierOptionSchema,
  updateModifierOptionSchema,
} from "../validators/modifier.schema.js";

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

function joiBodyOr400(schema, body) {
  const { error, value } = schema.validate(body || {}, {
    abortEarly: true,
    allowUnknown: true,
    stripUnknown: true,
    convert: true,
  });
  if (error) throw { status: 400, message: error.details[0].message };
  return value;
}

/**
 * GET /api/panel/restaurants/:rid/menu/modifier-groups?includeInactive=true
 */
export async function listModifierGroups(req, res, next) {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) return res.status(400).json({ message: "Invalid restaurant id" });

    const includeInactive = String(req.query.includeInactive || "") === "true";

    const q = { restaurantId: rid };
    if (!includeInactive) q.isActive = true;

    const items = await ModifierGroup.find(q)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    return res.json({ items });
  } catch (e) {
    return next(e);
  }
}

/**
 * POST /api/panel/restaurants/:rid/menu/modifier-groups
 */
export async function createModifierGroup(req, res, next) {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) return res.status(400).json({ message: "Invalid restaurant id" });

    const body = joiBodyOr400(createModifierGroupSchema, req.body);

    const minSelect = Number(body.minSelect ?? 0);
    const maxSelect = Number(body.maxSelect ?? 1);
    if (maxSelect < minSelect) {
      return res.status(400).json({ message: "maxSelect minSelect'ten küçük olamaz." });
    }

    const doc = await ModifierGroup.create({
      restaurantId: rid,
      title: body.title,
      description: String(body.description || ""),
      minSelect,
      maxSelect,
      order: Number(body.order ?? 0),
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
      options: Array.isArray(body.options) ? body.options : [],
    });

    return res.status(201).json({ ok: true, group: doc });
  } catch (e) {
    return next(e);
  }
}

/**
 * PATCH /api/panel/restaurants/:rid/menu/modifier-groups/:gid
 */
export async function updateModifierGroup(req, res, next) {
  try {
    const { rid, gid } = req.params;
    if (!isValidId(rid) || !isValidId(gid)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const body = joiBodyOr400(updateModifierGroupSchema, req.body);

    const patch = {};
    if (body.title != null) patch.title = body.title;
    if (body.description != null) patch.description = String(body.description || "");
    if (body.order != null) patch.order = Number(body.order ?? 0);
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (body.minSelect != null) patch.minSelect = Number(body.minSelect);
    if (body.maxSelect != null) patch.maxSelect = Number(body.maxSelect);

    // min/max tutarlılığı
    const current = await ModifierGroup.findOne({ _id: gid, restaurantId: rid }).lean();
    if (!current) return res.status(404).json({ message: "Modifier group not found" });

    const nextMin = patch.minSelect != null ? patch.minSelect : Number(current.minSelect || 0);
    const nextMax = patch.maxSelect != null ? patch.maxSelect : Number(current.maxSelect || 1);
    if (nextMax < nextMin) {
      return res.status(400).json({ message: "maxSelect minSelect'ten küçük olamaz." });
    }

    const doc = await ModifierGroup.findOneAndUpdate(
      { _id: gid, restaurantId: rid },
      { $set: patch },
      { new: true }
    ).lean();

    return res.json({ ok: true, group: doc });
  } catch (e) {
    return next(e);
  }
}

/**
 * DELETE /api/panel/restaurants/:rid/menu/modifier-groups/:gid (soft)
 */
export async function deleteModifierGroup(req, res, next) {
  try {
    const { rid, gid } = req.params;
    if (!isValidId(rid) || !isValidId(gid)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const doc = await ModifierGroup.findOneAndUpdate(
      { _id: gid, restaurantId: rid },
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Modifier group not found" });
    return res.json({ ok: true });
  } catch (e) {
    return next(e);
  }
}

/**
 * POST /api/panel/restaurants/:rid/menu/modifier-groups/:gid/options
 */
export async function addModifierOption(req, res, next) {
  try {
    const { rid, gid } = req.params;
    if (!isValidId(rid) || !isValidId(gid)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const body = joiBodyOr400(addModifierOptionSchema, req.body);

    const group = await ModifierGroup.findOne({ _id: gid, restaurantId: rid });
    if (!group) return res.status(404).json({ message: "Modifier group not found" });

    group.options.push({
      title: body.title,
      price: Number(body.price ?? 0),
      order: Number(body.order ?? 0),
      isActive: typeof body.isActive === "boolean" ? body.isActive : true,
    });

    await group.save();
    return res.status(201).json({ ok: true, group });
  } catch (e) {
    return next(e);
  }
}

/**
 * PATCH /api/panel/restaurants/:rid/menu/modifier-groups/:gid/options/:oid
 */
export async function updateModifierOption(req, res, next) {
  try {
    const { rid, gid, oid } = req.params;
    if (!isValidId(rid) || !isValidId(gid) || !isValidId(oid)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const body = joiBodyOr400(updateModifierOptionSchema, req.body);

    const group = await ModifierGroup.findOne({ _id: gid, restaurantId: rid });
    if (!group) return res.status(404).json({ message: "Modifier group not found" });

    const opt = group.options.id(oid);
    if (!opt) return res.status(404).json({ message: "Option not found" });

    if (body.title != null) opt.title = body.title;
    if (body.price != null) opt.price = Number(body.price);
    if (body.order != null) opt.order = Number(body.order ?? 0);
    if (typeof body.isActive === "boolean") opt.isActive = body.isActive;

    await group.save();
    return res.json({ ok: true, group });
  } catch (e) {
    return next(e);
  }
}

/**
 * DELETE /api/panel/restaurants/:rid/menu/modifier-groups/:gid/options/:oid (soft)
 */
export async function deleteModifierOption(req, res, next) {
  try {
    const { rid, gid, oid } = req.params;
    if (!isValidId(rid) || !isValidId(gid) || !isValidId(oid)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const group = await ModifierGroup.findOne({ _id: gid, restaurantId: rid });
    if (!group) return res.status(404).json({ message: "Modifier group not found" });

    const opt = group.options.id(oid);
    if (!opt) return res.status(404).json({ message: "Option not found" });

    opt.isActive = false;
    await group.save();
    return res.json({ ok: true, group });
  } catch (e) {
    return next(e);
  }
}