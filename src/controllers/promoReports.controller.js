import mongoose from "mongoose";
import CouponRedemption from "../models/CouponRedemption.js";
import TaxiRide from "../models/TaxiRide.js";
import Campaign from "../models/Campaign.js";
import MarketStore from "../models/MarketStore.js";
import { resolvePanelStore } from "../services/panelStoreAccess.service.js";

const oid = (v) => { try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; } };
function range(req) {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 864e5);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  return { from, to };
}
function baseMatch(req) {
  const { from, to } = range(req);
  const m = { status: "applied", createdAt: { $gte: from, $lte: to } };
  if (req.query.surface) m.surface = req.query.surface;
  if (req.query.region) m.region = String(req.query.region).toUpperCase();
  if (req.query.campaignId && oid(req.query.campaignId)) m.campaign = oid(req.query.campaignId);
  if (req.query.storeId && oid(req.query.storeId)) m.store = oid(req.query.storeId);
  return m;
}
const SUMS = {
  gross: { $sum: "$gross" }, discount: { $sum: "$discount" },
  platformContribution: { $sum: "$platformContribution" },
  businessContribution: { $sum: "$businessContribution" },
  commission: { $sum: "$commission" }, count: { $sum: 1 },
};

/** GET /admin/promotions/report — P&L totals + breakdown by campaign and by store */
export const adminReport = async (req, res, next) => {
  try {
    const match = baseMatch(req);
    const [totalsArr, byCampaign, byStore] = await Promise.all([
      CouponRedemption.aggregate([{ $match: match }, { $group: { _id: null, ...SUMS } }]),
      CouponRedemption.aggregate([{ $match: match }, { $group: { _id: "$campaign", ...SUMS } }, { $sort: { platformContribution: -1 } }, { $limit: 100 }]),
      CouponRedemption.aggregate([{ $match: { ...match, store: { $ne: null } } }, { $group: { _id: "$store", ...SUMS } }, { $sort: { gross: -1 } }, { $limit: 100 }]),
    ]);
    const t = totalsArr[0] || { gross: 0, discount: 0, platformContribution: 0, businessContribution: 0, commission: 0, count: 0 };
    const net = +(t.commission - t.platformContribution).toFixed(2);
    // enrich names
    const camps = await Campaign.find({ _id: { $in: byCampaign.map((b) => b._id) } }).select("title surface").lean();
    const campName = new Map(camps.map((c) => [String(c._id), c.title]));
    const stores = await MarketStore.find({ _id: { $in: byStore.map((b) => b._id) } }).select("name").lean();
    const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
    res.json({
      totals: { ...t, net },
      byCampaign: byCampaign.map((b) => ({ campaignId: b._id, title: campName.get(String(b._id)) || "—", commission: b.commission, platformContribution: b.platformContribution, net: +(b.commission - b.platformContribution).toFixed(2), count: b.count })),
      byStore: byStore.map((b) => ({ storeId: b._id, name: storeName.get(String(b._id)) || "—", gross: b.gross, commission: b.commission, businessContribution: b.businessContribution, platformContribution: b.platformContribution, count: b.count })),
    });
  } catch (e) { next(e); }
};

/** GET /admin/promotions/settlement — who is owed what (manual transfer) */
export const adminSettlement = async (req, res, next) => {
  try {
    const match = baseMatch(req);
    // per business: entitlement = gross - commission - businessContribution
    const byStore = await CouponRedemption.aggregate([
      { $match: { ...match, store: { $ne: null } } },
      { $group: { _id: "$store", ...SUMS } },
    ]);
    const stores = await MarketStore.find({ _id: { $in: byStore.map((b) => b._id) } }).select("name").lean();
    const storeName = new Map(stores.map((s) => [String(s._id), s.name]));
    const businesses = byStore.map((b) => ({
      storeId: b._id, name: storeName.get(String(b._id)) || "—",
      gross: b.gross, commission: b.commission, businessContribution: b.businessContribution,
      platformContribution: b.platformContribution,
      entitlement: +(b.gross - b.commission - b.businessContribution).toFixed(2),
    }));
    // per driver (taxi): earning + cash shortfall on coupon rides (empty until Phase 6 wires taxi)
    const { from, to } = range(req);
    const drivers = await TaxiRide.aggregate([
      { $match: { couponCampaign: { $ne: null }, createdAt: { $gte: from, $lte: to } } },
      { $group: {
        _id: "$driver",
        driverEarning: { $sum: "$driverEarning" },
        cashShortfall: { $sum: { $cond: [{ $eq: ["$paymentMethod", "cash"] }, { $subtract: ["$driverEarning", "$fare"] }, 0] } },
        rides: { $sum: 1 },
      } },
    ]);
    res.json({ businesses, drivers });
  } catch (e) { next(e); }
};

/** GET /market/panel/promo-statement — the owner's own store statement */
export const businessStatement = async (req, res, next) => {
  try {
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store, access } = r;
    if (access !== "owner" && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Bu işlem yalnızca mağaza sahibine açık" });
    }
    const { from, to } = range(req);
    const arr = await CouponRedemption.aggregate([
      { $match: { store: store._id, status: "applied", createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: null, ...SUMS } },
    ]);
    const t = arr[0] || { gross: 0, discount: 0, platformContribution: 0, businessContribution: 0, commission: 0, count: 0 };
    res.json({
      store: { id: store._id, name: store.name },
      gross: t.gross, commission: t.commission,
      businessContribution: t.businessContribution, platformContribution: t.platformContribution,
      netEntitlement: +(t.gross - t.commission - t.businessContribution).toFixed(2),
      count: t.count,
    });
  } catch (e) { next(e); }
};
