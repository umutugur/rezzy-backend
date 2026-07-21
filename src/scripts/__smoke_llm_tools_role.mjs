// DB-free unit smoke for generateWithTools multi-turn function-calling.
// Regression guard: Gemini REST accepts only "user"/"model" roles, so the
// functionResponse round-trip MUST be sent with role:"user" (role:"function"
// returns HTTP 400 and silently drops the assistant to the fallback path).
// Run: node src/scripts/__smoke_llm_tools_role.mjs
import assert from "node:assert";
import { generateWithTools } from "../ai/llmClient.js";

const prevKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "test-key";

const tools = [
  { name: "foo", description: "read foo", parameters: { type: "OBJECT", properties: {}, required: [] }, mode: "read" },
];

let secondBody = null;
let call = 0;
const fetchImpl = async (_url, opts) => {
  call += 1;
  if (call === 1) {
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: "foo", args: {} } }] } }] }) };
  }
  secondBody = JSON.parse(opts.body);
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "done" }] } }] }) };
};

const out = await generateWithTools({
  messages: [{ role: "user", text: "hi" }],
  tools,
  systemPrompt: "sys",
  language: "tr",
  executeRead: async () => ({ ok: 1 }),
  fetchImpl,
});

assert.strictEqual(out.text, "done", "multi-turn should resolve to final text");
assert.ok(secondBody, "second round-trip must have happened");
const roles = secondBody.contents.map((c) => c.role);
assert.ok(!roles.includes("function"), `no invalid role:function (got ${roles.join(",")})`);
const fnResp = secondBody.contents.find((c) => c.parts?.some((p) => p.functionResponse));
assert.ok(fnResp, "functionResponse must be present");
assert.strictEqual(fnResp.role, "user", "functionResponse must be sent with role:user");

if (prevKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prevKey;
console.log("__smoke_llm_tools_role: all assertions passed");
