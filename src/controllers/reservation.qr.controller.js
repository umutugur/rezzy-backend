import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import { generateQRDataURL, signQR } from "../utils/qr.js";

export const getReservationQR = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate("restaurantId");
    if (!r) return res.status(404).json({ message: "Reservation not found" });

    // sadece ilgili kullanıcı veya restoran sahibi görebilsin
    const userId = req.user.id;
    const isOwner =
      req.user.role === "admin" ||
      (req.user.role === "restaurant" && String(r.restaurantId.owner) === String(userId));
    const isCustomer = req.user.role === "customer" && String(r.userId) === String(userId);
    if (!(isOwner || isCustomer)) return res.status(403).json({ message: "Forbidden" });

    if (r.status !== "confirmed")
      return res.status(400).json({ message: "QR sadece onaylı rezervasyonda gösterilir" });

    // ISO olarak alıyoruz; signQR içinde ts saniyeye normalize ediliyor
    const rid = r._id.toString();
    const mid = r.restaurantId._id.toString();
    const ts = r.dateTimeUTC.toISOString();

    // ✅ payload metnini da çıkar (rid/mid/UNIXsec/sig)
    const { payload } = signQR({ rid, mid, ts });

    // ✅ DataURL’i üret
    const qrDataUrl = await generateQRDataURL({ rid, mid, ts });

    // ✅ Artık frontend’e payload’ı metin olarak da veriyoruz
    res.json({
      ok: true,
      rid,
      mid,
      ts,           // ISO (bilgi amaçlı)
      payload,      // <-- metin: "rid/mid/tsUnix/sig"
      qrDataUrl,    // <-- görsel (DataURL)
    });
  } catch (e) {
    next(e);
  }
};