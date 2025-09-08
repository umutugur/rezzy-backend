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
} from "../controllers/reservation.controller.js";
import { receiptUpload } from "../utils/multer.js";

const r = Router();

// sıraya dikkat: spesifik path'ler önce
r.post("/:rid/receipt", auth(), receiptUpload.single("file"), validate(uploadReceiptSchema), uploadReceipt);

r.post("/", auth(), validate(createReservationSchema), createReservation); // müşteri
r.post("/:rid/approve", auth(), allow("restaurant", "admin"), validate(approveReservationSchema), approveReservation);
r.post("/:rid/reject",  auth(), allow("restaurant", "admin"), validate(rejectReservationSchema),  rejectReservation);
r.post("/:rid/cancel",  auth(), validate(cancelReservationSchema), cancelReservation);                         // müşteri

r.post("/checkin", auth(), allow("restaurant", "admin"), validate(checkinSchema), checkin);                   // panel

r.get("/:rid", auth(), validate(getReservationSchema), getReservation);                                       // detay
r.get("/", auth(), listMyReservations);                                                                        // liste (kullanıcı)

export default r;
