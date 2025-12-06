// src/routes/qrPoster.routes.js
import { Router } from "express";
import {
  getTablePoster,
  getAllTablePostersZip,
} from "../controllers/qrPoster.controller.js";

const router = Router();

// Tek masa için A5 poster
router.get("/qr/poster/:restaurantId/:tableKey", getTablePoster);

// Tüm masalar için ZIP
router.get("/qr/posters/:restaurantId", getAllTablePostersZip);

export default router;