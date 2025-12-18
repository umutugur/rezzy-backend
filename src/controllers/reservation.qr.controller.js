// controllers/reservation.qr.controller.js
import Reservation from "../models/Reservation.js";
import { generateQRDataURL, signQR } from "../utils/qr.js";

function toIdString(v) {
  if (!v) return null;
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.$oid) return String(v.$oid);
    if (v.id) return String(v.id);
  }
  return String(v);
}

// ✅ Multi-organization aware: restaurant membership yetkisi
function canManageRestaurant(user, restaurantId) {
  if (!user) return false;
  if (user.role === "admin") return true;

  const targetId = String(restaurantId);

  // 1) Legacy single-restaurant binding
  if (user.restaurantId && toIdString(user.restaurantId) === targetId) return true;

  // 2) Membership binding
  const memberships = Array.isArray(user.restaurantMemberships)
    ? user.restaurantMemberships
    : [];

  const allowedRoles = ["location_manager", "staff"];

  return memberships.some((m) => {
    const restRef = toIdString(m?.restaurantId || m?.restaurant || m?.id);
    const role = String(m?.role || "");
    return restRef === targetId && allowedRoles.includes(role);
  });
}

export const getReservationQR = async (req, res, next) => {
  try {
    const r = await Reservation.findById(req.params.rid).populate(
      "restaurantId",
      "_id owner"
    );
    if (!r) return res.status(404).json({ message: "Reservation not found" });

    const uid = toIdString(req.user?.id);

    // ✅ Customer kendi rezervasyonunu görebilir
    const isCustomerOwner =
      req.user?.role === "customer" && toIdString(r.userId) === uid;

    // ✅ Restaurant tarafı: role global olsa da olmasa da membership/legacy ile yönetebilir
    const restId = toIdString(r.restaurantId?._id || r.restaurantId);
    const isRestaurantStaff = canManageRestaurant(req.user, restId);

    if (!(isCustomerOwner || isRestaurantStaff)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (r.status !== "confirmed") {
      return res
        .status(400)
        .json({ message: "QR sadece onaylı rezervasyonda gösterilir" });
    }

    // ISO alınır; signQR içinde ts -> UNIX seconds normalize edilir
    const rid = toIdString(r._id);
    const mid = restId;
    const ts = r.dateTimeUTC.toISOString();

    const { payload } = signQR({ rid, mid, ts }); // "rid/mid/UNIXsec/sig"
    const qrDataUrl = await generateQRDataURL({ rid, mid, ts });

    return res.json({ ok: true, rid, mid, ts, payload, qrDataUrl });
  } catch (e) {
    next(e);
  }
};