import express, { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow, allowLocationManagerOrAdmin } from "../middlewares/roles.js";
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
  getResolvedMenuForPanel,
} from "../controllers/menu.controller.js";
import {
  upsertCategoryOverride,
  upsertItemOverride,
} from "../controllers/branchMenuOverride.controller.js";
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

// Menü kategorilerini listele
r.get(
  "/:rid/menu/categories",
  auth(),
  // okuma tarafında customer + restaurant + admin görebilsin (QR / panel vs.)
  allow("restaurant", "admin", "customer"),
  listCategories
);

// Menü kategorisi oluştur (panel)
// -> location_manager veya admin erişsin
r.post(
  "/:rid/menu/categories",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  validateBody(createCategorySchema),
  createCategory
);

// Menü kategorisi güncelle
r.patch(
  "/:rid/menu/categories/:cid",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  validateBody(updateCategorySchema),
  updateCategory
);

// Menü kategorisi sil
r.delete(
  "/:rid/menu/categories/:cid",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  deleteCategory
);

// ---------------- Items ----------------

// Menü itemlarını listele
r.get(
  "/:rid/menu/items",
  auth(),
  // okuma tarafında customer + restaurant + admin görebilsin
  allow("restaurant", "admin", "customer"),
  listItems // ❗ Query validation yok — controller kendisi validate ediyor
);

// Menü item oluştur (panel)
r.post(
  "/:rid/menu/items",
  auth(),
  allowLocationManagerOrAdmin("rid"),
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

// Menü item güncelle
r.patch(
  "/:rid/menu/items/:iid",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  imageUpload.single("photo"),
  validateBody(updateItemSchema),
  updateItem
);

// Menü item sil
r.delete(
  "/:rid/menu/items/:iid",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  deleteItem
);

// ---------------- Resolved Menu (panel preview + müşteri use-case) ----------------

r.get(
  "/:rid/menu/resolved",
  auth(),
  allow("restaurant", "admin", "customer"),
  getResolvedMenuForPanel
);
// ---------------- Branch Overrides (ORG menü için kopyasız yönetim) ----------------
r.patch(
  "/:rid/menu/overrides/categories/:orgCategoryId",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  upsertCategoryOverride
);

r.patch(
  "/:rid/menu/overrides/items/:orgItemId",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  upsertItemOverride
);
export default r;