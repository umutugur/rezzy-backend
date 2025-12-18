import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow, allowLocationManagerOrAdmin } from "../middlewares/roles.js";
import { validate } from "../middlewares/validate.js";
import {
  createReservationSchema,
  uploadReceiptSchema,
  approveReservationSchema,
  rejectReservationSchema,
  checkinSchema,
  cancelReservationSchema,
  getReservationSchema,
  updateArrivedCountSchema, // ✅
  createStripePaymentIntentSchema, // ✅ Stripe için yeni schema
} from "../validators/reservation.schema.js";
import {
  createReservation,
  uploadReceipt,
  approveReservation,
  rejectReservation,
  checkin,
  cancelReservation,
  getReservation,
  listMyReservations,
  updateArrivedCount, // ✅
  createStripePaymentIntentForReservation, // ✅ Stripe controller
  listReservationsByRestaurant,
  reservationStatsByRestaurant,
} from "../controllers/reservation.controller.js";
import { receiptUpload } from "../utils/multer.js";
import { getReservationQR } from "../controllers/reservation.qr.controller.js";
import { manualCheckin } from "../controllers/reservation.manual.controller.js";

const r = Router();

// sıraya dikkat: spesifik path'ler önce
r.post(
  "/:rid/receipt",
  auth(),
  receiptUpload.single("file"),
  validate(uploadReceiptSchema),
  uploadReceipt
);

// ✅ Stripe depozito payment intent (kart / Apple Pay / Google Pay)
r.post(
  "/:rid/stripe-intent",
  auth(),
  validate(createStripePaymentIntentSchema),
  createStripePaymentIntentForReservation
);

// ✅ Rezervasyon oluşturma (müşteri)
r.post("/", auth(), validate(createReservationSchema), createReservation);

// ✅ Rezervasyon onay (restoran paneli / admin)
// rid = reservationId ✅
r.post(
  "/:rid/approve",
  auth(),
  allowLocationManagerOrAdmin("rid", { type: "reservation" }),
  validate(approveReservationSchema),
  approveReservation
);

// ✅ Rezervasyon reddetme (restoran paneli / admin)
// rid = reservationId ✅
r.post(
  "/:rid/reject",
  auth(),
  allowLocationManagerOrAdmin("rid", { type: "reservation" }),
  validate(rejectReservationSchema),
  rejectReservation
);

// ✅ Rezervasyon iptali (müşteri)
r.post(
  "/:rid/cancel",
  auth(),
  validate(cancelReservationSchema),
  cancelReservation
);

// ✅ QR check-in (panel) – membership-aware (location_manager / staff / admin)
// Body'den rid (reservationId) geliyor: { rid, mid, ts, sig, ... }
// allowLocationManagerOrAdmin param okuduğu için, rid'yi req.params'a köprüyoruz.
r.post(
  "/checkin",
  auth(),
  (req, _res, next) => {
    if (req?.body?.rid) req.params.rid = String(req.body.rid);
    return next();
  },
  allowLocationManagerOrAdmin("rid", { type: "reservation" }),
  validate(checkinSchema),
  checkin
); // panel

// ✅ Manuel check-in (masa başı / panel)
// rid = reservationId ✅
r.post(
  "/:rid/checkin-manual",
  auth(),
  allowLocationManagerOrAdmin("rid", { type: "reservation" }),
  manualCheckin
);

// ✅ check-in sonrası arrivedCount düzeltme (panel)
// rid = reservationId ✅
r.patch(
  "/:rid/arrived-count",
  auth(),
  allowLocationManagerOrAdmin("rid", { type: "reservation" }),
  validate(updateArrivedCountSchema),
  updateArrivedCount
);

// ✅ Rezervasyon detay (müşteri kendi rezervasyonu)
r.get("/:rid", auth(), validate(getReservationSchema), getReservation);

// ✅ Kullanıcının kendi rezervasyon listesi
r.get("/", auth(), listMyReservations);

// ✅ Restoran bazlı rezervasyon listesi (panel)
// rid = restaurantId ✅ (aynı kalır)
r.get(
  "/by-restaurant/:rid",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  listReservationsByRestaurant
);

// ✅ Restoran bazlı rezervasyon istatistikleri (panel)
// rid = restaurantId ✅ (aynı kalır)
r.get(
  "/by-restaurant/:rid/stats",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  reservationStatsByRestaurant
);

// ✅ Rezervasyon için QR
r.get("/:rid/qr", auth(), getReservationQR);

export default r;