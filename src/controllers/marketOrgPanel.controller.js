import mongoose from "mongoose";
import MarketStore from "../models/MarketStore.js";
import MarketOrder from "../models/MarketOrder.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketBranchOverride from "../models/MarketBranchOverride.js";
import MarketOrgProduct from "../models/MarketOrgProduct.js";
import CoreCategory from "../models/CoreCategory.js";
import { parsePriceRows } from "../services/bulkPrice.js";

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

// GET /market/org/:organizationId/products/:id/overrides
export const orgProductOverrides = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId); const pid = oid(req.params.id);
    if (!orgId || !pid) return next({ status: 400, message: "Geçersiz id" });
    const prod = await MarketOrgProduct.findOne({ _id: pid, organizationId: orgId }).select("_id").lean();
    if (!prod) return next({ status: 404, message: "Ürün bulunamadı" });
    const ovs = await MarketBranchOverride.find({ orgProductId: pid }).lean();
    const stores = await MarketStore.find({ _id: { $in: ovs.map((o) => o.store) }, organization: orgId }).select("name city").lean();
    const byId = new Map(stores.map((s) => [String(s._id), s]));
    const items = ovs.filter((o) => byId.has(String(o.store))).map((o) => {
      const s = byId.get(String(o.store));
      return { storeId: o.store, storeName: s.name, city: s.city || null, price: o.price ?? null, discountPrice: o.discountPrice ?? null, isAvailable: o.isAvailable ?? null, hidden: !!o.hidden };
    });
    res.json({ items, total: items.length });
  } catch (e) { next(e); }
};

const BRANCH_OPS_FIELDS = ["isActive", "deliveryZoneKm", "minOrderAmount", "deliveryFee", "freeDeliveryThreshold", "pickupEnabled"];

// GET /market/org/:organizationId/branches/:storeId
export const orgBranchDetail = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId); const sid = oid(req.params.storeId);
    if (!orgId || !sid) return next({ status: 400, message: "Geçersiz id" });
    const store = await MarketStore.findOne({ _id: sid, organization: orgId }).lean();
    if (!store) return next({ status: 404, message: "Şube bu zincirde bulunamadı" });

    const [orderAgg, productCount, overrides] = await Promise.all([
      MarketOrder.aggregate([
        { $match: { store: sid } },
        { $group: { _id: null, orders: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, { $ifNull: ["$total", 0] }, 0] } } } },
      ]),
      MarketProduct.countDocuments({ store: sid }),
      MarketBranchOverride.find({ store: sid }).lean(),
    ]);
    const opMap = new Map(overrides.map((o) => [String(o.orgProductId), o]));
    const ops = await MarketOrgProduct.find({ _id: { $in: overrides.map((o) => o.orgProductId) } }).select("title defaultPrice").lean();
    const overriddenProducts = ops.map((p) => {
      const ov = opMap.get(String(p._id));
      return { orgProductId: p._id, title: p.title, defaultPrice: p.defaultPrice, price: ov.price ?? null, discountPrice: ov.discountPrice ?? null, isAvailable: ov.isAvailable ?? null, hidden: !!ov.hidden };
    });
    const s = orderAgg[0] || { orders: 0, delivered: 0, revenue: 0 };
    res.json({ store, stats: { orders: s.orders, delivered: s.delivered, revenue: round2(s.revenue), productCount, overrideCount: overrides.length }, overriddenProducts });
  } catch (e) { next(e); }
};

async function resolveCategoryId(cat) {
  if (!cat) return null;
  const asId = oid(cat);
  if (asId) { const byId = await CoreCategory.exists({ _id: asId }); if (byId) return asId; }
  const byKey = await CoreCategory.findOne({ key: String(cat).trim() }).select("_id").lean();
  return byKey?._id || null;
}

// POST /market/org/:organizationId/products/bulk-import  body { rows:[{title,category,barcode,unit,defaultPrice,defaultDiscountPrice}] }
export const orgBulkImport = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 2000) : [];
    let created = 0, updated = 0; const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      try {
        if (!r.title || r.defaultPrice == null || r.defaultPrice === "") { errors.push({ row: i + 1, message: "title ve defaultPrice zorunlu" }); continue; }
        const catId = await resolveCategoryId(r.category);
        if (!catId) { errors.push({ row: i + 1, message: "Geçersiz kategori" }); continue; }
        const unit = ["kg","piece","litre","pack"].includes(r.unit) ? r.unit : "piece";
        const doc = { organizationId: orgId, title: String(r.title).trim(), category: catId,
          barcode: r.barcode ? String(r.barcode).trim() : "", unit,
          defaultPrice: Number(r.defaultPrice),
          defaultDiscountPrice: (r.defaultDiscountPrice != null && r.defaultDiscountPrice !== "") ? Number(r.defaultDiscountPrice) : null };
        if (Number.isNaN(doc.defaultPrice)) { errors.push({ row: i + 1, message: "Geçersiz fiyat" }); continue; }
        if (doc.barcode) {
          const existing = await MarketOrgProduct.findOne({ organizationId: orgId, barcode: doc.barcode }).select("_id").lean();
          if (existing) { await MarketOrgProduct.updateOne({ _id: existing._id }, { $set: doc }); updated++; continue; }
        }
        await MarketOrgProduct.create(doc); created++;
      } catch (e) { errors.push({ row: i + 1, message: e.message || "Hata" }); }
    }
    res.json({ created, updated, errors });
  } catch (e) { next(e); }
};

