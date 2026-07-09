import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import CampaignParticipation from "../models/CampaignParticipation.js";
import MarketStore from "../models/MarketStore.js";
import { resolvePanelStore } from "../services/panelStoreAccess.service.js";

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v || "").trim()) ? new mongoose.Types.ObjectId(String(v).trim()) : null);

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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;
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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store, access } = r;
    // owner + şube yöneticisi (manager) katılabilir — zincir şubelerinin owner'ı org sahibi olduğundan
    if (access !== "owner" && access !== "manager" && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Bu işlem için yetkiniz yok" });
    }
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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store, access } = r;
    if (access !== "owner" && access !== "manager" && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Bu işlem için yetkiniz yok" });
    }
    await CampaignParticipation.findOneAndUpdate(
      { campaign: req.params.campaignId, store: store._id },
      { $set: { status: "left" } }
    );
    res.json({ ok: true, joined: false });
  } catch (e) { next(e); }
};

/** GET /market/org/:organizationId/campaigns — org's eligible opt-in campaigns across its branches */
export const listOrgCampaigns = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });

    const stores = await MarketStore.find({ organization: orgId }).select("_id name city category organization").lean();
    if (!stores.length) return res.json({ items: [] });

    const region = String(req.headers?.["x-region"] || req.user?.region || "").toUpperCase();
    const now = new Date();
    const q = { surface: "market", isActive: true, requiresOptIn: true, validTo: { $gte: now } };
    if (region) q.region = region;
    const camps = await Campaign.find(q).sort({ createdAt: -1 }).lean();

    // build campaign -> eligible stores map
    const rows = [];
    for (const c of camps) {
      const eligibleStores = stores.filter((s) => storeMatchesScope(c, s));
      if (eligibleStores.length) rows.push({ campaign: c, eligibleStores });
    }
    if (!rows.length) return res.json({ items: [] });

    const allCampaignIds = rows.map((r) => r.campaign._id);
    const allStoreIds = stores.map((s) => s._id);
    const participations = await CampaignParticipation.find({
      campaign: { $in: allCampaignIds },
      store: { $in: allStoreIds },
    }).lean();
    const joinedKey = new Set(
      participations.filter((p) => p.status === "joined").map((p) => `${p.campaign}:${p.store}`)
    );

    const items = rows.map(({ campaign, eligibleStores }) => ({
      campaign,
      branches: eligibleStores.map((s) => ({
        storeId: s._id,
        name: s.name,
        joined: joinedKey.has(`${campaign._id}:${s._id}`),
      })),
    }));

    res.json({ items });
  } catch (e) { next(e); }
};

/** POST /market/org/:organizationId/campaigns/:campaignId/join */
export const joinOrgCampaign = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const campaign = await Campaign.findById(req.params.campaignId).lean();
    if (!campaign || campaign.surface !== "market") return next({ status: 404, message: "Kampanya bulunamadı" });

    let storeIds = Array.isArray(req.body?.storeIds) ? req.body.storeIds.map(String) : null;
    const orgStores = await MarketStore.find({ organization: orgId }).select("_id name organization category").lean();
    let targetStores = storeIds
      ? orgStores.filter((s) => storeIds.includes(String(s._id)))
      : orgStores;
    targetStores = targetStores.filter((s) => storeMatchesScope(campaign, s));

    if (!targetStores.length) return res.json({ ok: true, joined: 0 });

    const ops = targetStores.map((s) => ({
      updateOne: {
        filter: { campaign: campaign._id, store: s._id },
        update: {
          $set: {
            surface: "market",
            organization: orgId,
            status: "joined",
            joinedBy: req.user.id,
            joinedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));
    await CampaignParticipation.bulkWrite(ops);
    res.json({ ok: true, joined: targetStores.length });
  } catch (e) { next(e); }
};

/** POST /market/org/:organizationId/campaigns/:campaignId/leave */
export const leaveOrgCampaign = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const campaignId = oid(req.params.campaignId);
    if (!campaignId) return next({ status: 400, message: "Geçersiz kampanya id" });

    let storeIds = Array.isArray(req.body?.storeIds) ? req.body.storeIds.map(String) : null;
    const orgStores = await MarketStore.find({ organization: orgId }).select("_id organization").lean();
    const targetStores = storeIds
      ? orgStores.filter((s) => storeIds.includes(String(s._id)))
      : orgStores;

    if (!targetStores.length) return res.json({ ok: true, left: 0 });

    const ops = targetStores.map((s) => ({
      updateOne: {
        filter: { campaign: campaignId, store: s._id },
        update: { $set: { status: "left" } },
      },
    }));
    await CampaignParticipation.bulkWrite(ops);
    res.json({ ok: true, left: targetStores.length });
  } catch (e) { next(e); }
};
