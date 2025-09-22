import { Router } from "express";
import { jobReminder24h, jobReminder3h, jobRestaurantPendingReminder, jobAutoTimeoutPending } from "../cron/jobs.js";

const r = Router();

// Basit key kontrolü (query veya header)
function checkKey(req, res, next) {
  const k = req.query.key || req.headers["x-cron-key"];
  if (!process.env.CRON_JOB_SECRET) return res.status(500).json({ ok:false, error:"CRON_JOB_SECRET missing" });
  if (k !== process.env.CRON_JOB_SECRET) return res.status(401).json({ ok:false, error:"unauthorized" });
  next();
}

// GET tercih ettim (cron-job.org ile uyumlu). İstersen POST da olur.
r.get("/reminder-24h", checkKey, async (req, res) => {
  try { res.json(await jobReminder24h()); }
  catch (e) { res.status(500).json({ ok:false, error:e?.message || String(e) }); }
});

r.get("/reminder-3h", checkKey, async (req, res) => {
  try { res.json(await jobReminder3h()); }
  catch (e) { res.status(500).json({ ok:false, error:e?.message || String(e) }); }
});

r.get("/pending-restaurant-reminder", checkKey, async (req, res) => {
  try { res.json(await jobRestaurantPendingReminder()); }
  catch (e) { res.status(500).json({ ok:false, error:e?.message || String(e) }); }
});

r.get("/auto-timeout-pending", checkKey, async (req, res) => {
  try { res.json(await jobAutoTimeoutPending()); }
  catch (e) { res.status(500).json({ ok:false, error:e?.message || String(e) }); }
});

export default r;
