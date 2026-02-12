import AssistantThread from "../models/AssistantThread.js";

const MAX_MESSAGES = 20;

function normalizeSessionId(raw) {
  const v = (raw || "").toString().trim();
  return v.length ? v : null;
}

export async function getAssistantThread({ userId, sessionId, language }) {
  const sid = normalizeSessionId(sessionId);
  const uid = userId ? String(userId) : null;

  let thread = null;

  if (!uid && !sid) return null;

  if (uid) {
    thread = await AssistantThread.findOne({ userId: uid }).exec();
  } else if (sid) {
    thread = await AssistantThread.findOne({ sessionId: sid }).exec();
  }

  if (!thread) {
    thread = await AssistantThread.create({
      userId: uid || undefined,
      sessionId: sid || undefined,
      language: language || "tr",
      memory: {},
      messages: [],
    });
  } else {
    let changed = false;
    if (language && thread.language !== language) {
      thread.language = language;
      changed = true;
    }
    if (sid && !thread.sessionId) {
      thread.sessionId = sid;
      changed = true;
    }
    if (changed) await thread.save();
  }

  return thread;
}

export function appendThreadMessage(thread, role, text) {
  if (!thread) return;
  const trimmed = String(text || "").trim();
  if (!trimmed) return;

  thread.messages = Array.isArray(thread.messages) ? thread.messages : [];
  thread.messages.push({ role, text: trimmed, ts: new Date() });

  if (thread.messages.length > MAX_MESSAGES) {
    thread.messages = thread.messages.slice(-MAX_MESSAGES);
  }
}

export function getThreadHistory(thread, limit = 6) {
  if (!thread || !Array.isArray(thread.messages)) return [];
  const list = thread.messages.slice(-limit);
  return list.map((m) => ({
    role: m.role,
    text: m.text,
  }));
}

export function mergeThreadMemory(thread, patch) {
  if (!thread) return;
  const cur = thread.memory && typeof thread.memory === "object" ? thread.memory : {};
  thread.memory = { ...cur, ...(patch || {}) };
}
