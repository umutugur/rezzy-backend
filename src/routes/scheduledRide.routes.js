// src/routes/scheduledRide.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  quoteScheduledRide,
  getMyScheduledRides,
  updateScheduledRide,
  cancelScheduledRideCustomer,
  getDriverScheduledBoard,
  claimScheduledRide,
  releaseScheduledRide,
  cronTaxiSweep,
} from "../controllers/scheduledRide.controller.js";

const router = Router();

// ─── Müşteri ──────────────────────────────────────────────────────────────
router.post("/taxi/scheduled/quote", auth(), quoteScheduledRide);
router.get("/taxi/scheduled/mine", auth(), getMyScheduledRides);
router.patch("/taxi/scheduled/:id", auth(), updateScheduledRide);
router.delete("/taxi/scheduled/:id", auth(), cancelScheduledRideCustomer);

// ─── Sürücü ───────────────────────────────────────────────────────────────
router.get("/taxi/driver/scheduled", auth(), getDriverScheduledBoard);
router.post("/taxi/driver/scheduled/:id/claim", auth(), claimScheduledRide);
router.post("/taxi/driver/scheduled/:id/release", auth(), releaseScheduledRide);

// ─── Cron (dış tetik — Bearer CRON_SECRET kontrolü controller içinde) ──────
router.post("/cron/taxi-sweep", cronTaxiSweep);

export default router;
