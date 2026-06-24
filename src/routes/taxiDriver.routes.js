// src/routes/taxiDriver.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { getRequirements, getMyApplication, submitApplication, resubmitApplication } from "../controllers/driverApplication.controller.js";
import {
  registerDriver,
  toggleStatus,
  updateLocation,
  respondToRide,
  completeRide,
  getDriverRides,
  getEarnings,
  getDriverProfile,
  adminListDrivers,
  adminApproveDriver,
  adminRejectDriver,
  adminListTaxiRides,
  adminListMarketOrders,
  adminListDeliveryOrders,
  adminListTaxiConfigs,
  adminUpsertTaxiConfig,
} from "../controllers/taxiDriver.controller.js";

const router = Router();

// Sürücü başvuru gereksinimleri ve başvuru
router.get("/taxi/driver/requirements", auth(), getRequirements);
router.get("/taxi/driver/application/me", auth(), getMyApplication);
router.post("/taxi/driver/application", auth(), submitApplication);
router.put("/taxi/driver/application/resubmit", auth(), resubmitApplication);

// Sürücü kaydı
router.post("/taxi/driver/register", auth(), registerDriver);

// Sürücü profilim
router.get("/taxi/driver/me", auth(), getDriverProfile);

// Online/offline toggle
router.patch("/taxi/driver/status", auth(), toggleStatus);

// Konum güncelleme
router.patch("/taxi/driver/location", auth(), updateLocation);

// Yolculuk kabul / red
router.patch("/taxi/rides/:id/respond", auth(), respondToRide);

// Yolculuk başlat (inProgress)
router.patch("/taxi/rides/:id/start", auth(), async (req, res, next) => {
  try {
    const { default: TaxiDriver } = await import("../models/TaxiDriver.js");
    const { default: TaxiRide } = await import("../models/TaxiRide.js");
    const { emitRideStatusChange } = await import("../sockets/taxi.socket.js");

    const driver = await TaxiDriver.findOne({ user: req.user.id });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    const ride = await TaxiRide.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: "Yolculuk bulunamadı" });
    if (ride.driver?.toString() !== driver._id.toString()) {
      return res.status(403).json({ message: "Bu yolculuk size ait değil" });
    }
    if (ride.status !== "matched") {
      return res.status(409).json({ message: "Yolculuk henüz eşleşme aşamasında değil" });
    }

    ride.status = "inProgress";
    ride.startedAt = new Date();
    await ride.save();

    const io = req.app.get("io");
    if (io) await emitRideStatusChange(io, ride);

    return res.json({ message: "Yolculuk başlatıldı", ride });
  } catch (err) {
    next(err);
  }
});

// Yolculuğu tamamla
router.patch("/taxi/rides/:id/complete", auth(), completeRide);

// Sürücünün geçmiş yolculukları
router.get("/taxi/driver/rides", auth(), getDriverRides);

// Kazanç özeti
router.get("/taxi/driver/earnings", auth(), getEarnings);

// Admin: sürücü başvuruları
router.get("/admin/taxi/drivers", auth(), adminListDrivers);
router.patch("/admin/taxi/drivers/:id/approve", auth(), adminApproveDriver);
router.patch("/admin/taxi/drivers/:id/reject", auth(), adminRejectDriver);

// Admin: taksi yolculukları listesi
router.get("/admin/taxi/rides", auth(), adminListTaxiRides);

// Admin: market siparişleri listesi
router.get("/admin/market/orders", auth(), adminListMarketOrders);

// Admin: teslimat siparişleri listesi
router.get("/admin/delivery/orders", auth(), adminListDeliveryOrders);

// Admin: bölge fiyat/yarıçap/komisyon konfigürasyonu
router.get("/admin/taxi/config", auth(), adminListTaxiConfigs);
router.put("/admin/taxi/config/:region", auth(), adminUpsertTaxiConfig);

export default router;
