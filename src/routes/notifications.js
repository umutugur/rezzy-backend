import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import User from "../models/User.js";
import NotificationLog from "../models/NotificationLog.js";
// importların altı
console.log("[boot] notifications router mounted");


/** Basit rol kontrolü */
function requireAdmin(req, res, next) {
  try {
    if (req.user?.role !== "admin") return res.status(403).json({ ok: false, error: "forbidden" });
    next();
  } catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
}
// dosyanın uygun yerine:
r.get("/admin/ping", (req, res) => res.json({ ok: true, where: "notifications/admin/ping" }));
const r = Router();

/**
 * Cihaz push token kaydı
 * body: { token: string }
 */
r.post("/register", auth(), async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ ok: false, error: "token required" });

    const exist = await User.updateOne(
      { _id: req.user.id, "pushTokens.token": token },
      { $set: { "pushTokens.$.isActive": true, "pushTokens.$.updatedAt": new Date() } }
    );

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

/** Kayıtlı token/pref'leri gör */
r.get("/me", auth(), async (req, res) => {
  const u = await User.findById(req.user.id).select("pushTokens notificationPrefs").lean();
  if (!u) return res.status(404).json({ ok: false, error: "user not found" });
  res.json({ ok: true, pushTokens: u.pushTokens || [], prefs: u.notificationPrefs || {} });
});

/** Bildirim listesi (son N kayıt) */
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

/** Okunmamış sayaç */
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

/** Tek bildirimi okundu işaretle */
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

/** Hepsini okundu işaretle */
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

/**
 * ADMIN — Manuel bildirim gönder
 * POST /api/notifications/admin/send
 * body: {
 *   targets: "all" | "customers" | "restaurants" | "email",
 *   email?: string,
 *   title: string,
 *   body: string,
 *   data?: Record<string,string>
 * }
 */
r.post("/admin/send", auth(), requireAdmin, async (req, res) => {
  try {
    const { targets, email, title, body, data } = req.body || {};
    const validTargets = ["all", "customers", "restaurants", "email"];
    if (!validTargets.includes(targets)) {
      return res.status(400).json({ ok: false, error: "invalid targets" });
    }
    if (!title || !body) {
      return res.status(400).json({ ok: false, error: "title/body required" });
    }

    // Hedef kullanıcıları bul
    let userQuery = {};
    if (targets === "customers") userQuery = { role: "customer" };
    if (targets === "restaurants") userQuery = { role: "restaurant" };
    if (targets === "email") {
      if (!email) return res.status(400).json({ ok: false, error: "email required" });
      userQuery = { email: String(email).trim().toLowerCase() };
    }

    const users = await User.find(userQuery)
      .select("_id pushTokens")
      .lean();

    // Aktif Expo push tokenları
    const tokenTuples = [];
    for (const u of users) {
      const tokens = (u.pushTokens || [])
        .filter(t => t?.isActive && t?.token)
        .map(t => t.token);
      for (const token of tokens) {
        tokenTuples.push({ userId: u._id, token });
      }
    }

    // Expo push (Node 18+ global fetch)
    async function sendBatch(messages) {
      const resp = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
      const json = await resp.json().catch(() => ({}));
      return json;
    }

    // 100’lük paketlere böl ve gönder
    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < tokenTuples.length; i += chunkSize) {
      chunks.push(tokenTuples.slice(i, i + chunkSize));
    }

    const payload = { title, body, data: data || {} };
    let sent = 0;

    for (const ch of chunks) {
      const messages = ch.map(t => ({ to: t.token, sound: "default", ...payload }));
      const result = await sendBatch(messages);
      // Logla (kullanıcı bazında)
      const logs = ch.map(t => ({
        userId: t.userId,
        payload,
        sentAt: new Date(),
        providerResponse: result || {},
      }));
      if (logs.length) await NotificationLog.insertMany(logs);
      sent += ch.length;
    }

    return res.json({ ok: true, targetedUsers: users.length, targetedTokens: tokenTuples.length, sent });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

export default r;