import cron from "node-cron";
import { dayjs } from "../utils/dates.js";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import { addIncident } from "../services/userRisk.service.js";

// Her 10 dakikada bir kontrol
cron.schedule("*/10 * * * *", async () => {
  const now = dayjs();
  const from = now.subtract(6, "hour").toDate(); // dar aralık (performans)
  const to = now.toDate();

  const resvs = await Reservation.find({
    status: { $in: ["confirmed"] },
    dateTimeUTC: { $lte: to, $gte: from }
  }).populate("restaurantId");

  let marked = 0;

  for (const r of resvs) {
     // Yeni mantık: check-in penceresinin SONU kadar bekle.
    const afterWin = Number(r.restaurantId?.checkinWindowAfterMinutes);
    const legacyGrace = Number(r.restaurantId?.graceMinutes);
    const bufferMin =
      Number.isFinite(afterWin) && afterWin > 0
        ? afterWin
        : Number.isFinite(legacyGrace) && legacyGrace > 0
        ? legacyGrace
        : 90; // güvenli varsayılan

    const deadline = dayjs(r.dateTimeUTC).add(bufferMin, "minute");
    if (now.isAfter(deadline)) {
      r.status = "no_show";
      r.noShowAt = new Date();
      await r.save();

      // Kullanıcı risk/no-show güncelle
      try {
        await addIncident({
          userId: r.userId,
          type: "NO_SHOW",
          reservationId: r._id.toString(),
        });
      } catch (e) {
        console.warn("[noshow.job] addIncident warn:", e?.message || e);
      }

      marked++;
    }
  }

  if (marked) console.log(`⏰ no-show check -> ${marked} item updated`);
});