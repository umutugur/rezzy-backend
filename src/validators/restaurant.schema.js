import Joi from "joi";
import mongoose from "mongoose";

const objectId = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
};

// Boş alanları doğrulamada kullanmak için yardımcı şema
const anyObject = Joi.object({}).unknown(true);

/**
 * NOT: Mevcut validate middleware'iniz şöyle çalışıyor:
 *   const data = { body:req.body, params:req.params, query:req.query };
 *   schema.validate(data, { ... })
 * Bu nedenle her şema, KÖKTE { body, params, query } anahtarlarını içeren
 * TEK bir Joi şeması olarak tanımlandı.
 */

export const createRestaurantSchema = Joi.object({
  params: anyObject, // bu uçta params yok
  query:  anyObject, // bu uçta query yok
  body: Joi.object({
    name: Joi.string().required(),
    address: Joi.string().allow("", null),
    phone: Joi.string().allow("", null),
    city: Joi.string().allow("", null),
    priceRange: Joi.string().valid("₺","₺₺","₺₺₺","₺₺₺₺").default("₺₺"),
    rating: Joi.number().min(0).max(5).default(0),
    iban: Joi.string().required(),
    // openingHours: { "0": { open, close, isClosed }, ... }
    openingHours: Joi.object().unknown(true),
    photos: Joi.array().items(Joi.string().uri()).default([]),
    description: Joi.string().allow("", null),
    social: Joi.array().items(Joi.string().allow("")).default([]),
    depositRate: Joi.number().min(0).max(100).default(10),
    cancelPolicy: Joi.string().default("24h_100;3h_50;lt3h_0"),
    graceMinutes: Joi.number().min(0).max(120).default(15),
    isActive: Joi.boolean().default(true),
  }),
});

export const listRestaurantsSchema = Joi.object({
  params: anyObject,
  body:   anyObject,
  query: Joi.object({
    city: Joi.string().allow("", null),
  }),
});

export const getRestaurantSchema = Joi.object({
  query:  anyObject,
  body:   anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
});

export const createMenuSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    name: Joi.string().required(),
    items: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        price: Joi.number().min(0).required(),
        description: Joi.string().allow("", null),
        isActive: Joi.boolean().default(true),
      })
    ).default([]),
    isActive: Joi.boolean().default(true),
  }),
});

/* --- Güncelleme --- */
export const updateRestaurantSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    name: Joi.string(),
    address: Joi.string().allow("", null),
    phone: Joi.string().allow("", null),
    city: Joi.string().allow("", null),
    priceRange: Joi.string().valid("₺","₺₺","₺₺₺","₺₺₺₺"),
    rating: Joi.number().min(0).max(5),
    iban: Joi.string(),
    openingHours: Joi.object().unknown(true),
    photos: Joi.array().items(Joi.string().uri()),
    description: Joi.string().allow("", null),
    social: Joi.array().items(Joi.string().allow("")),
    depositRate: Joi.number().min(0).max(100),
    cancelPolicy: Joi.string(),
    graceMinutes: Joi.number().min(0).max(120),
    isActive: Joi.boolean(),
  }).min(1),
});

/* --- Müsaitlik --- */
export const getAvailabilitySchema = Joi.object({
  body: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object({
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    partySize: Joi.number().integer().min(1).default(2),
  }),
});
