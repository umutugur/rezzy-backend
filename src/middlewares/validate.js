// middlewares/validate.js
export const validate = (schema) => (req, res, next) => {
  const data = { body: req.body, params: req.params, query: req.query };

  const { value, error } = schema.validate(data, {
    abortEarly: false,
    allowUnknown: true,
    // burada stripUnknown'u AÇMAK zorunda değilsin; ama açarsan deterministik olur.
    // stripUnknown: true,
  });

  if (error) {
    return next({
      status: 400,
      message: error.details.map((d) => d.message).join(", "),
    });
  }

  // ✅ kritik: Joi'nin normalize ettiği şeyi request'e uygula
  req.body = value.body;
  req.params = value.params;
  req.query = value.query;

  next();
};