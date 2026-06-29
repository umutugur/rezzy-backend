import Campaign from "../models/Campaign.js";
import CampaignParticipation from "../models/CampaignParticipation.js";
import CouponRedemption from "../models/CouponRedemption.js";
import UserCoupon from "../models/UserCoupon.js";
import { evaluateCoupon } from "./promotionEngine.js";

export function regionOf(req) {
  return String(req.headers?.["x-region"] || req.user?.region || "").toUpperCase();
}

/** Is a campaign active for this store right now (opt-in resolved)? */
export async function isStoreActiveForCampaign(campaign, storeId) {
  if (!campaign.requiresOptIn) return true;
  const p = await CampaignParticipation.exists({ campaign: campaign._id, store: storeId, status: "joined" });
  return !!p;
}

/** Usage counters from applied redemptions. */
export async function getUsage(campaignId, userId) {
  const [userUsageCount, totalUsageCount] = await Promise.all([
    CouponRedemption.countDocuments({ campaign: campaignId, user: userId, status: "applied" }),
    CouponRedemption.countDocuments({ campaign: campaignId, status: "applied" }),
  ]);
  return { userUsageCount, totalUsageCount };
}

/**
 * Full server-side evaluation for one campaign + cart. Returns the engine result
 * augmented with `commission`. Caller passes commissionRate.
 */
export async function evaluateForOrder({ campaign, user, base, deliveryFee, surface, region, paymentMethod, storeId, storeCategory, organizationId, commissionRate = 0 }) {
  const isActive = await isStoreActiveForCampaign(campaign, storeId);
  const { userUsageCount, totalUsageCount } = await getUsage(campaign._id, user);
  const res = evaluateCoupon({
    campaign, base, deliveryFee, surface, region, paymentMethod,
    storeId, storeCategory, organizationId, isStoreActiveForCampaign: isActive,
    now: new Date(), userUsageCount, totalUsageCount,
  });
  return res;
}

/**
 * Record a coupon redemption for a *completed* order (idempotent by orderRef).
 * This is the single place that consumes the coupon: it writes the redemption,
 * increments campaign budget.spent, and bumps UserCoupon.usedCount (locking the
 * coupon to "used" once the per-user limit is reached). Call this only when the
 * order/ride actually completes — never at creation — so cancelled or failed
 * orders cannot burn a single-use coupon.
 */
export async function recordRedemptionForOrder({
  campaign, user, surface, orderRef, gross, discount,
  platformContribution = 0, businessContribution = 0, commission = 0,
  paymentMethod, region, storeId = null, organizationId = null,
}) {
  if (!campaign || !(Number(discount) > 0)) return null;
  const campaignId = campaign._id ?? campaign;

  // Idempotent: never double-record for the same order.
  const existing = await CouponRedemption.findOne({ orderRef, status: "applied" });
  if (existing) return existing;

  const camp = await Campaign.findById(campaignId).select("budget usageLimit").lean();
  const add = camp?.budget?.basis === "discount" ? discount : platformContribution;

  const red = await CouponRedemption.create({
    campaign: campaignId, user, surface, orderRef,
    store: storeId, organization: organizationId,
    gross, discount, platformContribution, businessContribution, commission,
    paymentMethod, region, status: "applied",
  });
  await Campaign.updateOne({ _id: campaignId }, { $inc: { "budget.spent": add } });
  const uc = await UserCoupon.findOneAndUpdate(
    { user, campaign: campaignId },
    { $inc: { usedCount: 1 } },
    { new: true },
  );
  if (uc && uc.usedCount >= (camp?.usageLimit?.perUser ?? 1)) {
    await UserCoupon.updateOne({ _id: uc._id }, { $set: { status: "used" } });
  }
  return red;
}

/** Reverse a coupon redemption for a cancelled/refunded order (idempotent). */
export async function reverseRedemptionForOrder(orderRef) {
  const Campaign = (await import("../models/Campaign.js")).default;
  const red = await CouponRedemption.findOne({ orderRef, status: "applied" });
  if (!red) return;
  red.status = "reversed"; red.reversedAt = new Date(); await red.save();
  const camp = await Campaign.findById(red.campaign).select("budget usageLimit validTo").lean();
  const add = camp?.budget?.basis === "discount" ? red.discount : red.platformContribution;
  await Campaign.updateOne({ _id: red.campaign }, { $inc: { "budget.spent": -add } });
  const uc = await UserCoupon.findOne({ user: red.user, campaign: red.campaign });
  if (uc) {
    const newCount = Math.max(0, (uc.usedCount || 0) - 1);
    const stillValid = camp && new Date() <= new Date(camp.validTo);
    await UserCoupon.updateOne({ _id: uc._id }, { $set: { usedCount: newCount, status: stillValid ? "active" : uc.status } });
  }
}
