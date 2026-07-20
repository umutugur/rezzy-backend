import assert from "node:assert";

process.env.GEMINI_API_KEY = "test-key";

const { generateWithTools } = await import("./llmClient.js");

const TOOLS = [
  {
    name: "search_restaurants",
    description: "Search restaurants.",
    mode: "read",
    parameters: { type: "OBJECT", properties: { q: { type: "STRING" } }, required: [] },
  },
  {
    name: "draft_reservation",
    description: "Draft a reservation.",
    mode: "write",
    parameters: {
      type: "OBJECT",
      properties: { restaurantId: { type: "STRING" } },
      required: ["restaurantId"],
    },
  },
  {
    name: "handoff",
    description: "Hand off to a screen.",
    mode: "handoff",
    parameters: { type: "OBJECT", properties: { screen: { type: "STRING" } }, required: ["screen"] },
  },
];

function geminiTextResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

function geminiFunctionCallResponse(name, args) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }],
    }),
  };
}

// ─── (a) single read functionCall then final text ──────────────────────────
{
  let call = 0;
  const executedReads = [];
  const fetchImpl = async () => {
    call += 1;
    if (call === 1) {
      return geminiFunctionCallResponse("search_restaurants", { q: "meyhane" });
    }
    return geminiTextResponse("Girne'de birkaç meyhane buldum.");
  };
  const executeRead = async (name, args) => {
    executedReads.push({ name, args });
    return { results: [{ id: "r1", name: "Deniz Meyhane" }] };
  };

  const result = await generateWithTools({
    messages: [{ role: "user", text: "meyhane bul" }],
    tools: TOOLS,
    systemPrompt: "sys",
    language: "tr",
    executeRead,
    fetchImpl,
  });

  assert.strictEqual(call, 2, "should call the model twice (functionCall + final)");
  assert.strictEqual(executedReads.length, 1);
  assert.strictEqual(executedReads[0].name, "search_restaurants");
  assert.deepStrictEqual(result, { text: "Girne'de birkaç meyhane buldum." });
}

// ─── (b) write functionCall interrupts the loop with a draftRequest ────────
{
  const fetchImpl = async () =>
    geminiFunctionCallResponse("draft_reservation", { restaurantId: "rest-1" });
  const executeRead = async () => {
    throw new Error("executeRead must not be called for write tools");
  };

  const result = await generateWithTools({
    messages: [{ role: "user", text: "rezervasyon yap" }],
    tools: TOOLS,
    systemPrompt: "sys",
    language: "tr",
    executeRead,
    fetchImpl,
  });

  assert.deepStrictEqual(result, {
    draftRequest: { name: "draft_reservation", args: { restaurantId: "rest-1" } },
  });
}

// ─── (c) exceeding 6 turns returns {text, truncated:true} ───────────────────
{
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return geminiFunctionCallResponse("search_restaurants", { q: `try-${calls}` });
  };
  const executeRead = async () => ({ results: [] });

  const result = await generateWithTools({
    messages: [{ role: "user", text: "sonsuz döngü" }],
    tools: TOOLS,
    systemPrompt: "sys",
    language: "tr",
    executeRead,
    fetchImpl,
  });

  assert.strictEqual(calls, 6, "must stop after 6 model turns");
  assert.strictEqual(result.truncated, true);
  assert.strictEqual(typeof result.text, "string");
}

// ─── (d) HTTP error from the model -> fallback, never throws ───────────────
{
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: "server error" }),
  });
  const executeRead = async () => ({ results: [] });

  const result = await generateWithTools({
    messages: [{ role: "user", text: "merhaba" }],
    tools: TOOLS,
    systemPrompt: "sys",
    language: "tr",
    executeRead,
    fetchImpl,
  });

  assert.strictEqual(result.fallback, true);
  assert.ok(result.error);
}

// ─── (e) network throw -> fallback, never throws ───────────────────────────
{
  const fetchImpl = async () => {
    throw new Error("ECONNRESET");
  };
  const executeRead = async () => ({ results: [] });

  const result = await generateWithTools({
    messages: [{ role: "user", text: "merhaba" }],
    tools: TOOLS,
    systemPrompt: "sys",
    language: "tr",
    executeRead,
    fetchImpl,
  });

  assert.strictEqual(result.fallback, true);
  assert.ok(/ECONNRESET/.test(result.error));
}

console.log("llmClient.tools.test.mjs: all assertions passed");
