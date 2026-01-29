// services/notification.service.js
// Global fetch (Node 18+). Ayrı paket gerekmez.
import NotificationLog from "../models/NotificationLog.js";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";
import device from "../models/Device.js";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// Bazı bariz geçersiz tokenları ayıklamak için basit regex (SDK kullanmıyoruz)
const isLikelyExpoToken = (t) =>
  typeof t === "string" && /^ExponentPushToken\[/i.test(t);

// ---- Token toplama ----
async function getUserPushTokens(userId) {
  const u = await User.findById(userId)
    .select("pushTokens notificationPrefs")
    .lean()
    .catch(() => null);
  if (!u) return [];
  if (u.notificationPrefs?.push === false) return [];
  return (u.pushTokens || [])
    .filter((t) => t?.isActive && t?.token && isLikelyExpoToken(t.token))
    .map((t) => t.token);
}

async function getRestaurantOwnerTokens(restaurantId) {
  const r = await Restaurant.findById(restaurantId)
    .select("owner")
    .lean()
    .catch(() => null);
  if (!r?.owner) return [];
  return getUserPushTokens(r.owner);
}

// ---- Idempotency log ----
async function alreadySent(key) {
  if (!key) return false;
  return !!(await NotificationLog.exists({ key }));
}

async function logNotification({
  key,
  type,
  userId,
  restaurantId,
  payload,
  meta,
}) {
  try {
    await NotificationLog.create({
      key,
      type,
      userId,
      restaurantId,
      payload,
      meta: meta || null,
      sentAt: new Date(),
    });
  } catch (_) {
    /* unique çakışırsa sorun değil */
  }
}

// ---- Expo gönderim + receipt kontrol ----
// INVALID TOKEN TEMİZLEME İÇİN GÜNCEL: invalidTokens (string[]) geri döner
async function sendExpoPush(tokens, payload) {
  const valid = tokens.filter(isLikelyExpoToken);
  const invalidImmediate = tokens.filter((t) => !isLikelyExpoToken(t));

  if (valid.length === 0) {
    return {
      ok: true,
      sent: 0,
      tickets: [],
      invalidTokens: [...invalidImmediate],
      invalidCodes: [],
    };
  }

  const base = { sound: "default", priority: "high", channelId: "default" };
  const messages = valid.map((to) => ({ to, ...base, ...payload }));

  // Expo 100 adede kadar tek post kabul ediyor; yine de büyük listeler için dilimleyelim
  const chunkSize = 100;
  const chunks = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }

  const allTickets = [];
  const idToToken = new Map(); // receipt id -> token
  const immediateInvalidTokens = []; // ticket.status === "error" anında yakalananlar
  const invalidCodes = [];

  for (const chunk of chunks) {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    }).catch((e) => {
      console.error("expo push fetch error:", e);
      return null;
    });

    if (!resp) continue;

    let json = null;
    try {
      json = await resp.json();
    } catch (_) {
      try {
        console.error("expo push non-json response:", await resp.text());
      } catch {}
    }

    if (!resp.ok) {
      console.error("expo push http error:", resp.status, json || "");
      continue;
    }

    const tickets = Array.isArray(json?.data) ? json.data : [];

    // ticket.status === "error" olanları hemen token bazında işaretle
    tickets.forEach((t, idx) => {
      const token = chunk[idx]?.to;
      if (t?.status === "error") {
        if (token) immediateInvalidTokens.push(token);
        if (t?.details?.error) invalidCodes.push(t.details.error);
      }
      if (t?.id && token) idToToken.set(t.id, token);
    });

    allTickets.push(...tickets);
  }

  // Receipt ID’lerinden token’a geri git
  const receiptIds = allTickets.map((t) => t?.id).filter(Boolean);
  const invalidFromReceipts = [];

  if (receiptIds.length) {
    for (let i = 0; i < receiptIds.length; i += 100) {
      const ids = receiptIds.slice(i, i + 100);
      const resp = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      }).catch((e) => {
        console.error("expo receipt fetch error:", e);
        return null;
      });

      if (!resp) continue;

      let json = null;
      try {
        json = await resp.json();
      } catch {}

      const receipts = json?.data || {};
      Object.entries(receipts).forEach(([rid, r]) => {
        if (r && r.status === "error") {
          const code = r.details?.error || "";
          if (code) invalidCodes.push(code);
          if (code === "DeviceNotRegistered") {
            const tok = idToToken.get(rid);
            if (tok) invalidFromReceipts.push(tok);
          }
        }
      });
    }
  }

  // Token string’lerini birleştirip benzersizleştir
  const invalidTokens = [
    ...new Set([...invalidImmediate, ...immediateInvalidTokens, ...invalidFromReceipts]),
  ];

  return {
    ok: true,
    sent: valid.length,
    tickets: allTickets,
    invalidTokens, // <-- SADECE BU LİSTE DB'DEN SİLİNİR
    invalidCodes: [...new Set(invalidCodes)],
  };
}

