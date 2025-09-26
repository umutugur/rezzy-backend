// Global fetch (Node 18+). Ayrı paket gerekmez.
import NotificationLog from "../models/NotificationLog.js";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// Bazı bariz geçersiz tokenları ayıklamak için basit regex (SDK kullanmıyoruz)
const isLikelyExpoToken = t => typeof t === "string" && /^ExponentPushToken\[/i.test(t);

// ---- Token toplama ----
async function getUserPushTokens(userId) {
  const u = await User.findById(userId)
    .select("pushTokens notificationPrefs")
    .lean()
    .catch(() => null);
  if (!u) return [];
  if (u.notificationPrefs?.push === false) return [];
  return (u.pushTokens || [])
    .filter(t => t?.isActive && t?.token && isLikelyExpoToken(t.token))
    .map(t => t.token);
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

async function logNotification({ key, type, userId, restaurantId, payload, meta }) {
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
  } catch (_) {} // unique çakışırsa sorun değil
}

// ---- Expo gönderim + receipt kontrol ----
/**
 * Expo'ya gönderir, ticket'ları ve hataları döner.
 *  - 100'lük chunk'lar halinde gönderir
 *  - resp.ok ve body'yi kontrol eder
 *  - receipt'leri sorgular, "DeviceNotRegistered" vb. hatalarda tokenları döner
 */
async function sendExpoPush(tokens, payload) {
  const valid = tokens.filter(isLikelyExpoToken);
  const invalidImmediate = tokens.filter(t => !isLikelyExpoToken(t));
  if (valid.length === 0) {
    return { ok: true, sent: 0, tickets: [], invalid: invalidImmediate };
  }

  // Tek tip payload defaultları
  const base = {
    sound: "default",
    priority: "high",
    channelId: "default", // Android kanalı
  };
  const messages = valid.map(to => ({ to, ...base, ...payload }));

  // Expo 100 adede kadar tek post kabul ediyor; yine de büyük listeler için dilimleyelim
  const chunkSize = 100;
  const chunks = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }

  const tickets = [];
  for (const chunk of chunks) {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
        // "Authorization": `Bearer ${process.env.EXPO_ACCESS_TOKEN}` // genelde gerekmez
      },
      body: JSON.stringify(chunk),
    }).catch(e => {
      console.error("expo push fetch error:", e);
      return null;
    });

    if (!resp) continue;

    let json = null;
    try { json = await resp.json(); } catch (_) {
      console.error("expo push non-json response:", await resp.text().catch(()=>"(no body)"));
    }

    if (!resp.ok) {
      console.error("expo push http error:", resp.status, json || "");
      continue;
    }

    // Başarılı cevap: { data: [{ status, id?, message?, details? }, ...] }
    const arr = Array.isArray(json?.data) ? json.data : [];
    tickets.push(...arr);
  }

  // Receipt ID'lerini topla
  const receiptIds = tickets.map(t => t?.id).filter(Boolean);
  const invalidFromReceipts = [];

  if (receiptIds.length) {
    // 100'lük parça parça receipt sor
    for (let i = 0; i < receiptIds.length; i += 100) {
      const ids = receiptIds.slice(i, i + 100);
      const resp = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      }).catch(e => {
        console.error("expo receipt fetch error:", e);
        return null;
      });

      if (!resp) continue;
      let json = null;
      try { json = await resp.json(); } catch (_) {}
      const receipts = json?.data || {};

      // receipt formatı: { "<id>": { status: "ok"|"error", message?, details? } }
      Object.values(receipts).forEach(r => {
        if (r && r.status === "error") {
          const err = r.details?.error || "";
          if (err === "DeviceNotRegistered") invalidFromReceipts.push("DeviceNotRegistered");
          // Diğer hatalar: "MessageTooBig", "MessageRateExceeded", "InvalidCredentials", ...
          console.warn("push receipt error:", r.message, r.details);
        }
      });
    }
  }

  // Ticket tarafında anında görülen hatalı to/formatlar
  const invalidFromTickets = tickets
    .filter(t => t?.status === "error")
    .map(t => (t?.details?.error || "error"));

  return {
    ok: true,
    sent: valid.length,
    tickets,
    invalid: [...invalidImmediate, ...invalidFromTickets, ...invalidFromReceipts],
  };
}

// ---- Public API ----
export async function notifyUser(userId, { title, body, data, key, type }) {
  if (key && await alreadySent(key)) return { ok: true, dup: true };

  const tokens = await getUserPushTokens(userId);
  const payload = { title, body, data };
  const r = await sendExpoPush(tokens, payload);

  // Hatalı/expired token'ları temizle (isteğe bağlı ama önerilir)
  if (r.invalid?.length) {
    await User.updateOne(
      { _id: userId },
      { $pull: { pushTokens: { token: { $in: tokens } } } } // basit: hatalı olanları toptan temizle
    ).catch(()=>{});
  }

  await logNotification({ key, type, userId, payload, meta: { sent: r.sent, invalid: r.invalid } });
  return r;
}

export async function notifyRestaurantOwner(restaurantId, { title, body, data, key, type }) {
  if (key && await alreadySent(key)) return { ok: true, dup: true };

  const tokens = await getRestaurantOwnerTokens(restaurantId);
  const payload = { title, body, data };
  const r = await sendExpoPush(tokens, payload);

  if (r.invalid?.length) {
    // Restoran sahibini bulup oradan temizlemek isterseniz:
    const rest = await Restaurant.findById(restaurantId).select("owner").lean().catch(()=>null);
    if (rest?.owner) {
      await User.updateOne(
        { _id: rest.owner },
        { $pull: { pushTokens: { token: { $in: tokens } } } }
      ).catch(()=>{});
    }
  }

  await logNotification({ key, type, restaurantId, payload, meta: { sent: r.sent, invalid: r.invalid } });
  return r;
}
