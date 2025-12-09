// src/validators/branchRequest.schema.js
import Joi from "joi";
import mongoose from "mongoose";

const objectId = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
};

const anyObject = Joi.object({}).unknown(true);

const BUSINESS_TYPES = [
  "restaurant",
  "meyhane",
  "bar",
  "cafe",
  "kebapci",
  "fast_food",
  "coffee_shop",
  "pub",
  "other",
];

const openingHoursSchema = Joi.array()
  .items(
    Joi.object({
      day: Joi.number().integer().min(0).max(6).required(),
      open: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
      close: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
      isClosed: Joi.boolean().default(false),
    })
  )
  .default([]);

/**
 * Org owner / org_admin → POST /org/branch-requests
 */
export const createBranchRequestSchema = Joi.object({
  params: anyObject,
  query: anyObject,
  body: Joi.object({
    organizationId: Joi.string().custom(objectId).required(),

    name: Joi.string().required(),
    region: Joi.string().uppercase().min(2).max(3).required(),

    city: Joi.string().allow("", null),
    address: Joi.string().allow("", null),
    phone: Joi.string().allow("", null),
    iban: Joi.string().allow("", null),

    priceRange: Joi.string().valid("₺", "₺₺", "₺₺₺", "₺₺₺₺").default("₺₺"),
    businessType: Joi.string()
      .valid(...BUSINESS_TYPES)
      .default("restaurant"),

    openingHours: openingHoursSchema,

    description: Joi.string().allow("", null),
    notes: Joi.string().allow("", null).max(1000),
  }).required(),
});

/**
 * Admin → GET /admin/branch-requests
 */
export const adminListBranchRequestsSchema = Joi.object({
  params: anyObject,
  body: anyObject,
  query: Joi.object({
    status: Joi.string()
      .valid("pending", "approved", "rejected")
      .optional(),
    organizationId: Joi.string().custom(objectId).optional(),
    requestedBy: Joi.string().custom(objectId).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
    cursor: Joi.string().custom(objectId).optional(),
  }).unknown(true),
});

/**
 * Admin → POST /admin/branch-requests/:id/approve
 */
export const adminApproveBranchRequestSchema = Joi.object({
  query: anyObject,
  body: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
});

/**
 * Admin → POST /admin/branch-requests/:id/reject
 */
export const adminRejectBranchRequestSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    reason: Joi.string().allow("", null).max(1000),
  }).default({}),
});