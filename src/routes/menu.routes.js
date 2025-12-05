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
} from "../validators/menu.schema.js";

const r = Router();

/** ✔ SADECE BODY VALIDATION — QUERY VALIDATION YOK */
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

// Category JSON parse
r.use(express.json());

// ---------------- Categories ----------------
r.get(
  "/:rid/menu/categories",
  auth(),
  allow("restaurant", "admin","customer"),
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

// ---------------- Items ----------------
r.get(
  "/:rid/menu/items",
  auth(),
  allow("restaurant", "admin","customer"),
  listItems           // ❗ Query validation yok — controller kendisi validate ediyor
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