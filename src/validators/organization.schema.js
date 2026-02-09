import Joi from "joi";
import mongoose from "mongoose";

const objectId = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
};

const anyObject = Joi.object({}).unknown(true);
const LANGS = ["tr", "en", "ru", "el"];

/* ---------- LIST ORGANIZATIONS (ADMIN) ---------- */
export const listOrganizationsAdminSchema = Joi.object({
  params: anyObject,
  body: anyObject,
  query: Joi.object({
    query: Joi.string().allow("", null),
    region: Joi.string().trim().uppercase().min(2).max(3).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    cursor: Joi.string().custom(objectId).optional(),
  }).unknown(true),
});

/* ---------- GET ORGANIZATION DETAIL (ADMIN) ---------- */
export const getOrganizationAdminSchema = Joi.object({
  query: anyObject,
  body: anyObject,
  params: Joi.object({
    oid: Joi.string().custom(objectId).required(),
  }),
});

/* ---------- CREATE ORGANIZATION (ADMIN) ---------- */
export const createOrganizationAdminSchema = Joi.object({
  query: anyObject,
  params: anyObject,
  body: Joi.object({
    name: Joi.string().min(2).max(200).required(),
    legalName: Joi.string().allow("", null),
    logoUrl: Joi.string().uri().allow("", null),
    region: Joi.string().trim().uppercase().min(2).max(3).required(),
    defaultLanguage: Joi.string().valid(...LANGS).default("tr"),
    description: Joi.string().allow("", null),
    taxNumber: Joi.string().allow("", null),
    taxOffice: Joi.string().allow("", null),
  }),
});
