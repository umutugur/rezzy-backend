// DB-free smoke for the assistant tool-calling orchestration (plan A3, §7).
// Exercises runToolTurn wiring with a mock Gemini `fetchImpl` and DB-free write
// tools (cancel/edit are pure validation). Run: node src/scripts/__smoke_assistant_flow.mjs
import assert from "node:assert";
import { runToolTurn } from "../services/assistantOrchestrator.js";
import { createDraft, verifyDraft } from "../services/assistantDraft.helpers.js";

// ── Mock Gemini response builders (candidates[].content.parts[]) ─────────────
function geminiText(text) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
}
function geminiFunctionCall(name, args) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] }) };
}

const prevKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "test-key"; // orchestrator gate

// 1) No key → fallback (restore-then-check)
{
  delete process.env.GEMINI_API_KEY;
  const r = await runToolTurn({ message: "selam", lang: "tr", userId: null, history: [] });
  assert.strictEqual(r.kind, "fallback", "keysiz → fallback");
  process.env.GEMINI_API_KEY = "test-key";
}

// 2) Plain text answer
{
  const r = await runToolTurn({
    message: "merhaba", lang: "tr", userId: "u1", history: [],
    fetchImpl: async () => geminiText("Merhaba! Nasıl yardımcı olabilirim?"),
  });
  assert.strictEqual(r.kind, "text");
  assert.match(r.text, /Merhaba/);
}

// 3) Write tool (DB-free cancel) → confirm card + signed draft
{
  const r = await runToolTurn({
    message: "rezervasyonumu iptal et", lang: "tr", userId: "u1", history: [],
    fetchImpl: async () => geminiFunctionCall("draft_reservation_cancel", { rid: "6a35b44d85b09f8304557b03" }),
  });
  assert.strictEqual(r.kind, "confirm", "write tool → confirm");
  assert.ok(r.draft?.draftId && r.draft?.hash && r.draft?.expiresAt, "imzalı draft");
  assert.strictEqual(r.card.kind, "reservation_cancel");
  assert.strictEqual(r.card.destructive, true);
  // Onay doğrulaması: aynı params → ok
  const ok = verifyDraft(r.draft, { kind: r.draft.kind, params: r.draft.params, serverTotals: r.draft.serverTotals });
  assert.deepStrictEqual(ok, { ok: true });
}

// 4) Invalid write args → text error (no draft)
{
  const r = await runToolTurn({
    message: "iptal", lang: "tr", userId: "u1", history: [],
    fetchImpl: async () => geminiFunctionCall("draft_reservation_cancel", { rid: "bad" }),
  });
  assert.strictEqual(r.kind, "text");
  assert.match(r.text, /yapamad/i);
}

// 5) Write tool but not logged in → login prompt
{
  const r = await runToolTurn({
    message: "iptal et", lang: "tr", userId: null, history: [],
    fetchImpl: async () => geminiFunctionCall("draft_reservation_cancel", { rid: "6a35b44d85b09f8304557b03" }),
  });
  assert.strictEqual(r.kind, "text");
  assert.match(r.text, /giriş/i);
}

// 6) Scheduled-ride create → handoff (reservation-linked, cannot stand alone)
{
  const r = await runToolTurn({
    message: "yarına planlı taksi", lang: "tr", userId: "u1", history: [],
    fetchImpl: async () => geminiFunctionCall("draft_scheduled_ride", {
      pickup: { lat: 35.1, lng: 33.3, address: "Ev" },
      dropoff: { lat: 35.2, lng: 33.4, address: "Restoran" },
      scheduledAtISO: new Date(Date.now() + 864e5).toISOString(),
    }),
  });
  assert.strictEqual(r.kind, "handoff");
  assert.strictEqual(r.handoff.screen, "ReservationStep1");
}

// 7) Draft tamper/expiry (execute-side security)
{
  const d = createDraft({ kind: "taxi_cancel", params: { rideId: "abc" }, serverTotals: {} });
  assert.deepStrictEqual(verifyDraft(d, { kind: d.kind, params: { rideId: "XXX" }, serverTotals: {} }), { error: "tampered" });
  const expired = { ...d, expiresAt: new Date(Date.now() - 1000).toISOString() };
  assert.deepStrictEqual(verifyDraft(expired, { kind: d.kind, params: d.params, serverTotals: {} }), { error: "expired" });
}

if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
console.log("__smoke_assistant_flow: all assertions passed");
