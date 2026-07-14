// src/jobs/scheduledRides.job.js
// Planlı Taksi — her dakika süpürme motorunu tetikler (iç tetik).
// Dış tetik: POST /api/cron/taxi-sweep (Bearer CRON_SECRET, cron-job.org).
// İkisi de aynı runScheduledRideSweep'i çağırır; idempotent (bkz. scheduledRideSweep.js).
import cron from "node-cron";
import { runScheduledRideSweep } from "../services/scheduledRideSweep.js";

cron.schedule("* * * * *", async () => {
  try {
    const result = await runScheduledRideSweep(new Date());
    if (result.processed > 0) {
      console.log(
        `[scheduledRides.job] ${result.processed} kayıt tarandı, ${result.actions.length} aksiyon uygulandı`
      );
    }
  } catch (err) {
    console.error("[scheduledRides.job] hata:", err.message);
  }
});
