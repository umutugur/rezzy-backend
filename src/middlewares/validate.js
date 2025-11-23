// src/middlewares/validate.js
import Joi from "joi";

export const validate = (schema, location = "body") => (req, res, next) => {
  const data = req[location];

  const { error, value } = schema.validate(data, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return next({
      status: 400,
      message: error.details.map((d) => d.message).join(", "),
    });
  }

  req[location] = value;
  next();
};