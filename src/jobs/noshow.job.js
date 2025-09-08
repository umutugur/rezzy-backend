import cron from "node-cron";
import { dayjs } from "../utils/dates.js";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";

// Her 10 dakikada bir kontrol
cron.schedule("*/10 * * * *", async ()=>{
  const now = dayjs();
  const from = now.subtract(6, "hour").toDate(); // dar aralık (performans)
  const to = now.toDate();

  const resvs = await Reservation.find({
    status: { $in: ["pending","confirmed"] },
    dateTimeUTC: { $lte: to, $gte: from }
  }).populate("restaurantId");

  for (const r of resvs) {
    const grace = r.restaurantId?.graceMinutes ?? 15;
    const deadline = dayjs(r.dateTimeUTC).add(grace,"minute");
    if (now.isAfter(deadline)) {
      r.status = "no_show";
      r.noShowAt = new Date();
      await r.save();
    }
  }
  if (resvs.length) console.log(`⏰ no-show check ${resvs.length} items`);
});
