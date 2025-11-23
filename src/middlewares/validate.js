// src/middlewares/validate.js
export const validate = (schema, part = "body") => (req, res, next) => {
  try {
    const raw = req[part] ?? {};

    // multer'da req.body null-prototype olabilir, plain objeye çeviriyoruz
    const data =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? { ...raw }
        : raw;

    const { value, error } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true,
      convert: true, // numeric string -> number vs. için
    });

    if (error) {
      return next({
        status: 400,
        message: error.details.map((d) => d.message).join(", "),
      });
    }

    // sanitize edilmiş halini geri yaz
    req[part] = value;
    next();
  } catch (err) {
    next(err);
  }
};