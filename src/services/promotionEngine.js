// Pure promotion engine — no DB, no Date.now(), no i18n. Fully unit-testable.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function computeDiscount(kind, value, maxDiscount, base, deliveryFee = 0) {
  const b = Number(base) || 0;
  switch (kind) {
    case "percent": {
      let d = (b * (Number(value) || 0)) / 100;
      if (maxDiscount != null) d = Math.min(d, Number(maxDiscount));
      return Math.max(0, Math.min(round2(d), b));
    }
    case "fixed":
      return Math.max(0, Math.min(round2(Number(value) || 0), b));
    case "free_delivery":
      return Math.max(0, round2(Number(deliveryFee) || 0));
    case "fixed_price":
      return Math.max(0, Math.min(round2(b - (Number(value) || 0)), b));
    default:
      return 0;
  }
}

export function splitFunding(discount, platformSharePct) {
  const platformContribution = round2((Number(discount) || 0) * (Number(platformSharePct) || 0) / 100);
  const businessContribution = round2((Number(discount) || 0) - platformContribution);
  return { platformContribution, businessContribution };
}

export function computeCommission(gross, commissionRate) {
  return round2((Number(gross) || 0) * (Number(commissionRate) || 0));
}

function scopeMatches(conditions, ctx) {
  switch (conditions.scope) {
    case "platform": return true;
    case "category": return (conditions.categoryKeys || []).includes(ctx.storeCategory);
    case "store": return (conditions.storeIds || []).map(String).includes(String(ctx.storeId));
    case "chain": return ctx.organizationId != null && String(conditions.organizationId) === String(ctx.organizationId);
    default: return false;
  }
}

export function evaluateCoupon(ctx) {
  const c = ctx.campaign;
  const fail = (reason) => ({ eligible: false, reason, discount: 0, platformContribution: 0, businessContribution: 0 });

  if (!c.isActive) return fail("inactive");
  const now = ctx.now;
  if (now < new Date(c.validFrom) || now > new Date(c.validTo)) return fail("window");
  if (c.surface !== ctx.surface) return fail("surface");
  if (String(c.region).toUpperCase() !== String(ctx.region).toUpperCase()) return fail("region");

  const pms = c.conditions.paymentMethods || ["all"];
  if (!pms.includes("all") && !pms.includes(ctx.paymentMethod)) return fail("payment");

  if ((Number(ctx.base) || 0) < (Number(c.conditions.minSubtotal) || 0)) return fail("minSubtotal");
  if (!scopeMatches(c.conditions, ctx)) return fail("scope");
  if (c.requiresOptIn && !ctx.isStoreActiveForCampaign) return fail("optin");

  if ((Number(ctx.userUsageCount) || 0) >= (Number(c.usageLimit.perUser) || 1)) return fail("user_limit");
  if (c.usageLimit.total != null && (Number(ctx.totalUsageCount) || 0) >= Number(c.usageLimit.total)) return fail("total_limit");

  const discount = computeDiscount(c.discount.kind, c.discount.value, c.discount.maxDiscount, ctx.base, ctx.deliveryFee);
  const { platformContribution, businessContribution } = splitFunding(discount, c.funding.platformSharePct);

  if (c.budget && c.budget.cap != null) {
    const add = c.budget.basis === "discount" ? discount : platformContribution;
    if ((Number(c.budget.spent) || 0) + add > Number(c.budget.cap)) return fail("budget");
  }

  return { eligible: true, reason: null, discount, platformContribution, businessContribution };
}
