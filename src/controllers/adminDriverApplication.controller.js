import mongoose from "mongoose";
import DriverDocRequirement from "../models/DriverDocRequirement.js";
import DriverApplication from "../models/DriverApplication.js";
import TaxiDriver from "../models/TaxiDriver.js";
import { isApprovable } from "../utils/driverApplication.logic.js";

const norm = (c) => String(c || "").toUpperCase().trim();

// ── Requirements CRUD ──
export const listRequirements = async (req, res, next) => {
  try {
    const country = norm(req.query.country);
    const q = country ? { countryCode: country } : {};
    const items = await DriverDocRequirement.find(q).sort({ countryCode: 1, order: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

export const createRequirement = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.key || !b.countryCode) return next({ status: 400, message: "key ve countryCode zorunlu" });
    const doc = await DriverDocRequirement.create({
      countryCode: norm(b.countryCode),
      key: String(b.key).trim(),
      i18n: b.i18n || {},
      file: b.file !== false,
      number: !!b.number,
      numberLabel: b.numberLabel || {},
      expiry: !!b.expiry,
      required: b.required !== false,
      order: Number(b.order) || 0,
      isActive: b.isActive !== false,
    });
    res.json({ item: doc.toObject() });
  } catch (e) {
    if (e.code === 11000) return next({ status: 409, message: "Bu ülke için bu key zaten var" });
    next(e);
  }
};

export const updateRequirement = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz id" });
    const b = req.body || {};
    const set = {};
    for (const f of ["i18n", "numberLabel"]) if (b[f] !== undefined) set[f] = b[f];
    for (const f of ["file", "number", "expiry", "required", "isActive"]) if (b[f] !== undefined) set[f] = !!b[f];
    if (b.order !== undefined) set.order = Number(b.order) || 0;
    if (b.key !== undefined) set.key = String(b.key).trim();
    if (b.countryCode !== undefined) set.countryCode = norm(b.countryCode);
    const doc = await DriverDocRequirement.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return next({ status: 404, message: "Bulunamadı" });
    res.json({ item: doc });
  } catch (e) {
    if (e.code === 11000) return next({ status: 409, message: "Bu ülke için bu key zaten var" });
    next(e);
  }
};

export const deleteRequirement = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz id" });
    await DriverDocRequirement.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ── Applications ──
export const listApplications = async (req, res, next) => {
  try {
    const { status, q, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const pg = Number(page), lim = Number(limit), skip = (pg - 1) * lim;
    const [rows, total] = await Promise.all([
      DriverApplication.find(filter).populate("user", "name email").sort({ updatedAt: -1 }).skip(skip).limit(lim).lean(),
      DriverApplication.countDocuments(filter),
    ]);
    let items = rows;
    if (q && String(q).trim().length >= 2) {
      const needle = String(q).trim().toLowerCase();
      items = rows.filter((r) =>
        (r.user?.name || "").toLowerCase().includes(needle) ||
        (r.user?.email || "").toLowerCase().includes(needle) ||
        (r.vehicle?.plate || "").toLowerCase().includes(needle)
      );
    }
    res.json({ items, total, page: pg, limit: lim });
  } catch (e) { next(e); }
};

export const getApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz id" });
    const app = await DriverApplication.findById(id).populate("user", "name email").lean();
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });
    const requirements = await DriverDocRequirement.find({ countryCode: app.countryCode }).sort({ order: 1 }).lean();
    res.json({ application: app, requirements });
  } catch (e) { next(e); }
};

export const reviewDocument = async (req, res, next) => {
  try {
    const { id, key } = req.params;
    const { status, rejectReason } = req.body || {};
    if (!["verified", "rejected"].includes(status)) return next({ status: 400, message: "status verified|rejected olmalı" });
    const app = await DriverApplication.findById(id);
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });
    const doc = app.documents.find((d) => d.requirementKey === key);
    if (!doc) return next({ status: 404, message: "Belge bulunamadı" });
    doc.status = status;
    doc.rejectReason = status === "rejected" ? (rejectReason || "Belirtilmedi") : null;
    await app.save();
    res.json({ application: app.toObject() });
  } catch (e) { next(e); }
};

export const approveApplication = async (req, res, next) => {
  try {
    const app = await DriverApplication.findById(req.params.id);
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });
    const reqs = await DriverDocRequirement.find({ countryCode: app.countryCode, isActive: true }).lean();
    if (!isApprovable(app, reqs)) return next({ status: 400, message: "Tüm zorunlu belgeler doğrulanmadan onaylanamaz" });

    app.status = "approved"; app.reviewedBy = req.user.id; app.reviewedAt = new Date(); app.rejectReason = null;
    await app.save();

    const lic = app.documents.find((d) => d.requirementKey === "driving_license");
    await TaxiDriver.findOneAndUpdate(
      { user: app.user },
      { $set: {
          vehiclePlate: app.vehicle.plate, vehicleBrand: app.vehicle.brand,
          vehicleModel: app.vehicle.model, vehicleColor: app.vehicle.color, type: app.vehicle.type,
          isApproved: true, photoUrl: app.selfieUrl, licenseNumber: lic?.number || "", rejectionReason: null,
      } },
      { upsert: true, new: true }
    );
    res.json({ application: app.toObject() });
  } catch (e) { next(e); }
};

export const rejectApplication = async (req, res, next) => {
  try {
    const app = await DriverApplication.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "rejected", rejectReason: (req.body?.reason) || "Belirtilmedi", reviewedBy: req.user.id, reviewedAt: new Date() } },
      { new: true }
    ).lean();
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });
    res.json({ application: app });
  } catch (e) { next(e); }
};
