import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import CampaignParticipation from "../models/CampaignParticipation.js";
import Restaurant from "../models/Restaurant.js";

async function loadRestaurant(rid) {
  if (!mongoose.Types.ObjectId.isValid(String(rid))) return null;
  return Restaurant.findById(rid).select("_id businessType organizationId").lean();
}

function storeMatchesScope(c, restaurant) {
  switch (c.conditions.scope) {
    case "platform": return true;
    case "category": return (c.conditions.categoryKeys || []).includes(restaurant.businessType);
    case "store": return (c.conditions.storeIds || []).map(String).includes(String(restaurant._id));
    case "chain": return restaurant.organizationId && String(c.conditions.organizationId) === String(restaurant.organizationId);
    default: return false;
  }
}

/** GET /panel/restaurants/:rid/campaigns — campaigns this restaurant is eligible for (requiresOptIn) + join status */
export const listEligibleCampaigns = async (req, res, next) => {
  try {
    const restaurant = await loadRestaurant(req.params.rid);
    if (!restaurant) return next({ status: 404, message: "Restoran bulunamadı" });
    const region = String(req.headers?.["x-region"] || req.user?.region || "").toUpperCase();
    const now = new Date();
    const q = { surface: "restaurant", isActive: true, requiresOptIn: true, validTo: { $gte: now } };
    if (region) q.region = region;
    const camps = await Campaign.find(q).sort({ createdAt: -1 }).lean();
    const eligible = camps.filter((c) => storeMatchesScope(c, restaurant));
    const joins = await CampaignParticipation.find({ campaign: { $in: eligible.map((c) => c._id) }, store: restaurant._id }).lean();
    const joinByCampaign = new Map(joins.map((j) => [String(j.campaign), j.status]));
    res.json({ items: eligible.map((c) => ({ campaign: c, joined: joinByCampaign.get(String(c._id)) === "joined" })) });
  } catch (e) { next(e); }
};

/** POST /panel/restaurants/:rid/campaigns/:campaignId/join */
export const joinCampaign = async (req, res, next) => {
  try {
    const restaurant = await loadRestaurant(req.params.rid);
    if (!restaurant) return next({ status: 404, message: "Restoran bulunamadı" });
    const campaign = await Campaign.findById(req.params.campaignId).lean();
    if (!campaign || campaign.surface !== "restaurant") return next({ status: 404, message: "Kampanya bulunamadı" });
    if (!storeMatchesScope(campaign, restaurant)) return next({ status: 403, message: "Bu kampanya restoranınız için uygun değil" });
    await CampaignParticipation.findOneAndUpdate(
      { campaign: campaign._id, store: restaurant._id },
      { $set: { surface: "restaurant", organization: restaurant.organizationId || null, status: "joined", joinedBy: req.user.id, joinedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, joined: true });
  } catch (e) {
    if (e.code === 11000) return res.json({ ok: true, joined: true });
    next(e);
  }
};

/** POST /panel/restaurants/:rid/campaigns/:campaignId/leave */
export const leaveCampaign = async (req, res, next) => {
  try {
    const restaurant = await loadRestaurant(req.params.rid);
    if (!restaurant) return next({ status: 404, message: "Restoran bulunamadı" });
    await CampaignParticipation.findOneAndUpdate(
      { campaign: req.params.campaignId, store: restaurant._id },
      { $set: { status: "left" } }
    );
    res.json({ ok: true, joined: false });
  } catch (e) { next(e); }
};
