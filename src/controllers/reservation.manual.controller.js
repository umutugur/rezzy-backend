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

    const rest = await Restaurant.findById(r.restaurantId._id).lean();
    const grace = rest?.graceMinutes ?? 15;
    const start = dayjs(r.dateTimeUTC).subtract(grace,"minute");
    const end   = dayjs(r.dateTimeUTC).add(90,"minute");

    if (!(dayjs().isAfter(start) && dayjs().isBefore(end)))
      throw { status:400, message:"Outside time window" };

    const arrived = Math.max(0, Number(arrivedCount ?? r.partySize));
    const late = Math.max(0, dayjs().diff(dayjs(r.dateTimeUTC), "minute"));

    r.status = "arrived";
    r.arrivedCount = arrived;
    r.lateMinutes = late;
    r.checkinAt = new Date();
    await r.save();

    res.json({ ok:true, arrivedCount: r.arrivedCount, lateMinutes: r.lateMinutes });
  }catch(e){ next(e); }
};
