// controllers/reservation.qr.controller.js
import Reservation from "../models/Reservation.js";
import { generateQRDataURL, signQR } from "../utils/qr.js";

export const getReservationQR = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if (!r) return res.status(404).json({ message: "Reservation not found" });

    // yetki
    const uid = req.user.id;
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "restaurant" && String(r.restaurantId.owner) === String(uid));
    const isCustomer = req.user.role === "customer" && String(r.userId) === String(uid);
    if (!(isOwner || isCustomer)) return res.status(403).json({ message: "Forbidden" });

    if (r.status !== "confirmed")
      return res.status(400).json({ message: "QR sadece onaylı rezervasyonda gösterilir" });

    // ISO alınır; signQR içinde ts -> UNIX seconds normalize edilir
    const rid = r._id.toString();
    const mid = r.restaurantId._id.toString();
    const ts  = r.dateTimeUTC.toISOString();

    const { payload } = signQR({ rid, mid, ts });          // "rid/mid/UNIXsec/sig"
    const qrDataUrl   = await generateQRDataURL({ rid, mid, ts });

    res.json({ ok: true, rid, mid, ts, payload, qrDataUrl });
  } catch (e) {
    next(e);
  }
};