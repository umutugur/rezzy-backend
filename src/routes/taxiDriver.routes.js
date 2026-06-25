// src/routes/taxiDriver.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { getRequirements, getMyApplication, submitApplication, resubmitApplication } from "../controllers/partnerApplication.controller.js";
import { imageUpload } from "../utils/multer.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
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

// Generic dosya yükleme (partner başvuru selfie + belgeleri Cloudinary'ye).
// İKİ giriş biçimi destekler:
//   1) multipart/form-data, `file` alanı  (webpanel / klasik akış)
//   2) JSON { file: "data:image/jpeg;base64,..." }  (iOS'ta dosya-URI streaming
//      sorununu tamamen atlatan güvenilir mobil yol)
// Her iki durumda da { url } döner.
const maybeMultipart = (req, res, next) => {
  if ((req.headers["content-type"] || "").includes("multipart/form-data")) {
    return imageUpload.single("file")(req, res, next);
  }
  next();
};
router.post("/uploads", auth(), maybeMultipart, async (req, res, next) => {
  try {
    const PARTNER_FOLDER = process.env.CLOUDINARY_FOLDER_PARTNER || "rezvix/partner";
    let buffer = req.file?.buffer;

    // Base64 / data-URI gövdesi
    if (!buffer && typeof req.body?.file === "string") {
      const raw = req.body.file.includes(",") ? req.body.file.split(",").pop() : req.body.file;
      try { buffer = Buffer.from(raw, "base64"); } catch { buffer = null; }
    }
    if (!buffer || !buffer.length) return next({ status: 400, message: "Dosya gerekli" });

    const result = await uploadBufferToCloudinary(buffer, {
      folder: PARTNER_FOLDER,
      resource_type: "image",
    });
    res.json({ url: result.secure_url });
  } catch (e) { next(e); }
});

// Generic partner routes
router.get("/partner/requirements", auth(), getRequirements);
router.get("/partner/application/me", auth(), getMyApplication);
router.post("/partner/application", auth(), submitApplication);
router.put("/partner/application/resubmit", auth(), resubmitApplication);

// Aliases for older mobile builds (force appType=driver)
router.get("/taxi/driver/requirements", auth(), (req, res, next) => { req.query.appType = "driver"; return getRequirements(req, res, next); });
router.get("/taxi/driver/application/me", auth(), getMyApplication);
router.post("/taxi/driver/application", auth(), (req, res, next) => { req.body.appType = "driver"; return submitApplication(req, res, next); });
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
