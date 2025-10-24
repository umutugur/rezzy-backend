// routes/notifications.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import User from "../models/User.js";
import Device from "../models/Device.js";
import NotificationLog from "../models/NotificationLog.js";
import { sendToDevices } from "../services/notification.service.js";

const r = Router();

// ---- Boot log
console.log("[boot] notifications router mounted");

// ---- Basit request logger (yalnızca notifications altı)
r.use((req, res, next) => {
  const started = Date.now();
  const bodyKeys = req.method === "GET" ? [] : Object.keys(req.body || {});
  console.log(
    `[notifications] ${req.method} ${req.originalUrl} bodyKeys=${JSON.stringify(
      bodyKeys
    )}`
  );
  res.on("finish", () => {
    console.log(
      `[notifications] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started
      }ms)`
    );
  });
  next();
});

// ---- Ping (router gerçekten mount oldu mu?)
r.get("/admin/ping", (req, res) =>
  res.json({ ok: true, where: "notifications/admin/ping" })
);

/** Basit rol kontrolü */
function requireAdmin(req, res, next) {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ ok: false, error: "forbidden" });
    next();
  } catch (e) {
    console.error("[notifications][requireAdmin] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
}

/* =================================================================== */
/*                         USER-BOUND NOTIFICATIONS                     */
/* =================================================================== */

/**
 * Cihaz push token kaydı (AUTH gerekli — kullanıcıya bağlar)
 * body: { token: string }
 */
r.post("/register", auth(), async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token)
      return res
        .status(400)
        .json({ ok: false, error: "token required" });

    const exist = await User.updateOne(
      { _id: req.user.id, "pushTokens.token": token },
      {
        $set: {
          "pushTokens.$.isActive": true,
          "pushTokens.$.updatedAt": new Date(),
        },
      }
    );

    let inserted = false;
    if (exist.matchedCount === 0) {
      const updated = await User.updateOne(
        { _id: req.user.id, "pushTokens.token": { $ne: token } },
        {
          $push: {
            pushTokens: { token, isActive: true, updatedAt: new Date() },
          },
        }
      );
      inserted = updated.modifiedCount > 0;
    }

    res.json({ ok: true, token, inserted });
  } catch (e) {
    console.error("[notifications][register] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/** Kayıtlı token/pref'leri gör (kullanıcı) */
r.get("/me", auth(), async (req, res) => {
  try {
    const u = await User.findById(req.user.id)
      .select("pushTokens notificationPrefs")
      .lean();
    if (!u)
      return res
        .status(404)
        .json({ ok: false, error: "user not found" });
    res.json({
      ok: true,
      pushTokens: u.pushTokens || [],
      prefs: u.notificationPrefs || {},
    });
  } catch (e) {
    console.error("[notifications][me] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/** Bildirim listesi (son N kayıt — kullanıcıya bağlı loglar) */
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
    console.error("[notifications][list] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
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
    console.error("[notifications][unread-count] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/** Tek bildirimi okundu işaretle */
r.post("/mark-read", auth(), async (req, res) => {
  try {
    const id = String(req.body?.id || "").trim();
    if (!id)
      return res.status(400).json({ ok: false, error: "id required" });

    await NotificationLog.updateOne(
      { _id: id, userId: req.user.id },
      { $set: { readAt: new Date() } }
    );

    res.json({ ok: true });
  } catch (e) {
    console.error("[notifications][mark-read] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/** Hepsini okundu işaretle */
r.post("/mark-all-read", auth(), async (req, res) => {
  try {
    await NotificationLog.updateMany(
      {
        userId: req.user.id,
        $or: [{ readAt: null }, { readAt: { $exists: false } }],
      },
      { $set: { readAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[notifications][mark-all-read] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/* =================================================================== */
/*                         GUEST / DEVICE NOTIFICATIONS                 */
/* =================================================================== */

/**
 * Misafir/cihaz kaydı (AUTH YOK)
 * body: { deviceId: string, expoToken: string, platform?: "ios"|"android"|"web", appVersion?: string }
 * Not: Sonradan kullanıcı login olursa /devices/attach ile ilişkilenecek.
 */
r.post("/devices/register", async (req, res) => {
  try {
    const deviceId = String(req.body?.deviceId || "").trim();
    const expoToken = String(req.body?.expoToken || "").trim();
    const platform = String(req.body?.platform || "").trim() || null;
    const appVersion = String(req.body?.appVersion || "").trim() || null;

    if (!deviceId || !expoToken) {
      return res
        .status(400)
        .json({ ok: false, error: "deviceId and expoToken required" });
    }

    const now = new Date();
    const updated = await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          deviceId,
          expoToken,
          platform,
          appVersion,
          isActive: true,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, new: true }
    );

    return res.json({ ok: true, deviceId: updated.deviceId });
  } catch (e) {
    console.error("[notifications][devices/register] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * Cihazı oturum açan kullanıcıya bağla (AUTH)
 * body: { deviceId: string, expoToken?: string }
 */
r.post("/devices/attach", auth(), async (req, res) => {
  try {
    const deviceId = String(req.body?.deviceId || "").trim();
    const expoToken = req.body?.expoToken
      ? String(req.body.expoToken).trim()
      : null;
    if (!deviceId)
      return res
        .status(400)
        .json({ ok: false, error: "deviceId required" });

    const set = { userId: req.user.id, isActive: true, updatedAt: new Date() };
    if (expoToken) set.expoToken = expoToken;

    const d = await Device.findOneAndUpdate(
      { deviceId },
      { $set: set, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, new: true }
    ).lean();

    return res.json({ ok: true, device: d });
  } catch (e) {
    console.error("[notifications][devices/attach] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * Kullanıcının cihazlarını getir (AUTH)
 */
r.get("/devices/me", auth(), async (req, res) => {
  try {
    const items = await Device.find({ userId: req.user.id })
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ ok: true, items });
  } catch (e) {
    console.error("[notifications][devices/me] error:", e);
    res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/* =================================================================== */
/*                               ADMIN                                 */
/* =================================================================== */

/**
 * ADMIN — Manuel bildirim gönder (kullanıcıya bağlı token’lar)
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
  const start = Date.now();
  const reqKey = `admin:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  try {
    const { targets, email, title, body, data } = req.body || {};
    console.log(
      `[notifications][admin/send] targets=${targets} email=${email ?? "-"
      } titleLen=${(title || "").length} bodyLen=${(body || "").length}`
    );

    const validTargets = ["all", "customers", "restaurants", "email"];
    if (!validTargets.includes(targets)) {
      console.warn("[notifications][admin/send] invalid targets:", targets);
      return res
        .status(400)
        .json({ ok: false, error: "invalid targets" });
    }
    if (!title || !body) {
      console.warn("[notifications][admin/send] missing title/body");
      return res
        .status(400)
        .json({ ok: false, error: "title/body required" });
    }

    // Hedef kullanıcıları bul
    let userQuery = {};
    if (targets === "customers") userQuery = { role: "customer" };
    if (targets === "restaurants") userQuery = { role: "restaurant" };
    if (targets === "email") {
      if (!email)
        return res
          .status(400)
          .json({ ok: false, error: "email required" });
      userQuery = { email: String(email).trim().toLowerCase() };
    }

    const users = await User.find(userQuery)
      .select("_id pushTokens")
      .lean();

    // Aktif token’ları topla
    const tokenTuples = [];
    for (const u of users) {
      const tokens = (u.pushTokens || [])
        .filter((t) => t?.isActive && t?.token)
        .map((t) => t.token);
      for (const token of tokens)
        tokenTuples.push({ userId: u._id, token });
    }
    console.log(
      `[notifications][admin/send] matchedUsers=${users.length} activeTokens=${tokenTuples.length}`
    );

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
      const messages = ch.map((t) => ({
        to: t.token,
        sound: "default",
        ...payload,
      }));
      const result = await sendBatch(messages);

      // Log: type + key zorunlu
      const logs = ch.map((t) => {
        const tokenKey = (t.token || "").slice(-12);
        return {
          userId: t.userId,
          type: "admin_manual",
          key: `${reqKey}:${String(t.userId)}:${tokenKey}`,
          payload,
          sentAt: new Date(),
          providerResponse: result || {},
        };
      });

      if (logs.length) {
        try {
          await NotificationLog.insertMany(logs, { ordered: false });
        } catch (e) {
          console.warn(
            "[notifications][admin/send] log insert warn:",
            e?.message || e
          );
        }
      }

      sent += ch.length;
      console.log(
        `[notifications][admin/send] batch sent=${ch.length}`
      );
    }

    console.log(
      `[notifications][admin/send] DONE sent=${sent} in ${Date.now() - start
      }ms`
    );
    return res.json({
      ok: true,
      targetedUsers: users.length,
      targetedTokens: tokenTuples.length,
      sent,
    });
  } catch (e) {
    console.error("[notifications][admin/send] error:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || String(e) });
  }
});

/**
 * ADMIN — Cihazlara broadcast (misafirler dahil)
 * POST /api/notifications/admin/broadcast-devices
 * body: {
 *   title: string,
 *   body: string,
 *   data?: object,
 *   platform?: "ios"|"android"|"web",     // opsiyonel filtre
 *   activeOnly?: boolean,                  // default true
 *   limit?: number                         // test için kısıt
 * }
 */
r.post(
  "/admin/broadcast-devices",
  auth(),
  requireAdmin,
  async (req, res) => {
    try {
      const {
        title,
        body,
        data,
        platform,
        activeOnly = true,
        limit,
      } = req.body || {};

      if (!title || !body) {
        return res
          .status(400)
          .json({ ok: false, error: "title/body required" });
      }

      const q = {};
      if (platform) q.platform = platform;
      if (activeOnly) q.isActive = true;

      const max = Math.min(5000, Math.max(1, Number(limit) || 1000));
      const devices = await Device.find(q)
        .select("deviceId expoToken platform userId")
        .limit(max)
        .lean();

      const tuples = devices
        .filter((d) => d.expoToken)
        .map((d) => ({
          deviceId: d.deviceId,
          expoToken: d.expoToken,
          platform: d.platform || null,
          userId: d.userId || null,
        }));

      const r2 = await sendToDevices(tuples, {
        title,
        body,
        data,
        type: "admin_broadcast_devices",
        keyPrefix: "admin_broadcast",
      });

      return res.json({
        ok: true,
        targetedDevices: tuples.length,
        sent: r2.sent,
        invalidTokens: r2.invalidTokens || [],
        invalidCodes: r2.invalidCodes || [],
      });
    } catch (e) {
      console.error(
        "[notifications][admin/broadcast-devices] error:",
        e
      );
      res
        .status(500)
        .json({ ok: false, error: e?.message || String(e) });
    }
  }
);

export default r;