// routes/orders.routes.js
import { Router } from "express";
import {
  openSession,
  getSession,
  closeSession,
  createOrder,
  listSessionOrders,
  createStripeIntent, // ✅ EKLE
} from "../controllers/orders.controller.js";

const router = Router();

router.post("/sessions/open", openSession);
router.get("/sessions/:id", getSession);
router.post("/sessions/:id/close", closeSession);

router.post("/", createOrder);

// ⚠️ frontend şu path’i kullanıyor: /orders/sessions/:sessionId
// senin path: /sessions/:sessionId/orders
router.get("/sessions/:sessionId", listSessionOrders); // ✅ ALIAS (kolay fix)
router.get("/sessions/:sessionId/orders", listSessionOrders);

// ✅ STRIPE INTENT ENDPOINT
router.post("/:orderId/stripe-intent", createStripeIntent);

export default router;