import mongoose from "mongoose";
import MarketOrgProduct from "../models/MarketOrgProduct.js";
import MarketStore from "../models/MarketStore.js";
import CoreCategory from "../models/CoreCategory.js";

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v||"").trim()) ? new mongoose.Types.ObjectId(String(v).trim()) : null);
const FIELDS = ["category","title","description","barcode","unit","defaultPrice","defaultDiscountPrice","imageUrl","order","isActive"];

export const listOrgProducts = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const { q, category } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const filter = { organizationId: orgId, isActive: true };
    if (q && String(q).trim()) filter.$or = [{ title: { $regex: String(q).trim(), $options: "i" } }, { barcode: String(q).trim() }];
    if (category) filter.category = oid(category);
    const [items, total] = await Promise.all([
      MarketOrgProduct.find(filter).populate("category", "key").sort({ order: 1, createdAt: -1 }).skip((page-1)*limit).limit(limit).lean(),
      MarketOrgProduct.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (e) { next(e); }
};

export const createOrgProduct = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    if (!req.body.title || req.body.defaultPrice == null) return next({ status: 400, message: "Başlık ve fiyat zorunlu" });
    if (!req.body.category) return next({ status: 400, message: "Kategori zorunlu" });
    const catExists = await CoreCategory.exists({ _id: oid(req.body.category) });
    if (!catExists) return next({ status: 400, message: "Geçersiz kategori" });
    const doc = { organizationId: orgId };
    for (const k of FIELDS) if (req.body[k] !== undefined) doc[k] = req.body[k];
    const created = await MarketOrgProduct.create(doc);
    res.status(201).json({ item: created });
  } catch (e) { next(e); }
};

export const updateOrgProduct = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    const id = oid(req.params.id);
    if (!orgId || !id) return next({ status: 400, message: "Geçersiz id" });
    const set = {};
    for (const k of FIELDS) if (req.body[k] !== undefined) set[k] = req.body[k];
    const item = await MarketOrgProduct.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: set }, { new: true }).lean();
    if (!item) return next({ status: 404, message: "Ürün bulunamadı" });
    res.json({ item });
  } catch (e) { next(e); }
};

export const deleteOrgProduct = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    const id = oid(req.params.id);
    if (!orgId || !id) return next({ status: 400, message: "Geçersiz id" });
    const r = await MarketOrgProduct.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: { isActive: false } });
    if (!r) return next({ status: 404, message: "Ürün bulunamadı" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export const listOrgBranches = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const stores = await MarketStore.find({ organization: orgId }).select("_id name city isActive").lean();
    res.json({ items: stores });
  } catch (e) { next(e); }
};
