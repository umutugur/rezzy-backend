import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import User from "../models/User.js";
import NotificationLog from "../models/NotificationLog.js";

const r = Router();

/**
 * Cihaz push token kaydı
 * body: { token: string }
 */
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

/**
 * Kayıtlı token/pref'leri gör
 */
r.get("/me", auth(), async (req, res) => {
  const u = await User.findById(req.user.id).select("pushTokens notificationPrefs").lean();
  if (!u) return res.status(404).json({ ok: false, error: "user not found" });
  res.json({ ok: true, pushTokens: u.pushTokens || [], prefs: u.notificationPrefs || {} });
});

/**
 * Bildirim listesi (son N kayıt)
 * query: { limit?: number (default 50) }
 */
r.get("/list", auth(), async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 50));
    const rows = await NotificationLog.find({ userId: req.user.id })
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    const items = rows.map((x) => ({
      id: String(x._id),
      title: x.payload?.title || "Bildirim",
      body: x.payload?.body || "",
      data: x.payload?.data || {},
      read: !!x.readAt,
      ts: x.sentAt || x.createdAt || new Date(),
    }));

    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * Okunmamış sayaç
 */
r.get("/unread-count", auth(), async (req, res) => {
  try {
    const count = await NotificationLog.countDocuments({
      userId: req.user.id,
      $or: [{ readAt: null }, { readAt: { $exists: false } }],
    });
    res.json({ ok: true, count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * Tek bildirimi okundu işaretle
 * body: { id: string }
 */
r.post("/mark-read", auth(), async (req, res) => {
  try {
    const id = String(req.body?.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id required" });

    await NotificationLog.updateOne(
      { _id: id, userId: req.user.id },
      { $set: { readAt: new Date() } }
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * Hepsini okundu işaretle
 */
r.post("/mark-all-read", auth(), async (req, res) => {
  try {
    await NotificationLog.updateMany(
      { userId: req.user.id, $or: [{ readAt: null }, { readAt: { $exists: false } }] },
      { $set: { readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

export default r;
