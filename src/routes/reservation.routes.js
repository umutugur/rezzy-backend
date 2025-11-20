import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
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
} from "../controllers/reservation.controller.js";
import { receiptUpload } from "../utils/multer.js";
import {
  listReservationsByRestaurant,
  reservationStatsByRestaurant,
} from "../controllers/reservation.controller.js";
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

r.post("/", auth(), validate(createReservationSchema), createReservation); // müşteri
r.post(
  "/:rid/approve",
  auth(),
  allow("restaurant", "admin"),
  validate(approveReservationSchema),
  approveReservation
);
r.post(
  "/:rid/reject",
  auth(),
  allow("restaurant", "admin"),
  validate(rejectReservationSchema),
  rejectReservation
);
r.post(
  "/:rid/cancel",
  auth(),
  validate(cancelReservationSchema),
  cancelReservation
); // müşteri

r.post(
  "/checkin",
  auth(),
  allow("restaurant", "admin"),
  validate(checkinSchema),
  checkin
); // panel
r.post("/:rid/checkin-manual", auth(), allow("restaurant", "admin"), manualCheckin);

// ✅ check-in sonrası arrivedCount düzeltme
r.patch(
  "/:rid/arrived-count",
  auth(),
  allow("restaurant", "admin"),
  validate(updateArrivedCountSchema),
  updateArrivedCount
);

r.get("/:rid", auth(), validate(getReservationSchema), getReservation); // detay
r.get("/", auth(), listMyReservations); // liste (kullanıcı)
r.get(
  "/by-restaurant/:rid",
  auth(),
  allow("restaurant", "admin"),
  listReservationsByRestaurant
);
r.get(
  "/by-restaurant/:rid/stats",
  auth(),
  allow("restaurant", "admin"),
  reservationStatsByRestaurant
);
r.get("/:rid/qr", auth(), getReservationQR);

export default r;