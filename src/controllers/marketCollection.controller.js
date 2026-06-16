import mongoose from "mongoose";
import MarketCollection from "../models/MarketCollection.js";

export const adminListCollections = async (req, res, next) => {
  try {
    const items = await MarketCollection.find().sort({ order: 1, createdAt: -1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

function sanitizeBody(b = {}) {
  const out = {};
  if (typeof b.title === "string") out.title = b.title.trim();
  if (b.region !== undefined) out.region = b.region ? String(b.region).toUpperCase() : null;
  if (b.kind === "manual" || b.kind === "discounted") out.kind = b.kind;
  if (Array.isArray(b.productIds)) out.productIds = b.productIds.filter((x) => mongoose.Types.ObjectId.isValid(x));
  if (b.imageUrl !== undefined) out.imageUrl = b.imageUrl || null;
  if (b.order !== undefined) out.order = Number(b.order) || 0;
  if (b.isActive !== undefined) out.isActive = !!b.isActive;
  return out;
}

export const adminCreateCollection = async (req, res, next) => {
  try {
    const body = sanitizeBody(req.body);
    if (!body.title) return next({ status: 400, message: "title zorunlu" });
    const col = await MarketCollection.create(body);
    res.status(201).json(col);
  } catch (e) { next(e); }
};

export const adminUpdateCollection = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz id" });
    const col = await MarketCollection.findByIdAndUpdate(id, { $set: sanitizeBody(req.body) }, { new: true });
    if (!col) return next({ status: 404, message: "Koleksiyon bulunamadı" });
    res.json(col);
  } catch (e) { next(e); }
};

export const adminDeleteCollection = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz id" });
    await MarketCollection.findByIdAndDelete(id);
    res.json({ ok: true });
  } catch (e) { next(e); }
};
