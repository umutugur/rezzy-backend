// rezzy-backend/src/utils/expoPush.js
// Sends Expo push notifications in batches of 100.
// Uses Node 18+ global fetch.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * @param {string[]} tokens  – Expo push tokens (ExponentPushToken[...])
 * @param {{ title: string, body: string, sound?: string, data?: object, priority?: string }} payload
 */
export async function sendExpoPush(tokens, payload) {
  const validTokens = tokens.filter(
    (t) => typeof t === "string" && t.startsWith("ExponentPushToken")
  );
  if (validTokens.length === 0) return;

  const messages = validTokens.map((token) => ({
    to: token,
    sound: payload.sound ?? "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    priority: payload.priority ?? "high",
  }));

  // Batch into chunks of 100 (Expo limit)
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });
    } catch (err) {
      console.error("[expoPush] send error:", err.message);
    }
  }
}
