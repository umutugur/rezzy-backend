import express from "express";
import { auth } from "../middlewares/auth.js";
import { listDeliveryRestaurants } from "../controllers/deliveryController.js";

const router = express.Router();

// /api/delivery/restaurants?addressId=...
router.get("/restaurants", auth(true), listDeliveryRestaurants);

export default router;