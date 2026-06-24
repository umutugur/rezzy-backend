import mongoose from "mongoose";
import ApplicationDocRequirement from "../models/ApplicationDocRequirement.js";
import PartnerApplication from "../models/PartnerApplication.js";
import { isApprovable } from "../utils/partnerApplication.logic.js";
import { materializeApproval } from "../services/materializeApproval.js";

const norm = (c) => String(c || "").toUpperCase().trim();

// ── Requirements CRUD ──
export const listRequirements = async (req, res, next) => {
  try {
    const country = norm(req.query.country);
    const { appType } = req.query;
    const q = {};
    if (country) q.countryCode = country;
    if (appType) q.appType = appType;
    const items = await ApplicationDocRequirement.find(q).sort({ appType: 1, countryCode: 1, order: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

export const createRequirement = async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.key || !b.countryCode || !b.appType) return next({ status: 400, message: "key, countryCode ve appType zorunlu" });
    const doc = await ApplicationDocRequirement.create({
      appType: String(b.appType).trim(),
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
    if (e.code === 11000) return next({ status: 409, message: "Bu appType/ülke için bu key zaten var" });
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
    if (b.appType !== undefined) set.appType = String(b.appType).trim();
    const doc = await ApplicationDocRequirement.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    if (!doc) return next({ status: 404, message: "Bulunamadı" });
    res.json({ item: doc });
  } catch (e) {
    if (e.code === 11000) return next({ status: 409, message: "Bu appType/ülke için bu key zaten var" });
    next(e);
  }
};

export const deleteRequirement = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz id" });
    await ApplicationDocRequirement.deleteOne({ _id: id });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ── Applications ──
export const listApplications = async (req, res, next) => {
  try {
    const { status, q, appType, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (appType) filter.appType = appType;
    const pg = Number(page), lim = Number(limit), skip = (pg - 1) * lim;
    const [rows, total] = await Promise.all([
      PartnerApplication.find(filter).populate("user", "name email").sort({ updatedAt: -1 }).skip(skip).limit(lim).lean(),
      PartnerApplication.countDocuments(filter),
    ]);
    let items = rows;
    if (q && String(q).trim().length >= 2) {
      const needle = String(q).trim().toLowerCase();
      items = rows.filter((r) =>
        (r.user?.name || "").toLowerCase().includes(needle) ||
        (r.user?.email || "").toLowerCase().includes(needle) ||
        (r.payload?.plate || "").toLowerCase().includes(needle)
      );
    }
    res.json({ items, total, page: pg, limit: lim });
  } catch (e) { next(e); }
};

export const getApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz id" });
    const app = await PartnerApplication.findById(id).populate("user", "name email").lean();
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });
    const requirements = await ApplicationDocRequirement.find({
      appType: app.appType,
      countryCode: app.countryCode,
    }).sort({ order: 1 }).lean();
    res.json({ application: app, requirements });
  } catch (e) { next(e); }
};

export const reviewDocument = async (req, res, next) => {
  try {
    const { id, key } = req.params;
    const { status, rejectReason } = req.body || {};
    if (!["verified", "rejected"].includes(status)) return next({ status: 400, message: "status verified|rejected olmalı" });
    const app = await PartnerApplication.findById(id);
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
    const app = await PartnerApplication.findById(req.params.id);
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });
    const reqs = await ApplicationDocRequirement.find({
      appType: app.appType,
      countryCode: app.countryCode,
      isActive: true,
    }).lean();
    if (!isApprovable(app, reqs)) return next({ status: 400, message: "Tüm zorunlu belgeler doğrulanmadan onaylanamaz" });

    app.status = "approved"; app.reviewedBy = req.user.id; app.reviewedAt = new Date(); app.rejectReason = null;
    await app.save();

    await materializeApproval(app);
    res.json({ application: app.toObject() });
  } catch (e) { next(e); }
};

export const rejectApplication = async (req, res, next) => {
  try {
    const app = await PartnerApplication.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "rejected", rejectReason: (req.body?.reason) || "Belirtilmedi", reviewedBy: req.user.id, reviewedAt: new Date() } },
      { new: true }
    ).lean();
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });
    res.json({ application: app });
  } catch (e) { next(e); }
};
