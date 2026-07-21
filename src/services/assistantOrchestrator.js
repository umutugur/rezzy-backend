// src/services/assistantOrchestrator.js
//
// LLM tool-calling orchestration for the assistant (spec §1/§3/§5, plan A3).
// Runs ONE conversational turn through Gemini function-calling; write tools
// produce a signed draft (confirm card) instead of executing. If the LLM is
// unavailable (no key / error), returns { kind:"fallback" } so the caller
// keeps the existing intent+rule path untouched.

import { generateWithTools } from "../ai/llmClient.js";
import { ASSISTANT_TOOLS } from "../ai/assistant.tools.js";
import { ASSISTANT_READ_TOOLS } from "./assistantReadTools.js";
import { buildUserContext, summarizeContext } from "./assistantContext.js";
import { createDraft } from "./assistantDraft.helpers.js";
import { buildDraftFor } from "./assistantWriteTools.js";

function systemPrompt(lang, contextJson) {
  return [
    "You are Rezvix's in-app assistant. Rezvix is a super-app for Cyprus/Greece/Turkey/UK with four services: table reservations, restaurant delivery, grocery/market delivery, and taxi (instant + scheduled).",
    `Always reply in the user's language (code: ${lang}). Be warm, concise, and use emojis sparingly.`,
    "Use the provided tools to look up real data — NEVER invent prices, availability, IDs, or order states; call a read tool instead.",
    "For any action that creates, changes, or cancels something (reservation, order, ride), call the matching draft_* tool. This produces a confirmation card the user must approve — you do NOT complete the action yourself.",
    "Never ask for card numbers or payment details in chat; when online payment is required the app opens the payment screen.",
    "If a request is outside these services (medical, legal, unrelated), decline politely and steer back.",
    "The user's current live context (compact JSON):",
    contextJson,
  ].join("\n");
}

function toGeminiHistory(history) {
  // history: [{ role:"user"|"assistant", content }] → Gemini contents
  return (history || [])
    .filter((m) => m && m.content)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }],
    }));
}

/**
 * @returns {Promise<
 *   | { kind:"fallback" }
 *   | { kind:"text", text:string }
 *   | { kind:"handoff", text:string, handoff:{screen,params,label} }
 *   | { kind:"confirm", text:string, draft:object, card:object }
 * >}
 */
export async function runToolTurn({ message, lang, userId, region, history, fetchImpl } = {}) {
  if (!process.env.GEMINI_API_KEY) return { kind: "fallback" };

  let contextJson = "{}";
  if (userId) {
    try {
      contextJson = JSON.stringify(summarizeContext(await buildUserContext(userId)));
    } catch { contextJson = "{}"; }
  }

  const messages = [...toGeminiHistory(history), { role: "user", parts: [{ text: String(message) }] }];

  const executeRead = async (name, args) => {
    const fn = ASSISTANT_READ_TOOLS[name];
    if (!fn) return { error: `unknown_read_tool:${name}` };
    return fn(args || {}, { userId, region });
  };

  let out;
  try {
    out = await generateWithTools({
      messages,
      tools: ASSISTANT_TOOLS,
      systemPrompt: systemPrompt(lang, contextJson),
      language: lang,
      executeRead,
      fetchImpl,
    });
  } catch {
    return { kind: "fallback" };
  }

  if (!out || out.fallback) return { kind: "fallback" };

  // Write/handoff tool requested
  if (out.draftRequest) {
    const { name, args } = out.draftRequest;
    if (!userId) {
      return { kind: "text", text: "Bu işlem için giriş yapman gerekiyor." };
    }
    const built = await buildDraftFor(name, args, { userId, region });
    if (built.error) return { kind: "text", text: `Bunu yapamadım: ${built.error}` };
    if (built.handoff) {
      return { kind: "handoff", text: out.partialText || "", handoff: built.handoff };
    }
    // Confirm draft
    const draft = createDraft({ kind: built.kind, params: built.params, serverTotals: built.serverTotals || {} });
    return {
      kind: "confirm",
      text: out.partialText || "",
      draft,
      card: {
        draftId: draft.draftId,
        kind: built.kind,
        title: built.card?.title || "Onay",
        lines: built.card?.lines || [],
        total: built.card?.total,
        destructive: !!built.card?.destructive,
        expiresAt: draft.expiresAt,
      },
    };
  }

  // Plain text answer
  return { kind: "text", text: out.text || "" };
}
