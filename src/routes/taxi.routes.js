// src/routes/taxi.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  estimateFare,
  createRide,
  getRide,
  getMyRides,
  cancelRide,
  searchPlacesHandler,
  geocodeAddressHandler,
} from "../controllers/taxi.controller.js";

const router = Router();

// Adres arama (auth opsiyonel — daha iyi UX için giriş zorunlu tutmadık)
router.get("/taxi/places/search", auth(false), searchPlacesHandler);

// Adres geocoding (auth opsiyonel)
router.get("/taxi/places/geocode", auth(false), geocodeAddressHandler);

// Ücret tahmini
router.post("/taxi/estimate", auth(), estimateFare);

// Yolculuk oluştur
router.post("/taxi/rides", auth(), createRide);

// Yolcunun geçmiş yolculukları
router.get("/taxi/my-rides", auth(), getMyRides);

// Aktif yolculuk detayı (id'li rota my-rides'tan sonra olmalı — çakışma önlemi)
router.get("/taxi/rides/:id", auth(), getRide);

// Yolculuğu iptal et (yolcu)
router.patch("/taxi/rides/:id/cancel", auth(), cancelRide);

export default router;
