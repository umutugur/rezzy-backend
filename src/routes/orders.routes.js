// routes/orders.routes.js
import { Router } from "express";
import {
  openSession,
  getSession,
  closeSession,
  createOrder,
  listSessionOrders,
} from "../controllers/orders.controller.js";

const router = Router();

// Session (adisyon)
router.post("/sessions/open", openSession);          // body: {restaurantId, tableId, reservationId?}
router.get("/sessions/:id", getSession);
router.post("/sessions/:id/close", closeSession);

// Orders
router.post("/", createOrder);                        // body: {sessionId, restaurantId, tableId, items, paymentMethod, isGuest?, guestName?}
router.get("/sessions/:sessionId/orders", listSessionOrders);

export default router;