import Campaign from "../models/Campaign.js";
import CampaignParticipation from "../models/CampaignParticipation.js";

const CURRENCY_BY_REGION = { TR: "TRY", CY: "TRY", UK: "GBP" };

export const listCampaigns = async (req, res, next) => {
  try {
    const q = {};
    if (req.query.surface) q.surface = req.query.surface;
    if (req.query.region) q.region = String(req.query.region).toUpperCase();
    if (req.query.isActive === "true") q.isActive = true;
    if (req.query.isActive === "false") q.isActive = false;
    const items = await Campaign.find(q).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

export const getCampaign = async (req, res, next) => {
  try {
    const doc = await Campaign.findById(req.params.id).lean();
    if (!doc) return next({ status: 404, message: "Kampanya bulunamadı" });
    res.json({ item: doc });
  } catch (e) { next(e); }
};

function normalizeBody(b) {
  const region = String(b.region || "").toUpperCase();
  const out = {
    title: String(b.title || "").trim(),
    description: b.description || "",
    image: b.image || "",
    surface: b.surface,
    region,
    currency: CURRENCY_BY_REGION[region] || "",
    discount: {
      kind: b.discount?.kind,
      value: Number(b.discount?.value) || 0,
      maxDiscount: b.discount?.maxDiscount != null ? Number(b.discount.maxDiscount) : null,
    },
    conditions: {
      minSubtotal: Number(b.conditions?.minSubtotal) || 0,
      scope: b.conditions?.scope,
      categoryKeys: Array.isArray(b.conditions?.categoryKeys) ? b.conditions.categoryKeys : [],
      storeIds: Array.isArray(b.conditions?.storeIds) ? b.conditions.storeIds : [],
      organizationId: b.conditions?.organizationId || null,
      paymentMethods: Array.isArray(b.conditions?.paymentMethods) && b.conditions.paymentMethods.length ? b.conditions.paymentMethods : ["all"],
    },
    audience: {
      kind: b.audience?.kind || "public",
      trigger: b.audience?.trigger || null,
      winBackDays: b.audience?.winBackDays != null ? Number(b.audience.winBackDays) : null,
      collectible: b.audience?.collectible !== false,
    },
    funding: { platformSharePct: Math.max(0, Math.min(100, Number(b.funding?.platformSharePct ?? 100))) },
    requiresOptIn: b.surface === "taxi" ? false : b.requiresOptIn !== false,
    usageLimit: {
      perUser: Number(b.usageLimit?.perUser) || 1,
      total: b.usageLimit?.total != null ? Number(b.usageLimit.total) : null,
      showRemaining: !!b.usageLimit?.showRemaining,
    },
    budget: {
      cap: b.budget?.cap != null ? Number(b.budget.cap) : null,
      basis: b.budget?.basis === "discount" ? "discount" : "platform",
    },
    validFrom: b.validFrom,
    validTo: b.validTo,
    isActive: b.isActive !== false,
  };
  return out;
}

function validate(out) {
  if (!out.title) return "title zorunlu";
  if (!["market", "restaurant", "taxi"].includes(out.surface)) return "Geçersiz surface";
  if (!out.region) return "region zorunlu";
  if (!["percent", "fixed", "free_delivery", "fixed_price"].includes(out.discount.kind)) return "Geçersiz indirim tipi";
  if (!["platform", "category", "store", "chain"].includes(out.conditions.scope)) return "Geçersiz kapsam";
  if (out.conditions.scope === "category" && !out.conditions.categoryKeys.length) return "Kategori seçilmeli";
  if (out.conditions.scope === "store" && !out.conditions.storeIds.length) return "İşletme seçilmeli";
  if (out.conditions.scope === "chain" && !out.conditions.organizationId) return "Zincir seçilmeli";
  if (!out.validFrom || !out.validTo) return "Tarih aralığı zorunlu";
  if (new Date(out.validFrom) >= new Date(out.validTo)) return "Başlangıç bitişten önce olmalı";
  return null;
}

export const createCampaign = async (req, res, next) => {
  try {
    const out = normalizeBody(req.body || {});
    const err = validate(out);
    if (err) return next({ status: 400, message: err });
    out.createdBy = req.user?.id || req.user?._id;
    const doc = await Campaign.create(out);
    res.json({ item: doc.toObject() });
  } catch (e) { next(e); }
};

export const updateCampaign = async (req, res, next) => {
  try {
    const out = normalizeBody(req.body || {});
    const err = validate(out);
    if (err) return next({ status: 400, message: err });
    // budget.spent is system-maintained → never overwrite it.
    // Strip the `budget` object from the spread so $set has no conflict
    // between the full `budget` path and the dotted `budget.cap`/`budget.basis`.
    const { budget, ...rest } = out;
    const doc = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: { ...rest, "budget.cap": budget.cap, "budget.basis": budget.basis } },
      { new: true }
    ).lean();
    if (!doc) return next({ status: 404, message: "Kampanya bulunamadı" });
    res.json({ item: doc });
  } catch (e) { next(e); }
};

export const deleteCampaign = async (req, res, next) => {
  try {
    const doc = await Campaign.findByIdAndDelete(req.params.id).lean();
    if (!doc) return next({ status: 404, message: "Kampanya bulunamadı" });
    await CampaignParticipation.deleteMany({ campaign: doc._id });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

export const listParticipations = async (req, res, next) => {
  try {
    const rows = await CampaignParticipation.find({ campaign: req.params.id, status: "joined" }).lean();
    res.json({ items: rows });
  } catch (e) { next(e); }
};
