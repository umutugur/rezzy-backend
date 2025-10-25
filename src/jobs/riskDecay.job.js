import cron from "node-cron";
import { monthlyRiskDecay } from "../services/userRisk.service.js";

// Aylık 1'inde, saat 03:00'te çalışır (sunucu saati)
const SCHEDULE = process.env.RISK_DECAY_CRON || "0 3 1 * *";
// Kaç puan düşürüleceği .env ile ayarlanabilir (default: 5)
const DECAY_POINTS = Number(process.env.RISK_DECAY_POINTS || 5);

cron.schedule(SCHEDULE, async () => {
  try {
    const r = await monthlyRiskDecay({ points: DECAY_POINTS });
    console.log(`🧮 monthlyRiskDecay -> updated=${r.updated} (−${DECAY_POINTS})`);
  } catch (e) {
    console.error("monthlyRiskDecay error:", e?.message || e);
  }
});