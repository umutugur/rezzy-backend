// src/routes/delivery.js
import express from "express";
import { auth } from "../middlewares/auth.js";

import { listDeliveryRestaurants } from "../controllers/deliveryController.js";
import { resolveDeliveryZone } from "../controllers/deliveryZoneController.js";

import {
  checkoutDeliveryOrder,
  createDeliveryOrderCOD,
  getDeliveryAttemptStatus,
} from "../controllers/deliveryOrders.controller.js";

const router = express.Router();

// /api/delivery/restaurants?addressId=...
router.get("/restaurants", auth(true), listDeliveryRestaurants);

// POST /api/delivery/resolve-zone
router.post("/resolve-zone", auth(true), resolveDeliveryZone);

// ✅ CARD checkout (DeliveryOrder YOK, attempt var)
router.post("/orders/checkout", auth(true), checkoutDeliveryOrder);

// ✅ CASH / CARD_ON_DELIVERY (DeliveryOrder VAR)
router.post("/orders", auth(true), createDeliveryOrderCOD);

// ✅ Polling
router.get("/orders/attempt/:attemptId", auth(true), getDeliveryAttemptStatus);

export default router;