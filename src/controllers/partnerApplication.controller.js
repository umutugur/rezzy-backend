import ApplicationDocRequirement from "../models/ApplicationDocRequirement.js";
import PartnerApplication from "../models/PartnerApplication.js";
import { isSubmittable, resetRejectedToPending } from "../utils/partnerApplication.logic.js";
import { isValidAppType, hasRequiredPayload } from "../config/partnerTypes.js";

const norm = (c) => String(c || "").toUpperCase().trim();

// GET /api/partner/requirements?appType=&country=
export const getRequirements = async (req, res, next) => {
  try {
    const { appType } = req.query;
    const country = norm(req.query.country);
    if (!isValidAppType(appType)) return next({ status: 400, message: "Geçersiz appType" });
    if (!country) return next({ status: 400, message: "country zorunlu" });
    const items = await ApplicationDocRequirement.find({
      appType,
      countryCode: country,
      isActive: true,
    }).sort({ order: 1, key: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

// GET /api/partner/application/me
export const getMyApplication = async (req, res, next) => {
  try {
    const app = await PartnerApplication.findOne({ user: req.user.id }).lean();
    res.json({ application: app || null });
  } catch (e) { next(e); }
};

// POST /api/partner/application
export const submitApplication = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { appType, payload, selfieUrl, documents: rawDocs } = req.body;
    const countryCode = norm(req.body.countryCode);

    if (!isValidAppType(appType)) return next({ status: 400, message: "Geçersiz appType" });
    if (!countryCode) return next({ status: 400, message: "countryCode zorunlu" });

    // One-per-user / mutually exclusive appType check
    const existing = await PartnerApplication.findOne({ user: userId }).lean();
    if (existing && existing.appType !== appType) {
      return next({ status: 409, message: "Zaten farklı türde bir başvurun var" });
    }

    // Fetch requirements for (appType, countryCode)
    const reqs = await ApplicationDocRequirement.find({
      appType,
      countryCode,
      isActive: true,
    }).lean();
    const allowed = new Set(reqs.map((r) => r.key));

    const documents = (rawDocs || [])
      .filter((d) => allowed.has(d.requirementKey))
      .map((d) => ({
        requirementKey: d.requirementKey,
        fileUrl: d.fileUrl || "",
        number: d.number || "",
        expiry: d.expiry ? new Date(d.expiry) : null,
        status: "pending",
        rejectReason: null,
      }));

    const draft = {
      user: userId,
      appType,
      countryCode,
      payload: payload || {},
      selfieUrl: selfieUrl || "",
      documents,
    };

    // Validate payload completeness
    if (!hasRequiredPayload(appType, draft.payload)) {
      return next({ status: 400, message: "Zorunlu işletme/araç bilgileri eksik" });
    }

    // Validate document completeness.
    // Selfie is only required for driver applications; market/restaurant skip it.
    const selfieForCheck = appType === "driver" ? draft.selfieUrl : "present";
    if (!isSubmittable({ selfieUrl: selfieForCheck, documents: draft.documents }, reqs)) {
      return next({ status: 400, message: "Tüm zorunlu belgeler ve fotoğraf gerekli" });
    }

    const app = await PartnerApplication.findOneAndUpdate(
      { user: userId },
      { $set: { ...draft, status: "pending", reviewedBy: null, reviewedAt: null, rejectReason: null } },
      { new: true, upsert: true }
    ).lean();
    res.json({ application: app });
  } catch (e) { next(e); }
};

// PUT /api/partner/application/resubmit
export const resubmitApplication = async (req, res, next) => {
  try {
    const app = await PartnerApplication.findOne({ user: req.user.id });
    if (!app) return next({ status: 404, message: "Başvuru bulunamadı" });

    const incoming = new Map((req.body.documents || []).map((d) => [d.requirementKey, d]));
    for (const d of app.documents) {
      const upd = incoming.get(d.requirementKey);
      if (upd) {
        d.fileUrl = upd.fileUrl || d.fileUrl;
        if (upd.number !== undefined) d.number = upd.number;
        if (upd.expiry !== undefined) d.expiry = upd.expiry ? new Date(upd.expiry) : null;
      }
    }
    app.documents = resetRejectedToPending(app.documents.map((d) => (d.toObject ? d.toObject() : d)));
    app.status = "pending";
    app.rejectReason = null;
    await app.save();
    res.json({ application: app.toObject() });
  } catch (e) { next(e); }
};
