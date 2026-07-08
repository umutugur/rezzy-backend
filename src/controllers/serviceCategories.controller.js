import ServiceCategory from "../models/ServiceCategory.js";
import { visibleInRegion } from "../services/serviceCategories.helpers.js";

/** GET /api/service-categories?surface=market|delivery — public chip list (region-scoped). */
export async function listServiceCategories(req, res, next) {
  try {
    const surface = req.query.surface === "delivery" ? "delivery" : "market";
    const region = String(req.headers?.["x-region"] || req.user?.region || "").toUpperCase();
    const rows = await ServiceCategory.find({ surface, isActive: true })
      .sort({ order: 1, key: 1 })
      .lean();
    const categories = rows
      .filter((c) => visibleInRegion(c, region))
      .map((c) => ({ key: c.key, name: c.name, imageUrl: c.imageUrl, fallbackEmoji: c.fallbackEmoji }));
    res.json({ categories });
  } catch (e) { next(e); }
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────
import CoreCategory from "../models/CoreCategory.js";
import { slugifyKey } from "../services/serviceCategories.helpers.js";
import { validateParent } from "../services/categoryTree.js";

function validateBody(b) {
  if (!b?.surface || !["market", "delivery"].includes(b.surface)) return "surface market|delivery olmalı";
  if (!b?.name?.tr || !String(b.name.tr).trim()) return "name.tr zorunlu";
  if (b.surface === "market" && b.storeCategory && b.coreCategoryId)
    return "Mağaza tipi ve ürün kategorisi aynı anda seçilemez";
  return null;
}

export async function adminListServiceCategories(req, res, next) {
  try {
    const filter = {};
    if (req.query.surface) filter.surface = req.query.surface;
    const items = await ServiceCategory.find(filter).sort({ surface: 1, order: 1, key: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
}

export async function adminCreateServiceCategory(req, res, next) {
  try {
    const b = req.body || {};
    const err = validateBody(b);
    if (err) return res.status(400).json({ message: err });
    const key = slugifyKey(b.key || b.name.tr);
    if (!key) return res.status(400).json({ message: "Geçerli bir key üretilemedi" });
    const exists = await ServiceCategory.exists({ surface: b.surface, key });
    if (exists) return res.status(409).json({ message: "Bu key zaten var" });
    const doc = await ServiceCategory.create({
      surface: b.surface, key,
      name: { tr: b.name.tr, en: b.name.en || "", el: b.name.el || "", ru: b.name.ru || "" },
      imageUrl: b.imageUrl || "", fallbackEmoji: b.fallbackEmoji || "",
      regions: Array.isArray(b.regions) && b.regions.length ? b.regions : ["TR", "CY", "UK"],
      order: Number(b.order) || 0, isActive: b.isActive !== false,
      storeCategory: b.surface === "market" ? (b.storeCategory || null) : null,
      coreCategoryId: b.surface === "market" ? (b.coreCategoryId || null) : null,
      keywords: b.surface === "delivery"
        ? (Array.isArray(b.keywords) ? b.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean) : [])
        : [],
    });
    res.status(201).json({ item: doc });
  } catch (e) { next(e); }
}

export async function adminUpdateServiceCategory(req, res, next) {
  try {
    const b = req.body || {};
    const doc = await ServiceCategory.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Bulunamadı" });
    const err = validateBody({ ...doc.toObject(), ...b, surface: doc.surface });
    if (err) return res.status(400).json({ message: err });
    if (b.name) doc.name = { tr: b.name.tr ?? doc.name.tr, en: b.name.en ?? doc.name.en, el: b.name.el ?? doc.name.el, ru: b.name.ru ?? doc.name.ru };
    for (const f of ["imageUrl", "fallbackEmoji", "order", "isActive", "regions"]) if (b[f] !== undefined) doc[f] = b[f];
    if (doc.surface === "market") {
      if (b.storeCategory !== undefined) doc.storeCategory = b.storeCategory || null;
      if (b.coreCategoryId !== undefined) doc.coreCategoryId = b.coreCategoryId || null;
    } else if (b.keywords !== undefined) {
      doc.keywords = (Array.isArray(b.keywords) ? b.keywords : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean);
    }
    await doc.save();
    res.json({ item: doc });
  } catch (e) { next(e); }
}

export async function adminDeleteServiceCategory(req, res, next) {
  try {
    await ServiceCategory.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

// ── Minimal CoreCategory admin (none existed) ────────────────────────────────
export async function adminListCoreCategories(req, res, next) {
  try {
    const items = await CoreCategory.find({}).select("key i18n businessTypes order isActive parentId").sort({ order: 1, key: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
}

export async function adminCreateCoreCategory(req, res, next) {
  try {
    const b = req.body || {};
    const trTitle = b?.i18n?.tr?.title || b?.title;
    if (!trTitle) return res.status(400).json({ message: "TR başlık zorunlu" });
    const key = slugifyKey(b.key || trTitle);
    const exists = await CoreCategory.exists({ key });
    if (exists) return res.status(409).json({ message: "Bu key zaten var" });

    let parentId = null;
    if (b.parentId) {
      const parent = await CoreCategory.findById(b.parentId).select("_id parentId").lean();
      if (!parent) return res.status(400).json({ message: "Üst kategori bulunamadı" });
      const err = validateParent({ _id: null }, parent);
      if (err) return res.status(400).json({ message: err });
      parentId = parent._id;
    }

    const mk = (t) => ({ title: t, description: "" });
    const item = await CoreCategory.create({
      key,
      parentId,
      businessTypes: Array.isArray(b.businessTypes) && b.businessTypes.length ? b.businessTypes : ["market"],
      i18n: {
        tr: mk(trTitle),
        en: mk(b?.i18n?.en?.title || trTitle),
        el: mk(b?.i18n?.el?.title || trTitle),
        ru: mk(b?.i18n?.ru?.title || trTitle),
      },
      order: Number(b.order) || 0,
      isActive: b.isActive !== false,
    });
    res.status(201).json({ item });
  } catch (e) { next(e); }
}

export async function adminUpdateCoreCategory(req, res, next) {
  try {
    const doc = await CoreCategory.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Bulunamadı" });
    const b = req.body || {};
    if (b.i18n) for (const l of ["tr", "en", "el", "ru"]) if (b.i18n[l]?.title) doc.i18n[l].title = b.i18n[l].title;
    if (b.order !== undefined) doc.order = Number(b.order) || 0;
    if (b.isActive !== undefined) doc.isActive = !!b.isActive;
    if (Array.isArray(b.businessTypes) && b.businessTypes.length) doc.businessTypes = b.businessTypes;

    if ("parentId" in b) {
      if (!b.parentId) {
        doc.parentId = null;
      } else {
        const parent = await CoreCategory.findById(b.parentId).select("_id parentId").lean();
        if (!parent) return res.status(400).json({ message: "Üst kategori bulunamadı" });
        const err = validateParent({ _id: req.params.id }, parent);
        if (err) return res.status(400).json({ message: err });
        doc.parentId = parent._id;
      }
    }

    await doc.save();
    res.json({ item: doc });
  } catch (e) { next(e); }
}
