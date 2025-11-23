// src/routes/menu.routes.js
import express, { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { imageUpload } from "../utils/multer.js";

import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  createItem,
  updateItem,
  deleteItem,
} from "../controllers/menu.controller.js";

import {
  createCategorySchema,
  updateCategorySchema,
  createItemSchema,
  updateItemSchema,
  listItemsQuerySchema,
} from "../validators/menu.schema.js";

const r = Router();

/** ✅ SADECE BU ROUTE DOSYASI İÇİN LOKAL VALIDATOR
 *  Global validate'e dokunmuyoruz.
 */
const validateBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body || {}, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return res.status(400).json({
      message: error.details.map((d) => d.message).join(", "),
    });
  }
  req.body = value;
  next();
};

const validateQuery = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.query || {}, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    return res.status(400).json({
      message: error.details.map((d) => d.message).join(", "),
    });
  }
  req.query = value;
  next();
};

// Categories JSON body parse (multer yok)
r.use(express.json());

// ---- categories ----
r.get(
  "/:rid/menu/categories",
  auth(),
  allow("restaurant", "admin"),
  listCategories
);

r.post(
  "/:rid/menu/categories",
  auth(),
  allow("restaurant", "admin"),
  validateBody(createCategorySchema),
  createCategory
);

r.patch(
  "/:rid/menu/categories/:cid",
  auth(),
  allow("restaurant", "admin"),
  validateBody(updateCategorySchema),
  updateCategory
);

r.delete(
  "/:rid/menu/categories/:cid",
  auth(),
  allow("restaurant", "admin"),
  deleteCategory
);

// ---- items ----
r.get(
  "/:rid/menu/items",
  auth(),
  allow("restaurant", "admin"),
  validateQuery(listItemsQuerySchema),
  listItems
);

r.post(
  "/:rid/menu/items",
  auth(),
  allow("restaurant", "admin"),
  imageUpload.single("photo"),
  (req, _res, next) => {
    console.log("CT:", req.headers["content-type"]);
    console.log("BODY KEYS:", Object.keys(req.body || {}));
    console.log("BODY:", req.body);
    next();
  },
  validateBody(createItemSchema),
  createItem
);

r.patch(
  "/:rid/menu/items/:iid",
  auth(),
  allow("restaurant", "admin"),
  imageUpload.single("photo"),
  validateBody(updateItemSchema),
  updateItem
);

r.delete(
  "/:rid/menu/items/:iid",
  auth(),
  allow("restaurant", "admin"),
  deleteItem
);

export default r;