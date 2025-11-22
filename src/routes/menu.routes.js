// src/routes/menu.routes.js
import { Router } from "express";
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
  validate(createCategorySchema),
  createCategory
);

r.patch(
  "/:rid/menu/categories/:cid",
  auth(),
  allow("restaurant", "admin"),
  validate(updateCategorySchema),
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
  validate(createItemSchema),
  createItem
);

r.patch(
  "/:rid/menu/items/:iid",
  auth(),
  allow("restaurant", "admin"),
  imageUpload.single("photo"),
  validate(updateItemSchema),
  updateItem
);

r.delete(
  "/:rid/menu/items/:iid",
  auth(),
  allow("restaurant", "admin"),
  deleteItem
);

export default r;