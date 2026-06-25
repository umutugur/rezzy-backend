import VehicleMake from "../models/VehicleMake.js";
import VehicleModel from "../models/VehicleModel.js";

const norm = (c) => String(c || "").toUpperCase().trim();

// ── Makes ──
export const adminListMakes = async (req, res, next) => {
  try {
    const q = {};
    if (req.query.country) q.countryCode = norm(req.query.country);
    const items = await VehicleMake.find(q).sort({ countryCode: 1, order: 1, name: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};
export const adminCreateMake = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.countryCode) return next({ status: 400, message: "name ve countryCode zorunlu" });
    const doc = await VehicleMake.create({
      countryCode: norm(b.countryCode), name: String(b.name).trim(),
      order: Number(b.order) || 0, isActive: b.isActive !== false,
    });
    res.json({ item: doc.toObject() });
  } catch (e) { if (e.code === 11000) return next({ status: 409, message: "Bu ülke için bu marka zaten var" }); next(e); }
};
export const adminUpdateMake = async (req, res, next) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.order !== undefined) patch.order = Number(b.order) || 0;
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    const doc = await VehicleMake.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
    if (!doc) return next({ status: 404, message: "Marka bulunamadı" });
    res.json({ item: doc });
  } catch (e) { if (e.code === 11000) return next({ status: 409, message: "Bu ülke için bu marka zaten var" }); next(e); }
};
export const adminDeleteMake = async (req, res, next) => {
  try {
    const doc = await VehicleMake.findByIdAndDelete(req.params.id).lean();
    if (!doc) return next({ status: 404, message: "Marka bulunamadı" });
    // Bağlı modelleri de sil (aynı ülke + make)
    await VehicleModel.deleteMany({ countryCode: doc.countryCode, make: doc.name });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ── Models ──
export const adminListModels = async (req, res, next) => {
  try {
    const q = {};
    if (req.query.country) q.countryCode = norm(req.query.country);
    if (req.query.make) q.make = String(req.query.make).trim();
    const items = await VehicleModel.find(q).sort({ make: 1, order: 1, name: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};
export const adminCreateModel = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.countryCode || !b.make) return next({ status: 400, message: "name, countryCode ve make zorunlu" });
    const doc = await VehicleModel.create({
      countryCode: norm(b.countryCode), make: String(b.make).trim(), name: String(b.name).trim(),
      order: Number(b.order) || 0, isActive: b.isActive !== false,
    });
    res.json({ item: doc.toObject() });
  } catch (e) { if (e.code === 11000) return next({ status: 409, message: "Bu marka için bu model zaten var" }); next(e); }
};
export const adminUpdateModel = async (req, res, next) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.order !== undefined) patch.order = Number(b.order) || 0;
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    const doc = await VehicleModel.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
    if (!doc) return next({ status: 404, message: "Model bulunamadı" });
    res.json({ item: doc });
  } catch (e) { if (e.code === 11000) return next({ status: 409, message: "Bu marka için bu model zaten var" }); next(e); }
};
export const adminDeleteModel = async (req, res, next) => {
  try {
    const doc = await VehicleModel.findByIdAndDelete(req.params.id).lean();
    if (!doc) return next({ status: 404, message: "Model bulunamadı" });
    res.json({ ok: true });
  } catch (e) { next(e); }
};
