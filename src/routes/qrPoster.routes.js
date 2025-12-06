// örn: routes/qr.routes.js
import { Router } from "express";
import {
  getTablePoster,
  getAllTablePostersZip,
} from "../controllers/qrPoster.controller.js";

// TODO: Projedeki auth middleware'i ekle (örn: requireAuth / requireRestaurant)
const router = Router();

// Tek masa için A5 poster
router.get("/poster/:restaurantId/:tableId", getTablePoster);

// Tüm masalar için ZIP
router.get("/posters/:restaurantId", getAllTablePostersZip);

export default router;