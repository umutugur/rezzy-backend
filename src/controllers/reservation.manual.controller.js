import dayjs from "dayjs";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";

export const manualCheckin = async (req,res,next)=>{
  try{
    const { rid } = req.params;
    const { arrivedCount } = req.body;

    const r = await Reservation.findById(rid).populate("restaurantId");
    if(!r) throw { status:404, message:"Reservation not found" };

    if (req.user.role !== "admin" && String(r.restaurantId.owner) !== String(req.user.id))
      throw { status:403, message:"Forbidden" };

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
