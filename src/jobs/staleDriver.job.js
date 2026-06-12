// src/jobs/staleDriver.job.js
// 10 dk'dan uzun süredir görülmeyen "çevrimiçi" sürücüleri otomatik çevrimdışı yapar.

import cron from "node-cron";
import TaxiDriver from "../models/TaxiDriver.js";
import { getIo } from "../sockets/io.js";

const STALE_MS = 10 * 60 * 1000;

cron.schedule("*/5 * * * *", async () => {
  try {
    const cutoff = new Date(Date.now() - STALE_MS);
    const stale = await TaxiDriver.find({
      isOnline: true,
      $or: [{ lastSeenAt: { $lt: cutoff } }, { lastSeenAt: null }],
    })
      .select("_id")
      .lean();

    if (stale.length === 0) return;

    await TaxiDriver.updateMany(
      { _id: { $in: stale.map((d) => d._id) } },
      { $set: { isOnline: false, socketId: null } }
    );

    const io = getIo();
    if (io) {
      for (const d of stale) {
        io.to("passengers:map").emit("driver:went_offline", { driverId: d._id });
      }
    }

    console.log(
      `[staleDriver.job] ${stale.length} hayalet sürücü çevrimdışı yapıldı`
    );
  } catch (err) {
    console.error("[staleDriver.job] hata:", err.message);
  }
});
