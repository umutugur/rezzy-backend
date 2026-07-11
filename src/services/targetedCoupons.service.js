import Campaign from "../models/Campaign.js";
import UserCoupon from "../models/UserCoupon.js";
import { notifyUser } from "./notification.service.js";

/** Completed (non-cancelled) order/ride count for a user on a surface. */
export async function completedOrderCount(userId, surface) {
  if (surface === "market") {
    const MarketOrder = (await import("../models/MarketOrder.js")).default;
    return MarketOrder.countDocuments({ customer: userId, status: { $ne: "cancelled" } });
  }
  if (surface === "taxi") {
    const TaxiRide = (await import("../models/TaxiRide.js")).default;
    return TaxiRide.countDocuments({ passenger: userId, status: "completed" });
  }
  if (surface === "restaurant") {
    const DeliveryOrder = (await import("../models/DeliveryOrder.js")).default;
    return DeliveryOrder.countDocuments({ userId, status: { $ne: "cancelled" } });
  }
  return 0;
}

/** Grant a single auto coupon (idempotent) + notify. Returns true if newly granted. */
export async function grantCoupon(userId, campaign) {
  try {
    const existing = await UserCoupon.findOne({ user: userId, campaign: campaign._id });
    if (existing) return false;
    await UserCoupon.create({ user: userId, campaign: campaign._id, source: "auto" });
  } catch (e) {
    if (e.code === 11000) return false;
    throw e;
  }
  await notifyUser(userId, {
    title: "🎟️ Yeni kuponun var!",
    body: `${campaign.title} cüzdanına eklendi.`,
    data: { type: "coupon_granted", campaignId: String(campaign._id) },
    key: `coupon_grant_${userId}_${campaign._id}`,
    type: "coupon_granted",
  }).catch(() => {});
  return true;
}

/** Lazily grant first-order coupons for a user on a surface+region. */
export async function grantFirstOrderCoupons(userId, surface, region) {
  if (!surface || !region) return;
  const now = new Date();
  const camps = await Campaign.find({
    surface, region, isActive: true,
    "audience.kind": "targeted", "audience.trigger": "first_order",
    validFrom: { $lte: now }, validTo: { $gte: now },
  }).lean();
  if (!camps.length) return;
  const count = await completedOrderCount(userId, surface);
  if (count > 0) return; // not a first-order user
  for (const c of camps) await grantCoupon(userId, c);
}
