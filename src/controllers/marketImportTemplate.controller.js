import mongoose from "mongoose";
import MarketImportTemplate from "../models/MarketImportTemplate.js";

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v||"").trim()) ? new mongoose.Types.ObjectId(String(v).trim()) : null);
const FIELDS = ["name","columnMap","categoryMap","options","headerFingerprint"];

export const listImportTemplates = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    const items = await MarketImportTemplate.find({ organizationId: orgId }).sort({ updatedAt: -1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

export const createImportTemplate = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    if (!orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    if (!req.body.name || !String(req.body.name).trim()) return next({ status: 400, message: "Şablon adı zorunlu" });
    const doc = { organizationId: orgId };
    for (const k of FIELDS) if (req.body[k] !== undefined) doc[k] = req.body[k];
    const item = await MarketImportTemplate.create(doc);
    res.status(201).json({ item });
  } catch (e) { next(e); }
};

export const updateImportTemplate = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    const id = oid(req.params.id);
    if (!orgId || !id) return next({ status: 400, message: "Geçersiz id" });
    const set = {};
    for (const k of FIELDS) if (req.body[k] !== undefined) set[k] = req.body[k];
    const item = await MarketImportTemplate.findOneAndUpdate({ _id: id, organizationId: orgId }, { $set: set }, { new: true }).lean();
    if (!item) return next({ status: 404, message: "Şablon bulunamadı" });
    res.json({ item });
  } catch (e) { next(e); }
};

export const deleteImportTemplate = async (req, res, next) => {
  try {
    const orgId = oid(req.params.organizationId);
    const id = oid(req.params.id);
    if (!orgId || !id) return next({ status: 400, message: "Geçersiz id" });
    const r = await MarketImportTemplate.findOneAndDelete({ _id: id, organizationId: orgId });
    if (!r) return next({ status: 404, message: "Şablon bulunamadı" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};
