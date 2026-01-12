import express from "express";
import { auth } from "../middlewares/auth.js";
import { createDeliveryOrder } from "../controllers/deliveryOrders.controller.js";

const router = express.Router();

// POST /api/delivery/orders
router.post("/orders", auth(true), createDeliveryOrder);

export default router;