// src/routes/market.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  listNearbyStores,
  getStoreDetail,
  listStoreProducts,
  createOrder,
  listMyOrders,
  getOrderDetail,
  cancelOrder,
} from "../controllers/market.controller.js";

const r = Router();

// ---------------------------------------------------------------------------
// Müşteri API — public (market listeleme) + korumalı (sipariş)
// ---------------------------------------------------------------------------

// Yakındaki marketleri listele (opsiyonel auth — herkese açık)
r.get("/market/stores", listNearbyStores);

// Market detay
r.get("/market/stores/:id", getStoreDetail);

// Marketteki ürünler
r.get("/market/stores/:id/products", listStoreProducts);

// Sipariş oluştur — JWT zorunlu
r.post("/market/orders", auth(), createOrder);

// Kullanıcının siparişleri — JWT zorunlu
r.get("/market/orders", auth(), listMyOrders);

// Sipariş detay — JWT zorunlu
r.get("/market/orders/:id", auth(), getOrderDetail);

// Sipariş iptal — JWT zorunlu (yalnızca pending + ilk 5 dakika)
r.patch("/market/orders/:id/cancel", auth(), cancelOrder);

export default r;
