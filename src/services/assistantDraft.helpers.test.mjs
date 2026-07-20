import assert from "node:assert";
import {
  createDraft,
  verifyDraft,
  validateToolCatalog,
} from "./assistantDraft.helpers.js";

// ─── validateToolCatalog ───────────────────────────────────────────────────

// 1) Geçerli katalog -> boş hata listesi
{
  const tools = [
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
        properties: { restaurantId: { type: "STRING" }, partySize: { type: "NUMBER" } },
        required: ["restaurantId", "partySize"],
      },
    },
    {
      name: "handoff",
      description: "Hand off to a screen.",
      mode: "handoff",
      parameters: { type: "OBJECT", properties: { screen: { type: "STRING" } }, required: ["screen"] },
    },
  ];
  const errors = validateToolCatalog(tools);
  assert.deepStrictEqual(errors, []);
}

// 2) Bozuk katalog: isim çakışması, required alan properties'te yok, geçersiz mode
{
  const tools = [
    {
      name: "dup_tool",
      description: "First.",
      mode: "read",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },
    {
      name: "dup_tool",
      description: "Duplicate name.",
      mode: "write",
      parameters: {
        type: "OBJECT",
        properties: { a: { type: "STRING" } },
        required: ["a", "missingField"],
      },
    },
    {
      name: "bad_mode_tool",
      description: "Invalid mode.",
      mode: "delete",
      parameters: { type: "OBJECT", properties: {}, required: [] },
    },
  ];
  const errors = validateToolCatalog(tools);
  assert.ok(errors.length >= 3, `expected multiple errors, got: ${JSON.stringify(errors)}`);
  assert.ok(errors.some((e) => /duplicate/i.test(e) && /dup_tool/.test(e)));
  assert.ok(errors.some((e) => /missingField/.test(e)));
  assert.ok(errors.some((e) => /bad_mode_tool/.test(e) && /mode/i.test(e)));
}

// 3) Katalog dizi değilse
{
  const errors = validateToolCatalog(null);
  assert.ok(errors.length >= 1);
}

// ─── createDraft / verifyDraft ─────────────────────────────────────────────

// 4) Round-trip: aynı params/totals ile doğrulama başarılı
{
  const kind = "market_order";
  const params = { storeId: "s1", items: [{ productId: "p1", qty: 2 }] };
  const serverTotals = { total: 199.9, currency: "TRY" };

  const draft = createDraft({ kind, params, serverTotals });
  assert.ok(draft.draftId && typeof draft.draftId === "string");
  assert.ok(draft.hash && typeof draft.hash === "string");
  assert.ok(draft.expiresAt);

  const result = verifyDraft(draft, { kind, params, serverTotals });
  assert.deepStrictEqual(result, { ok: true });
}

// 5) Kurcalanmış params -> tampered
{
  const kind = "market_order";
  const params = { storeId: "s1", items: [{ productId: "p1", qty: 2 }] };
  const serverTotals = { total: 199.9, currency: "TRY" };

  const draft = createDraft({ kind, params, serverTotals });
  const tamperedParams = { storeId: "s1", items: [{ productId: "p1", qty: 999 }] };

  const result = verifyDraft(draft, { kind, params: tamperedParams, serverTotals });
  assert.deepStrictEqual(result, { error: "tampered" });
}

// 6) Süresi geçmiş draft -> expired
{
  const kind = "taxi_call";
  const params = { pickup: { lat: 1, lng: 2 }, dropoff: { lat: 3, lng: 4 } };
  const serverTotals = { fare: 50 };

  const draft = createDraft({ kind, params, serverTotals });
  draft.expiresAt = new Date(Date.now() - 60_000).toISOString(); // 1 dk önce sona ermiş

  const result = verifyDraft(draft, { kind, params, serverTotals });
  assert.deepStrictEqual(result, { error: "expired" });
}

console.log("assistantDraft.helpers.test.mjs: all assertions passed");
