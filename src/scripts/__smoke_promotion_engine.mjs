import assert from "node:assert";
import { computeDiscount, splitFunding, computeCommission, evaluateCoupon } from "../services/promotionEngine.js";

const NOW = new Date("2026-06-15T12:00:00Z");
const baseCampaign = {
  isActive: true,
  surface: "market",
  region: "TR",
  validFrom: new Date("2026-06-01"),
  validTo: new Date("2026-07-01"),
  discount: { kind: "fixed", value: 100, maxDiscount: null },
  conditions: { minSubtotal: 0, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["all"] },
  funding: { platformSharePct: 50 },
  requiresOptIn: false,
  usageLimit: { perUser: 1, total: null },
  budget: { cap: null, basis: "platform", spent: 0 },
};
const baseCtx = {
  base: 400, deliveryFee: 20, surface: "market", region: "TR", paymentMethod: "cash",
  storeId: "s1", storeCategory: "supermarket", organizationId: null,
  isStoreActiveForCampaign: true, now: NOW, userUsageCount: 0, totalUsageCount: 0,
};

// ── computeDiscount ──
assert.equal(computeDiscount("percent", 20, null, 400, 20), 80);
assert.equal(computeDiscount("percent", 50, 80, 400, 20), 80, "percent capped by maxDiscount");
assert.equal(computeDiscount("fixed", 100, null, 400, 20), 100);
assert.equal(computeDiscount("fixed", 500, null, 400, 20), 400, "fixed clamped to base");
assert.equal(computeDiscount("free_delivery", 0, null, 400, 20), 20, "= delivery fee");
assert.equal(computeDiscount("fixed_price", 100, null, 500, 0), 400, "fixed_price: gross-price");
assert.equal(computeDiscount("fixed_price", 600, null, 500, 0), 0, "fixed_price never negative");

// ── splitFunding ──
assert.deepEqual(splitFunding(100, 50), { platformContribution: 50, businessContribution: 50 });
assert.deepEqual(splitFunding(100, 0), { platformContribution: 0, businessContribution: 100 });
assert.deepEqual(splitFunding(100, 100), { platformContribution: 100, businessContribution: 0 });
assert.deepEqual(splitFunding(33.33, 50), { platformContribution: 16.67, businessContribution: 16.66 }, "round2 split");

// ── computeCommission (on gross) ──
assert.equal(computeCommission(400, 0.05), 20);

// ── evaluateCoupon happy path + split ──
let r = evaluateCoupon({ campaign: baseCampaign, ...baseCtx });
assert.equal(r.eligible, true);
assert.equal(r.discount, 100);
assert.equal(r.platformContribution, 50);
assert.equal(r.businessContribution, 50);

// ── ineligibility reasons ──
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, isActive: false }, ...baseCtx }).reason, "inactive");
assert.equal(evaluateCoupon({ campaign: baseCampaign, ...baseCtx, now: new Date("2026-07-02") }).reason, "window");
assert.equal(evaluateCoupon({ campaign: baseCampaign, ...baseCtx, surface: "taxi" }).reason, "surface");
assert.equal(evaluateCoupon({ campaign: baseCampaign, ...baseCtx, region: "CY" }).reason, "region");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, conditions: { ...baseCampaign.conditions, paymentMethods: ["online"] } }, ...baseCtx, paymentMethod: "cash" }).reason, "payment");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, conditions: { ...baseCampaign.conditions, minSubtotal: 500 } }, ...baseCtx }).reason, "minSubtotal");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, conditions: { ...baseCampaign.conditions, scope: "category", categoryKeys: ["bakery"] } }, ...baseCtx }).reason, "scope");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, conditions: { ...baseCampaign.conditions, scope: "store", storeIds: ["other"] } }, ...baseCtx }).reason, "scope");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, requiresOptIn: true }, ...baseCtx, isStoreActiveForCampaign: false }).reason, "optin");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, usageLimit: { perUser: 1, total: null } }, ...baseCtx, userUsageCount: 1 }).reason, "user_limit");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, usageLimit: { perUser: 5, total: 10 } }, ...baseCtx, totalUsageCount: 10 }).reason, "total_limit");
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, budget: { cap: 40, basis: "platform", spent: 0 } }, ...baseCtx }).reason, "budget", "platform contribution 50 > cap 40");

// scope matches
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, conditions: { ...baseCampaign.conditions, scope: "category", categoryKeys: ["supermarket"] } }, ...baseCtx }).eligible, true);
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, conditions: { ...baseCampaign.conditions, scope: "store", storeIds: ["s1"] } }, ...baseCtx }).eligible, true);
assert.equal(evaluateCoupon({ campaign: { ...baseCampaign, conditions: { ...baseCampaign.conditions, scope: "chain", organizationId: "org1" } }, ...baseCtx, organizationId: "org1" }).eligible, true);

console.log("promotion engine smoke ok");
