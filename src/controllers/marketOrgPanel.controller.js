import mongoose from "mongoose";
import MarketStore from "../models/MarketStore.js";
import MarketOrder from "../models/MarketOrder.js";

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v || "").trim()) ? new mongoose.Types.ObjectId(String(v).trim()) : null);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const TZ = "Europe/Istanbul";

async function orgStoreIds(orgId) {
  const stores = await MarketStore.find({ organization: orgId }).select("_id name").lean();
  return { stores, ids: stores.map((s) => s._id) };
}

// GET /api/market/org/:organizationId/reports?from=&to=
export const orgReports = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });

    const now = new Date();
    const to = req.query.to ? new Date(req.query.to) : now;
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getTime() - 30 * 864e5);
    if (isNaN(to.getTime()) || isNaN(from.getTime())) {
      return next({ status: 400, message: "Geçersiz tarih" });
    }
    const fromStart = new Date(from); fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999);

    const { stores, ids } = await orgStoreIds(orgId);
    const nameById = new Map(stores.map((s) => [String(s._id), s.name]));

    if (ids.length === 0) {
      return res.json({
        range: { from: fromStart, to: toEnd },
        kpis: { revenue: 0, orders: 0, delivered: 0, avgBasket: 0, cancelledOrders: 0, pendingOrders: 0, itemsSold: 0 },
        timeseries: [],
        byStatus: [],
        byPayment: [],
        byType: [],
        perBranch: [],
        topProducts: [],
      });
    }

    const match = { store: { $in: ids }, createdAt: { $gte: fromStart, $lte: toEnd } };
    const isDelivered = { $eq: ["$status", "delivered"] };
    const deliveredOnly = { $match: { status: "delivered" } };

    const [facet] = await MarketOrder.aggregate([
      { $match: match },
      { $facet: {
        kpis: [
          { $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            deliveredOrders: { $sum: { $cond: [isDelivered, 1, 0] } },
            revenue: { $sum: { $cond: [isDelivered, { $ifNull: ["$total", 0] }, 0] } },
            cancelledOrders: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
            pendingOrders: { $sum: { $cond: [{ $in: ["$status", ["pending", "confirmed", "preparing", "ready"]] }, 1, 0] } },
          } },
        ],
        itemsSold: [
          deliveredOnly, { $unwind: "$items" },
          { $group: { _id: null, qty: { $sum: "$items.qty" } } },
        ],
        timeseries: [
          deliveredOnly,
          { $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            revenue: { $sum: { $ifNull: ["$total", 0] } }, orders: { $sum: 1 },
          } },
          { $sort: { _id: 1 } },
        ],
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byPayment: [
          deliveredOnly,
          { $group: { _id: "$paymentMethod", count: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$total", 0] } } } },
        ],
        byType: [
          deliveredOnly,
          { $group: { _id: "$type", count: { $sum: 1 }, revenue: { $sum: { $ifNull: ["$total", 0] } } } },
        ],
        perBranch: [
          { $group: {
            _id: "$store",
            orders: { $sum: 1 },
            revenue: { $sum: { $cond: [isDelivered, { $ifNull: ["$total", 0] }, 0] } },
          } },
          { $sort: { revenue: -1 } },
        ],
        topProducts: [
          deliveredOnly, { $unwind: "$items" },
          { $group: {
            _id: { $ifNull: ["$items.title", "—"] },
            qty: { $sum: { $ifNull: ["$items.qty", 0] } },
            revenue: { $sum: { $ifNull: ["$items.lineTotal", 0] } },
          } },
          { $sort: { revenue: -1 } }, { $limit: 15 },
        ],
      } },
    ]);

    const f = facet || {};
    const k = (f.kpis && f.kpis[0]) || { totalOrders: 0, deliveredOrders: 0, revenue: 0, cancelledOrders: 0, pendingOrders: 0 };

    res.json({
      range: { from: fromStart, to: toEnd },
      kpis: {
        revenue: round2(k.revenue),
        orders: k.totalOrders,
        delivered: k.deliveredOrders,
        avgBasket: k.deliveredOrders ? round2(k.revenue / k.deliveredOrders) : 0,
        cancelledOrders: k.cancelledOrders,
        pendingOrders: k.pendingOrders,
        itemsSold: f.itemsSold?.[0]?.qty || 0,
      },
      timeseries: (f.timeseries || []).map((d) => ({ date: d._id, revenue: round2(d.revenue), orders: d.orders })),
      byStatus: (f.byStatus || []).map((s) => ({ status: s._id, count: s.count })),
      byPayment: (f.byPayment || []).map((p) => ({ method: p._id || "unknown", count: p.count, revenue: round2(p.revenue) })),
      byType: (f.byType || []).map((t) => ({ type: t._id || "unknown", count: t.count, revenue: round2(t.revenue) })),
      perBranch: (f.perBranch || []).map((b) => ({ storeId: b._id, name: nameById.get(String(b._id)) || "—", orders: b.orders, revenue: round2(b.revenue) })),
      topProducts: (f.topProducts || []).map((p) => ({ title: p._id, qty: p.qty, revenue: round2(p.revenue) })),
    });
  } catch (e) { next(e); }
};
