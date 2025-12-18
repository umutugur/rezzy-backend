import dayjs from "dayjs";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";

function toIdString(v) {
  if (!v) return null;
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.$oid) return String(v.$oid);
    if (v.id) return String(v.id);
  }
  return String(v);
}

function canManageRestaurantById(user, restaurantId) {
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

function assertCanManageReservation(user, reservationDoc) {
  if (!reservationDoc) return false;
  const restId = toIdString(reservationDoc?.restaurantId?._id || reservationDoc?.restaurantId);
  if (!restId) throw { status: 400, message: "Reservation has no restaurantId" };
  if (!canManageRestaurantById(user, restId)) {
    throw { status: 403, message: "Forbidden" };
  }
}

export const manualCheckin = async (req,res,next)=>{
  try{
    const { rid } = req.params;
    const { arrivedCount } = req.body;

    const r = await Reservation.findById(rid).populate("restaurantId");
    if(!r) throw { status:404, message:"Reservation not found" };
    assertCanManageReservation(req.user, r);

    // Restaurant alan adlarıyla uyumlu pencere
    const rest = await Restaurant.findById(r.restaurantId._id).lean();
    const before = Math.max(0, Number(rest?.checkinWindowBeforeMinutes ?? 15));
    const after  = Math.max(0, Number(rest?.checkinWindowAfterMinutes  ?? 90));
    const start = dayjs(r.dateTimeUTC).subtract(before,"minute");
    const end   = dayjs(r.dateTimeUTC).add(after,"minute");

    if (!(dayjs().isAfter(start) && dayjs().isBefore(end)))
      throw { status:400, message:"Outside time window" };

    const arrived = Math.max(0, Math.min(Number(arrivedCount ?? r.partySize), r.partySize));
    const late = Math.max(0, dayjs().diff(dayjs(r.dateTimeUTC), "minute"));

    // eşik kontrolü
    const threshold = Math.max(0, Math.min(100, Number(rest?.underattendanceThresholdPercent ?? 80)));
    const isUnder = arrived < (r.partySize * (threshold / 100));

    r.status = "arrived";
    r.arrivedCount = arrived;
    r.lateMinutes = late;
    r.underattended = !!isUnder;
    r.checkinAt = new Date();
    await r.save();

    res.json({ ok:true, arrivedCount: r.arrivedCount, lateMinutes: r.lateMinutes, underattended: r.underattended });
  }catch(e){ next(e); }
};
