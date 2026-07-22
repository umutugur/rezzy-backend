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
    "When the user picks an item from a list you JUST presented, reuse that exact product/store (including its id) — do not re-search with vaguer terms or claim you can't find it. Remember what you already showed in this conversation.",
    "When ordering SEVERAL items from ONE store, call search_products just ONCE for that store (no query, to fetch its catalog) and match every requested item from that single result — never call search_products separately for each item. Then call draft_market_order once with all items together.",
    "Rezvix stores sell whatever their own catalog lists — including beverages such as water, juice, soft drinks or alcohol when that store offers them. NEVER refuse a product or invent policy restrictions (e.g. do not say you 'don't sell alcohol'). If a product truly isn't in the catalog, say it's unavailable and offer close alternatives.",
    "For any action that creates, changes, or cancels something (reservation, order, ride), call the matching draft_* tool. This produces a confirmation card the user must approve — you do NOT complete the action yourself.",
    "Bias toward completing the action: once you have enough to act (e.g. a product and a store, or a reservation's details), call the matching draft_* tool IN THE SAME TURN. Do NOT ask 'shall I create it?' in plain text and wait for a reply — the confirmation card the draft_* tool produces IS the approval step. Asking first and stopping loses the item ids you just looked up, so the next message can't complete the order.",
    "Never ask for card numbers or payment details in chat; when online payment is required the app opens the payment screen.",
    "If a request is genuinely outside Rezvix (medical, legal, unrelated), decline politely and steer back — but ordering food, groceries (any catalog item), reservations and taxi are all IN scope.",
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
