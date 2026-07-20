// src/services/assistantDraft.helpers.js
//
// Pure helpers for the assistant's write-tool safety mechanism:
//   - createDraft/verifyDraft: signed, TTL-bound drafts so the LLM can never
//     execute a write directly — only propose one that the server re-prices
//     and the user must confirm (see spec §3).
//   - validateToolCatalog: static sanity check for src/ai/assistant.tools.js.

import crypto from "node:crypto";

const DRAFT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function computeHash(kind, params, serverTotals) {
  const payload = `${kind}|${JSON.stringify(params ?? {})}|${JSON.stringify(serverTotals ?? {})}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Build a signed draft for a pending write action.
 * @returns {{draftId:string, hash:string, expiresAt:string, kind:string, params:object, serverTotals:object}}
 */
export function createDraft({ kind, params, serverTotals }) {
  const draftId = crypto.randomUUID();
  const hash = computeHash(kind, params, serverTotals);
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString();
  return { draftId, hash, expiresAt, kind, params, serverTotals };
}

/**
 * Verify a previously-created draft against the kind/params/serverTotals
 * that are about to be executed.
 * @returns {{ok:true}|{error:"expired"|"tampered"}}
 */
export function verifyDraft(draft, { kind, params, serverTotals }) {
  if (!draft || typeof draft !== "object" || !draft.hash || !draft.expiresAt) {
    return { error: "tampered" };
  }

  const expiresAtMs = new Date(draft.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return { error: "expired" };
  }

  const expectedHash = computeHash(kind, params, serverTotals);
  if (expectedHash !== draft.hash) {
    return { error: "tampered" };
  }

  return { ok: true };
}

const VALID_MODES = new Set(["read", "write", "handoff"]);

/**
 * Validate the static tool catalog: unique names, required fields that
 * actually exist in properties, and valid `mode` values.
 * @returns {string[]} list of human-readable errors (empty = valid)
 */
export function validateToolCatalog(tools) {
  if (!Array.isArray(tools)) {
    return ["tool catalog must be an array"];
  }

  const errors = [];
  const seenNames = new Set();

  for (const tool of tools) {
    if (!tool || typeof tool !== "object") {
      errors.push(`tool entry is not an object: ${JSON.stringify(tool)}`);
      continue;
    }

    const { name, mode, parameters } = tool;

    if (!name || typeof name !== "string") {
      errors.push(`tool is missing a valid string name: ${JSON.stringify(tool)}`);
    } else {
      if (seenNames.has(name)) {
        errors.push(`duplicate tool name: "${name}"`);
      }
      seenNames.add(name);
    }

    if (!VALID_MODES.has(mode)) {
      errors.push(`tool "${name || "?"}" has invalid mode: ${JSON.stringify(mode)}`);
    }

    const properties =
      parameters && typeof parameters === "object" && parameters.properties && typeof parameters.properties === "object"
        ? parameters.properties
        : {};
    const propertyKeys = new Set(Object.keys(properties));
    const required = Array.isArray(parameters?.required) ? parameters.required : [];

    for (const req of required) {
      if (!propertyKeys.has(req)) {
        errors.push(`tool "${name || "?"}" required field "${req}" is missing from properties`);
      }
    }
  }

  return errors;
}
