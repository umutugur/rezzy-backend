import Joi from "joi";

export const registerSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().min(2).max(80).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid("customer","restaurant","admin").optional()
  }).required(),
  params: Joi.object().empty({}),
  query: Joi.object().empty({})
});

export const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    password: Joi.string().min(6).required()
  }).required(),
  params: Joi.object().empty({}),
  query: Joi.object().empty({})
});

export const googleSchema = Joi.object({
  body: Joi.object({
    idToken: Joi.string().required()
  }).required(),
  params: Joi.object().empty({}),
  query: Joi.object().empty({})
});

export const appleSchema = Joi.object({
  body: Joi.object({
    identityToken: Joi.string().required(),
    nonce: Joi.string().optional()
  }).required(),
  params: Joi.object().empty({}),
  query: Joi.object().empty({})
});
