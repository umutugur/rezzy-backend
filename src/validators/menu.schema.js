// src/validators/menu.schema.js
import Joi from "joi";

const boolLike = Joi.alternatives().try(
  Joi.boolean(),
  Joi.string().valid("true", "false")
).custom((v) => {
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}, "boolean-like");

const numLike = Joi.alternatives().try(
  Joi.number(),
  Joi.string().regex(/^\d+(\.\d+)?$/)
).custom((v) => Number(v), "number-like");

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
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim().max(30)),
    Joi.string().trim().allow("")
  ).default([]),
  order: numLike.integer().min(0).max(10000).default(0),
  isAvailable: boolLike.default(true),
});

export const updateItemSchema = Joi.object({
  categoryId: Joi.string(),
  title: Joi.string().trim().min(1).max(120),
  description: Joi.string().trim().allow("").max(1000),
  price: numLike.min(0),
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string().trim().max(30)),
    Joi.string().trim().allow("")
  ),
  order: numLike.integer().min(0).max(10000),
  isAvailable: boolLike,
  isActive: boolLike,
  removePhoto: boolLike,
}).min(1);


/* ---------------- LIST QUERY ---------------- */

export const listItemsQuerySchema = Joi.object({
  categoryId: Joi.string().optional(),
});