/* ------------------------------------------------------------------ */
/* ----------------------- DEVICE (GUEST) PUSH ----------------------- */
/* ------------------------------------------------------------------ */

/**
 * Misafir/cihaz listesine push gönderir.
 * @param {Array<{deviceId:string, expoToken:string, userId?:string, platform?:string}>} devices
 * @param {{ title:string, body?:string, data?:object, type?:string, keyPrefix?:string }} param1
 * @returns
 */
export async function sendToDevices(
  devices,
  { title, body, data, type, keyPrefix = "device" }
) {
  const tokens = devices.map((d) => d.expoToken).filter(Boolean);
  const payload = { title, body, data };
  const r = await sendExpoPush(tokens, payload);

  // Geçersizleri Device tablosunda disable et
  if (r.invalidTokens?.length) {
    await Device.updateMany(
      { expoToken: { $in: r.invalidTokens } },
      {
        $set: {
          isActive: false,
          lastInvalidAt: new Date(),
          lastInvalidCode: "DeviceNotRegistered",
        },
      }
    ).catch(() => {});
  }

  // Log
  const logs = [];
  for (const d of devices) {
    logs.push({
      key: `${keyPrefix}:${d.deviceId}:${Date.now()}`,
      type: type || "device_push",
      userId: d.userId || null,
      payload,
      meta: { deviceId: d.deviceId, platform: d.platform || null },
      sentAt: new Date(),
    });
  }
  if (logs.length) {
    try {
      await NotificationLog.insertMany(logs, { ordered: false });
    } catch {
      /* noop */
    }
  }

  return r;
}

/* ------------------------------------------------------------------ */
/* ------------------------- USER-BOUND PUSH ------------------------- */
/* ------------------------------------------------------------------ */

// ---- Public API ----
export async function notifyUser(userId, { title, body, data, key, type, sound, channelId }) {
  if (key && (await alreadySent(key))) return { ok: true, dup: true };

  const tokens = await getUserPushTokens(userId);
  const payload = { title, body, data };
  if (sound) payload.sound = sound;
  if (channelId) payload.channelId = channelId;
  const r = await sendExpoPush(tokens, payload);

  // ❗️Sadece gerçekten geçersiz olan token’ları temizle
  if (r.invalidTokens?.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { pushTokens: { token: { $in: r.invalidTokens } } } }
    ).catch(() => {});
  }

  await logNotification({
    key,
    type,
    userId,
    payload,
    meta: { sent: r.sent, invalidTokens: r.invalidTokens, invalidCodes: r.invalidCodes },
  });
  return r;
}

export async function notifyRestaurantOwner(
  restaurantId,
  { title, body, data, key, type, sound, channelId }
) {
  if (key && (await alreadySent(key))) return { ok: true, dup: true };

  const tokens = await getRestaurantOwnerTokens(restaurantId);
  const payload = { title, body, data };
  if (sound) payload.sound = sound;
  if (channelId) payload.channelId = channelId;
  const r = await sendExpoPush(tokens, payload);

  if (r.invalidTokens?.length) {
    const rest = await Restaurant.findById(restaurantId)
      .select("owner")
      .lean()
      .catch(() => null);
    if (rest?.owner) {
      await User.updateOne(
        { _id: rest.owner },
        { $pull: { pushTokens: { token: { $in: r.invalidTokens } } } }
      ).catch(() => {});
    }
  }

  await logNotification({
    key,
    type,
    restaurantId,
    payload,
    meta: { sent: r.sent, invalidTokens: r.invalidTokens, invalidCodes: r.invalidCodes },
  });
  return r;
}
