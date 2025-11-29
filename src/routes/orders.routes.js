// routes/orders.routes.js
import { Router } from "express";
import {
  openSession,
  getSession,
  closeSession,
  createOrder,
  listSessionOrders,
  createStripeIntent,
  createWalkInOrder,
} from "../controllers/orders.controller.js";

const router = Router();

router.post("/sessions/open", openSession);
router.get("/sessions/:id", getSession);
router.post("/sessions/:id/close", closeSession);

router.post("/", createOrder);

// frontend şu path’i kullanıyor
router.get("/sessions/:sessionId", listSessionOrders);
router.get("/sessions/:sessionId/orders", listSessionOrders);

router.post("/:orderId/stripe-intent", createStripeIntent);

/**
 * ✅ WALK-IN endpoint
 * Tam path (muhtemel mount: /api/orders):
 * POST /api/orders/restaurants/:restaurantId/tables/:tableId/walk-in
 */
router.post(
  "/restaurants/:restaurantId/tables/:tableId/walk-in",
  createWalkInOrder
);

export default router;