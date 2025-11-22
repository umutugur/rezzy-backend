// src/validators/menu.schema.js
import Joi from "joi";

/**
 * boolLike:
 * - true/false
 * - "true"/"false"
 */
const boolLike = Joi.boolean()
  .truthy("true")
  .falsy("false");

/**
 * numLike:
 * - number
 * - numeric string ("12", "12.5")
 * Joi.number() zaten numeric stringleri convert eder.
 * custom ile bir kez daha Number’a çevirip güvene alıyoruz.
 */
const numLike = Joi.number().custom((v, helpers) => {
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return helpers.error("number.base");
  }
  return n;
}, "number-like");

/**
 * tagsLike:
 * - ["acı","vegan"]
 * - ""  -> []
 * - "acı, vegan" -> ["acı","vegan"]
 */
const tagsLike = Joi.alternatives()
  .try(
    Joi.array().items(Joi.string().trim().max(30)),
    Joi.string().trim().allow("")
  )
  .custom((v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return [];
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [];
  }, "tags-like");

/* ---------------- CATEGORY ---------------- */

export const createCategorySchema = Joi.object({
  title: Joi.string().trim().min(1).max(80).required(),
  description: Joi.string().trim().allow("").max(500).default(""),
  order: numLike.integer().min(0).max(10000).default(0),
});

export const updateCategorySchema = Joi.object({
  title: Joi.string().trim().min(1).max(80),
  description: Joi.string().trim().allow("").max(500),
  order: numLike.integer().min(0).max(10000),
  isActive: boolLike,
}).min(1);

/* ---------------- ITEM ---------------- */

export const createItemSchema = Joi.object({
  categoryId: Joi.string().required(),
  title: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().trim().allow("").max(1000).default(""),
  price: numLike.min(0).required(),
  tags: tagsLike.default([]),
  order: numLike.integer().min(0).max(10000).default(0),
  isAvailable: boolLike.default(true),
});

export const updateItemSchema = Joi.object({
  categoryId: Joi.string(),
  title: Joi.string().trim().min(1).max(120),
  description: Joi.string().trim().allow("").max(1000),
  price: numLike.min(0),
  tags: tagsLike,
  order: numLike.integer().min(0).max(10000),
  isAvailable: boolLike,
  isActive: boolLike,
  removePhoto: boolLike,
}).min(1);

/* ---------------- LIST QUERY ---------------- */

export const listItemsQuerySchema = Joi.object({
  categoryId: Joi.string().optional(),
});