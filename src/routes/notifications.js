// src/routes/notifications.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import User from "../models/User.js";

const r = Router();

// Cihaz push token kaydı
r.post("/register", auth(), async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "token required" });

    // 1) Varsa güncelle/aktifleştir
    const exist = await User.updateOne(
      { _id: req.user.id, "pushTokens.token": token },
      { $set: { "pushTokens.$.isActive": true, "pushTokens.$.updatedAt": new Date() } }
    );

    // 2) Yoksa ekle
    let inserted = false;
    if (exist.matchedCount === 0) {
      const updated = await User.updateOne(
        { _id: req.user.id, "pushTokens.token": { $ne: token } },
        { $push: { pushTokens: { token, isActive: true, updatedAt: new Date() } } }
      );
      inserted = updated.modifiedCount > 0;
    }

    res.json({ ok: true, token, inserted });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Kayıtlı token/pref'leri gör
r.get("/me", auth(), async (req, res) => {
  const u = await User.findById(req.user.id).select("pushTokens notificationPrefs").lean();
  if (!u) return res.status(404).json({ ok: false, error: "user not found" });
  res.json({ ok: true, pushTokens: u.pushTokens || [], prefs: u.notificationPrefs || {} });
});

export default r;
