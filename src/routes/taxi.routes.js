// src/routes/taxi.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  estimateFare,
  createRide,
  getActiveRide,
  getRide,
  getMyRides,
  cancelRide,
  searchPlacesHandler,
  geocodeAddressHandler,
  rateRide,
  getVehicleTypesHandler,
} from "../controllers/taxi.controller.js";

const router = Router();

// Adres arama (auth opsiyonel — daha iyi UX için giriş zorunlu tutmadık)
router.get("/taxi/places/search", auth(false), searchPlacesHandler);

// Adres geocoding (auth opsiyonel)
router.get("/taxi/places/geocode", auth(false), geocodeAddressHandler);

// Araç tipleri (bölge bazlı)
router.get("/taxi/vehicle-types", auth(), getVehicleTypesHandler);

// Ücret tahmini
router.post("/taxi/estimate", auth(), estimateFare);

// Yolculuk oluştur
router.post("/taxi/rides", auth(), createRide);

// Yolcunun geçmiş yolculukları
router.get("/taxi/my-rides", auth(), getMyRides);

// Aktif yolculuk (searching/matched/inProgress) — /:id rotasından ÖNCE olmalı
router.get("/taxi/rides/active", auth(), getActiveRide);

// Yolculuk detayı (id ile)
router.get("/taxi/rides/:id", auth(), getRide);

// Yolculuğu iptal et (yolcu)
router.patch("/taxi/rides/:id/cancel", auth(), cancelRide);

// Yolculuğu puanla (yolcu)
router.patch("/taxi/rides/:id/rate", auth(), rateRide);

export default router;
