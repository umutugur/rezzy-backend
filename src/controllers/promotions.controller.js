import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import UserCoupon from "../models/UserCoupon.js";
import CampaignParticipation from "../models/CampaignParticipation.js";
import MarketStore from "../models/MarketStore.js";
import CouponRedemption from "../models/CouponRedemption.js";
import { evaluateCoupon, computeDiscount } from "../services/promotionEngine.js";
import { regionOf, isStoreActiveForCampaign, getUsage } from "../services/promotionsService.js";
import { grantFirstOrderCoupons } from "../services/targetedCoupons.service.js";
import { notifyUser } from "../services/notification.service.js";

const oid = (v) => { try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; } };

/** GET /promotions/wallet?surface=&region= */
export const getWallet = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const surface = req.query.surface || "market";
    const region = (req.query.region || regionOf(req) || "").toUpperCase();
    const now = new Date();

    await grantFirstOrderCoupons(userId, surface, region).catch(() => {});

    // expire stale coupons (lazy)
    const held = await UserCoupon.find({ user: userId }).lean();
    const campIds = held.map((h) => h.campaign);
    const camps = await Campaign.find({ _id: { $in: campIds } }).lean();
    const campById = new Map(camps.map((c) => [String(c._id), c]));
    const expiredIds = held
      .filter((h) => { const c = campById.get(String(h.campaign)); return c && now > new Date(c.validTo) && h.status === "active"; })
      .map((h) => h._id);
    if (expiredIds.length) await UserCoupon.updateMany({ _id: { $in: expiredIds } }, { $set: { status: "expired" } });

    const mine = held
      .map((h) => ({ h, c: campById.get(String(h.campaign)) }))
      .filter((x) => x.c && x.c.surface === surface && x.c.region === region)
      .map(({ h, c }) => ({
        userCouponId: h._id, campaign: c, status: expiredIds.find((e) => String(e) === String(h._id)) ? "expired" : h.status,
        remaining: c.usageLimit?.showRemaining && c.usageLimit?.total != null ? Math.max(0, c.usageLimit.total - 0) : null,
      }));

    // collectible public campaigns for region/surface not already held
    const heldSet = new Set(held.map((h) => String(h.campaign)));
    const collectible = await Campaign.find({
      surface, region, isActive: true, "audience.kind": "public", "audience.collectible": true,
      validFrom: { $lte: now }, validTo: { $gte: now },
    }).lean();
    const toCollect = collectible.filter((c) => !heldSet.has(String(c._id)));

    res.json({ mine, collectible: toCollect });
  } catch (e) { next(e); }
};

/** POST /promotions/collect { campaignId } */
export const collectCoupon = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const campaignId = oid(req.body?.campaignId);
    if (!campaignId) return next({ status: 400, message: "campaignId gerekli" });
    const c = await Campaign.findById(campaignId).lean();
    if (!c || !c.isActive) return next({ status: 404, message: "Kampanya bulunamadı" });
    if (c.audience?.kind !== "public" || c.audience?.collectible === false)
      return next({ status: 400, message: "Bu kupon toplanamaz" });
    const existing = await UserCoupon.findOne({ user: userId, campaign: campaignId });
    if (existing) return res.json({ item: existing });
    const doc = await UserCoupon.create({ user: userId, campaign: campaignId, source: "collected" });
    await notifyUser(userId, {
      title: "🎟️ Kupon eklendi",
      body: `${c.title} cüzdanına eklendi.`,
      data: { type: "coupon_collected", campaignId: String(c._id) },
      key: `coupon_collect_${userId}_${c._id}`,
      type: "coupon_collected",
    }).catch(() => {});
    res.json({ item: doc.toObject() });
  } catch (e) { next(e); }
};

/** GET /promotions/applicable?surface=market&storeId=&subtotal=&deliveryFee=&paymentMethod= */
export const getApplicable = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const surface = req.query.surface || "market";
    const region = regionOf(req);
    const base = Number(req.query.subtotal) || 0;
    const deliveryFee = Number(req.query.deliveryFee) || 0;
    const paymentMethod = req.query.paymentMethod || "cash";
    const storeId = oid(req.query.storeId);
    if (!storeId) return res.json({ items: [] });
    const store = await MarketStore.findById(storeId).select("category organization").lean();
    if (!store) return res.json({ items: [] });

    const held = await UserCoupon.find({ user: userId, status: "active" }).lean();
    const camps = await Campaign.find({ _id: { $in: held.map((h) => h.campaign) }, surface, region, isActive: true }).lean();
    const now = new Date();
    const out = [];
    for (const c of camps) {
      const isActive = await isStoreActiveForCampaign(c, storeId);
      const { userUsageCount, totalUsageCount } = await getUsage(c._id, userId);
      const r = evaluateCoupon({
        campaign: c, base, deliveryFee, surface, region, paymentMethod,
        storeId: String(storeId), storeCategory: store.category, organizationId: store.organization ? String(store.organization) : null,
        isStoreActiveForCampaign: isActive, now, userUsageCount, totalUsageCount,
      });
      if (r.eligible) out.push({ campaign: c, discount: r.discount });
    }
    out.sort((a, b) => b.discount - a.discount);
    res.json({ items: out });
  } catch (e) { next(e); }
};

/** GET /promotions/store-badges?surface=market&storeIds=a,b,c → best active campaign label per store */
export const getStoreBadges = async (req, res, next) => {
  try {
    const surface = req.query.surface || "market";
    const region = regionOf(req);
    const ids = String(req.query.storeIds || "").split(",").map((s) => s.trim()).filter(Boolean).map(oid).filter(Boolean);
    if (!ids.length) return res.json({ badges: {} });
    const now = new Date();
    const stores = await MarketStore.find({ _id: { $in: ids } }).select("category organization").lean();
    const camps = await Campaign.find({ surface, region, isActive: true, validFrom: { $lte: now }, validTo: { $gte: now } }).lean();
    const joined = await CampaignParticipation.find({ campaign: { $in: camps.map((c) => c._id) }, status: "joined" }).lean();
    const joinedSet = new Set(joined.map((j) => `${j.campaign}_${j.store}`));
    const labelOf = (c) => c.discount.kind === "percent" ? `%${c.discount.value} indirim`
      : c.discount.kind === "free_delivery" ? "Ücretsiz teslimat"
      : c.discount.kind === "fixed" ? `${c.discount.value} TL indirim` : "Kampanya";
    const badges = {};
    for (const s of stores) {
      let best = null;
      for (const c of camps) {
        const scopeOk = c.conditions.scope === "platform"
          || (c.conditions.scope === "category" && (c.conditions.categoryKeys || []).includes(s.category))
          || (c.conditions.scope === "store" && (c.conditions.storeIds || []).map(String).includes(String(s._id)))
          || (c.conditions.scope === "chain" && s.organization && String(c.conditions.organizationId) === String(s.organization));
        if (!scopeOk) continue;
        const active = !c.requiresOptIn || joinedSet.has(`${c._id}_${s._id}`);
        if (!active) continue;
        if (!best || (c.discount.kind === "percent" && c.discount.value > (best.discount.value || 0))) best = c;
      }
      if (best) badges[String(s._id)] = labelOf(best);
    }
    res.json({ badges });
  } catch (e) { next(e); }
};
