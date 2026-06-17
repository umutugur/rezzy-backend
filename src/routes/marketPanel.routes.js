// src/routes/marketPanel.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { imageUpload } from "../utils/multer.js";
import {
  listPanelOrders,
  updateOrderStatus,
  listPanelProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getMyStore,
  updateMyStore,
  listOrgStores,
  uploadPanelImage,
  productImageSuggestions,
} from "../controllers/marketPanel.controller.js";

const r = Router();

// ---------------------------------------------------------------------------
// Market Sahibi Paneli — JWT + market_owner veya admin rolü zorunlu
// ---------------------------------------------------------------------------

// Gelen siparişler
r.get(
  "/market/panel/orders",
  auth(),
  allow("market_owner", "admin"),
  listPanelOrders
);

// Sipariş durumu güncelle
r.patch(
  "/market/panel/orders/:id/status",
  auth(),
  allow("market_owner", "admin"),
  updateOrderStatus
);

// Store bilgisi
r.get(
  "/market/panel/store",
  auth(),
  allow("market_owner", "admin"),
  getMyStore
);

// Store güncelle
r.patch(
  "/market/panel/store",
  auth(),
  allow("market_owner", "admin"),
  updateMyStore
);

// Ürün listesi
r.get(
  "/market/panel/products",
  auth(),
  allow("market_owner", "admin"),
  listPanelProducts
);

// Ürün ekle
r.post(
  "/market/panel/products",
  auth(),
  allow("market_owner", "admin"),
  createProduct
);

// Ürün güncelle — client'lar PATCH gönderiyor; PUT'u da geriye dönük uyumluluk için tut
r.patch(
  "/market/panel/products/:id",
  auth(),
  allow("market_owner", "admin"),
  updateProduct
);
r.put(
  "/market/panel/products/:id",
  auth(),
  allow("market_owner", "admin"),
  updateProduct
);

// Ürün sil (soft delete)
r.delete(
  "/market/panel/products/:id",
  auth(),
  allow("market_owner", "admin"),
  deleteProduct
);

// Aynı organizasyona ait şubeler
r.get("/market/panel/org/stores", auth(), listOrgStores);

// Görsel yükleme
r.post("/market/panel/upload", auth(), allow("market_owner", "admin"), imageUpload.single("file"), uploadPanelImage);

// Cross-store ürün görseli önerileri
r.get("/market/panel/product-image-suggestions", auth(), allow("market_owner", "admin"), productImageSuggestions);

export default r;
