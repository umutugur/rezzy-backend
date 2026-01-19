// src/validators/modifier.schema.js
import Joi from "joi";

export const createModifierGroupSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().allow("").max(500).optional(),
  minSelect: Joi.number().integer().min(0).optional(),
  maxSelect: Joi.number().integer().min(1).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),

  options: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().trim().min(1).max(120).required(),
        price: Joi.number().min(0).optional(),
        order: Joi.number().integer().min(0).optional(),
        isActive: Joi.boolean().optional(),
      })
    )
    .optional(),
});

export const updateModifierGroupSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).optional(),
  description: Joi.string().allow("").max(500).optional(),
  minSelect: Joi.number().integer().min(0).optional(),
  maxSelect: Joi.number().integer().min(1).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

export const addModifierOptionSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  price: Joi.number().min(0).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
});

export const updateModifierOptionSchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).optional(),
  price: Joi.number().min(0).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);