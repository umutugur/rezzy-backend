// Global fetch (Node 18+). Ayrı paket gerekmez.
import NotificationLog from "../models/NotificationLog.js";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function getUserPushTokens(userId) {
  const u = await User.findById(userId).select("pushTokens notificationPrefs").lean().catch(()=>null);
  if (!u) return [];
  const wants = u.notificationPrefs?.push !== false;
  if (!wants) return [];
  const tokens = Array.isArray(u.pushTokens)
    ? u.pushTokens.filter(t => t?.isActive && t?.token).map(t => t.token)
    : [];
  return tokens;
}

async function getRestaurantOwnerTokens(restaurantId) {
  const r = await Restaurant.findById(restaurantId).select("owner").lean().catch(()=>null);
  if (!r?.owner) return [];
  return getUserPushTokens(r.owner);
}

async function alreadySent(key) {
  if (!key) return false;
  const exists = await NotificationLog.exists({ key });
  return !!exists;
}

async function logNotification({ key, type, userId, restaurantId, payload }) {
  try {
    await NotificationLog.create({ key, type, userId, restaurantId, payload, sentAt: new Date() });
  } catch (_) {/* unique çakışırsa sorun değil */}
}

async function sendExpoPush(tokens, payload) {
  if (!tokens.length) return { ok: true, sent: 0 };
  // Expo 100 mesajı tek postta kabul eder; biz basitçe tek seferde gönderiyoruz.
  const messages = tokens.map(to => ({ to, ...payload }));
  const resp = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  }).catch(()=>null);
  return { ok: !!resp, sent: tokens.length };
}

export async function notifyUser(userId, { title, body, data, key, type }) {
  if (key && await alreadySent(key)) return { ok: true, dup: true };
  const tokens = await getUserPushTokens(userId);
  const payload = { title, body, data };
  const r = await sendExpoPush(tokens, payload);
  await logNotification({ key, type, userId, payload });
  return r;
}

export async function notifyRestaurantOwner(restaurantId, { title, body, data, key, type }) {
  if (key && await alreadySent(key)) return { ok: true, dup: true };
  const tokens = await getRestaurantOwnerTokens(restaurantId);
  const payload = { title, body, data };
  const r = await sendExpoPush(tokens, payload);
  await logNotification({ key, type, restaurantId, payload });
  return r;
}
