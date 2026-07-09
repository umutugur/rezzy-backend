// src/routes/marketPanel.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allowMarketPanel } from "../middlewares/allowMarketPanel.js";
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
  getReports,
  listMyOrgProducts,
  listMyOrgProductCategories,
  upsertBranchOverride,
  listMyPanelStores,
  panelBulkPrice,
} from "../controllers/marketPanel.controller.js";
import { listEligibleCampaigns, joinCampaign, leaveCampaign } from "../controllers/marketCampaign.controller.js";

const r = Router();

// ---------------------------------------------------------------------------
// Market Sahibi Paneli — JWT + market_owner veya admin rolü zorunlu
// ---------------------------------------------------------------------------

// Panelde erişilebilir mağazalar (owner ∪ membership) — parametrik route'lardan ÖNCE
r.get("/market/panel/my-stores", auth(), listMyPanelStores);

// Gelen siparişler
r.get(
  "/market/panel/orders",
  auth(),
  allowMarketPanel(),
  listPanelOrders
);

// Sipariş durumu güncelle
r.patch(
  "/market/panel/orders/:id/status",
  auth(),
  allowMarketPanel(),
  updateOrderStatus
);

// Store bilgisi
r.get(
  "/market/panel/store",
  auth(),
  allowMarketPanel(),
  getMyStore
);

// Store güncelle
r.patch(
  "/market/panel/store",
  auth(),
  allowMarketPanel(),
  updateMyStore
);

// Ürün listesi
r.get(
  "/market/panel/products",
  auth(),
  allowMarketPanel(),
  listPanelProducts
);

// Ürün ekle
r.post(
  "/market/panel/products",
  auth(),
  allowMarketPanel(),
  createProduct
);

// Ürün güncelle — client'lar PATCH gönderiyor; PUT'u da geriye dönük uyumluluk için tut
r.patch(
  "/market/panel/products/:id",
  auth(),
  allowMarketPanel(),
  updateProduct
);
r.put(
  "/market/panel/products/:id",
  auth(),
  allowMarketPanel(),
  updateProduct
);

// Ürün sil (soft delete)
r.delete(
  "/market/panel/products/:id",
  auth(),
  allowMarketPanel(),
  deleteProduct
);

// Excel/CSV ile toplu fiyat güncelleme (barkod eşleşmesi)
r.post(
  "/market/panel/bulk-price",
  auth(),
  allowMarketPanel(),
  panelBulkPrice
);

// Aynı organizasyona ait şubeler
r.get("/market/panel/org/stores", auth(), listOrgStores);

// Görsel yükleme
r.post("/market/panel/upload", auth(), allowMarketPanel(), imageUpload.single("file"), uploadPanelImage);

// Cross-store ürün görseli önerileri
r.get("/market/panel/product-image-suggestions", auth(), allowMarketPanel(), productImageSuggestions);

// Satış / sipariş raporları
r.get("/market/panel/reports", auth(), allowMarketPanel(), getReports);

// Zincir kataloğu — şube override
r.get("/market/panel/org-products/categories", auth(), allowMarketPanel(), listMyOrgProductCategories);
r.get("/market/panel/org-products", auth(), allowMarketPanel(), listMyOrgProducts);
r.put("/market/panel/org-products/:orgProductId/override", auth(), allowMarketPanel(), upsertBranchOverride);

// Kampanyalar (opt-in)
r.get("/market/panel/campaigns", auth(), allowMarketPanel(), listEligibleCampaigns);
r.post("/market/panel/campaigns/:campaignId/join", auth(), allowMarketPanel(), joinCampaign);
r.post("/market/panel/campaigns/:campaignId/leave", auth(), allowMarketPanel(), leaveCampaign);

import { businessStatement } from "../controllers/promoReports.controller.js";
r.get("/market/panel/promo-statement", auth(), allowMarketPanel(), businessStatement);

export default r;
