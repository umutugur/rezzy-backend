import Joi from "joi";

const oid = () => Joi.string().regex(/^[0-9a-fA-F]{24}$/).message("invalid objectId");

export const createRestaurantSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().min(2).max(120).required(),
    address: Joi.string().allow(""),
    phone: Joi.string().allow(""),
    city: Joi.string().allow(""),
    priceRange: Joi.string().valid("₺","₺₺","₺₺₺","₺₺₺₺").default("₺₺"),
    iban: Joi.string().required(),
    description: Joi.string().allow(""),
    depositRate: Joi.number().min(0).max(100).default(10),
    cancelPolicy: Joi.string().default("24h_100;3h_50;lt3h_0"),
    graceMinutes: Joi.number().min(0).max(120).default(15)
  }).required(),
  params: Joi.object().empty({}),
  query: Joi.object().empty({})
});

export const listRestaurantsSchema = Joi.object({
  body: Joi.object().empty({}),
  params: Joi.object().empty({}),
  query: Joi.object({
    city: Joi.string().optional()
  })
});

export const getRestaurantSchema = Joi.object({
  body: Joi.object().empty({}),
  params: Joi.object({ id: oid().required() }).required(),
  query: Joi.object().empty({})
});

export const createMenuSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().min(2).max(120).required(),
    description: Joi.string().allow(""),
    pricePerPerson: Joi.number().min(0).required(),
    photoUrl: Joi.string().allow(""),
    isActive: Joi.boolean().default(true)
  }).required(),
  params: Joi.object({ id: oid().required() }).required(),
  query: Joi.object().empty({})
});