// GET /market/org/:organizationId/products/export  -> text/csv
export const orgExportCsv = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const items = await MarketOrgProduct.find({ organizationId: orgId }).populate("category", "key").sort({ order: 1 }).lean();
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["title","category","barcode","unit","defaultPrice","defaultDiscountPrice","isActive"];
    const lines = [header.join(",")];
    for (const p of items) lines.push([p.title, p.category?.key || "", p.barcode || "", p.unit, p.defaultPrice, p.defaultDiscountPrice ?? "", p.isActive].map(esc).join(","));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="catalog.csv"');
    res.send("﻿" + lines.join("\n"));
  } catch (e) { next(e); }
};

// POST /market/org/:organizationId/products/bulk-update  body { productIds?:[], category?:id, op:"price"|"active", value }
export const orgBulkUpdate = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const { productIds, category, op, value } = req.body || {};
    const filter = { organizationId: orgId };
    if (Array.isArray(productIds) && productIds.length) filter._id = { $in: productIds.map(oid).filter(Boolean) };
    else if (category) filter.category = oid(category);
    else return next({ status: 400, message: "productIds veya category gerekli" });

    if (op === "active") {
      const r = await MarketOrgProduct.updateMany(filter, { $set: { isActive: !!value } });
      return res.json({ matched: r.matchedCount, modified: r.modifiedCount });
    }
    if (op === "price" && value && typeof value === "object") {
      if (value.mode === "set") {
        const amt = Number(value.amount);
        if (Number.isNaN(amt) || amt < 0) return next({ status: 400, message: "Geçersiz fiyat" });
        const r = await MarketOrgProduct.updateMany(filter, { $set: { defaultPrice: amt } });
        return res.json({ matched: r.matchedCount, modified: r.modifiedCount });
      }
      if (value.mode === "percent") {
        const pct = Number(value.amount);
        if (Number.isNaN(pct)) return next({ status: 400, message: "Geçersiz yüzde" });
        const r = await MarketOrgProduct.updateMany(filter, [ { $set: { defaultPrice: { $round: [{ $multiply: ["$defaultPrice", 1 + pct / 100] }, 2] } } } ]);
        return res.json({ matched: r.matchedCount, modified: r.modifiedCount });
      }
    }
    return next({ status: 400, message: "Geçersiz işlem" });
  } catch (e) { next(e); }
};

// PATCH /market/org/:organizationId/branches/:storeId  (operational only — NO commission)
export const orgUpdateBranch = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId); const sid = oid(req.params.storeId);
    if (!orgId || !sid) return next({ status: 400, message: "Geçersiz id" });
    const set = {};
    for (const k of BRANCH_OPS_FIELDS) if (req.body[k] !== undefined) set[k] = req.body[k];
    if (req.body.workingHours && typeof req.body.workingHours === "object") set.workingHours = req.body.workingHours;
    const store = await MarketStore.findOneAndUpdate({ _id: sid, organization: orgId }, { $set: set }, { new: true }).lean();
    if (!store) return next({ status: 404, message: "Şube bu zincirde bulunamadı" });
    res.json({ store });
  } catch (e) { next(e); }
};

// POST /market/org/:organizationId/products/bulk-price  body { rows:[{barcode,price}], dryRun?:bool }
export const orgBulkPrice = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const rawRows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
    const dryRun = req.body.dryRun === true;
    const { valid, invalid } = parsePriceRows(rawRows);

    let matched = 0, updated = 0;
    const notFound = [];
    for (const row of valid) {
      const existing = await MarketOrgProduct.findOne({ organizationId: orgId, barcode: row.barcode }).select("_id").lean();
      if (!existing) { notFound.push(row.barcode); continue; }
      matched++;
      if (!dryRun) {
        await MarketOrgProduct.updateOne({ _id: existing._id }, { $set: { defaultPrice: row.price } });
        updated++;
      }
    }
    res.json({ dryRun, total: rawRows.length, matched, updated, notFound, invalid });
  } catch (e) { next(e); }
};
