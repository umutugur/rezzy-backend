import Joi from "joi";
const oid = () => /^[0-9a-fA-F]{24}$/;

export const restaurantKpisSchema = Joi.object({
  body: Joi.object().empty({}),
  params: Joi.object({ id: Joi.string().pattern(oid()).required() }).required(),
  query: Joi.object({
    from: Joi.string().isoDate().optional(),
    to:   Joi.string().isoDate().optional()
  })
});
