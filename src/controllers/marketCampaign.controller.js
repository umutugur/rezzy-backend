import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import CampaignParticipation from "../models/CampaignParticipation.js";
import MarketStore from "../models/MarketStore.js";

async function ownerStore(userId) {
  return MarketStore.findOne({ owner: userId }).select("_id category organization").lean();
}
function storeMatchesScope(c, store) {
  switch (c.conditions.scope) {
    case "platform": return true;
    case "category": return (c.conditions.categoryKeys || []).includes(store.category);
    case "store": return (c.conditions.storeIds || []).map(String).includes(String(store._id));
    case "chain": return store.organization && String(c.conditions.organizationId) === String(store.organization);
    default: return false;
  }
}

/** GET /market/panel/campaigns — campaigns this store is eligible for (requiresOptIn) + join status */
export const listEligibleCampaigns = async (req, res, next) => {
  try {
    const store = await ownerStore(req.user.id);
    if (!store) return next({ status: 404, message: "Mağaza bulunamadı" });
    const region = String(req.headers?.["x-region"] || req.user?.region || "").toUpperCase();
    const now = new Date();
    const q = { surface: "market", isActive: true, requiresOptIn: true, validTo: { $gte: now } };
    if (region) q.region = region;
    const camps = await Campaign.find(q).sort({ createdAt: -1 }).lean();
    const eligible = camps.filter((c) => storeMatchesScope(c, store));
    const joins = await CampaignParticipation.find({ campaign: { $in: eligible.map((c) => c._id) }, store: store._id }).lean();
    const joinByCampaign = new Map(joins.map((j) => [String(j.campaign), j.status]));
    res.json({ items: eligible.map((c) => ({ campaign: c, joined: joinByCampaign.get(String(c._id)) === "joined" })) });
  } catch (e) { next(e); }
};

/** POST /market/panel/campaigns/:campaignId/join */
export const joinCampaign = async (req, res, next) => {
  try {
    const store = await ownerStore(req.user.id);
    if (!store) return next({ status: 404, message: "Mağaza bulunamadı" });
    const campaign = await Campaign.findById(req.params.campaignId).lean();
    if (!campaign || campaign.surface !== "market") return next({ status: 404, message: "Kampanya bulunamadı" });
    if (!storeMatchesScope(campaign, store)) return next({ status: 403, message: "Bu kampanya mağazanız için uygun değil" });
    await CampaignParticipation.findOneAndUpdate(
      { campaign: campaign._id, store: store._id },
      { $set: { surface: "market", organization: store.organization || null, status: "joined", joinedBy: req.user.id, joinedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, joined: true });
  } catch (e) {
    if (e.code === 11000) return res.json({ ok: true, joined: true });
    next(e);
  }
};

/** POST /market/panel/campaigns/:campaignId/leave */
export const leaveCampaign = async (req, res, next) => {
  try {
    const store = await ownerStore(req.user.id);
    if (!store) return next({ status: 404, message: "Mağaza bulunamadı" });
    await CampaignParticipation.findOneAndUpdate(
      { campaign: req.params.campaignId, store: store._id },
      { $set: { status: "left" } }
    );
    res.json({ ok: true, joined: false });
  } catch (e) { next(e); }
};
