// src/routes/menu.routes.js
import express, { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { imageUpload } from "../utils/multer.js"; // ✅ named import
import { validate } from "../middlewares/validate.js";

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

// Ensure JSON bodies are parsed for category endpoints.
// (Items use multer below; adding this here prevents empty req.body on categories
// even if app-level json middleware is missing.)
r.use(express.json());

/**
 * app.js mount:
 * app.use("/api/panel/restaurants", menuRoutes);
 *
 * Bu yüzden burada "/restaurants" prefix'i YOK.
 *
 * Final URL:
 * /api/panel/restaurants/:rid/menu/...
 */

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
  validate(createCategorySchema,"body"),
  createCategory
);

r.patch(
  "/:rid/menu/categories/:cid",
  auth(),
  allow("restaurant", "admin"),
  validate(updateCategorySchema,"body"),
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
  validate(listItemsQuerySchema, "query"),
  listItems
);

r.post(
  "/:rid/menu/items",
  auth(),
  allow("restaurant", "admin"),
  imageUpload.single("photo"), // ✅ foto için doğru uploader
  validate(createItemSchema,"body"),
  createItem
);

r.patch(
  "/:rid/menu/items/:iid",
  auth(),
  allow("restaurant", "admin"),
  imageUpload.single("photo"),
  validate(updateItemSchema,"body"),
  updateItem
);

r.delete(
  "/:rid/menu/items/:iid",
  auth(),
  allow("restaurant", "admin"),
  deleteItem
);

export default r;