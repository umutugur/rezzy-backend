import DriverDocRequirement from "../models/DriverDocRequirement.js";
import DriverApplication from "../models/DriverApplication.js";
import { isSubmittable, resetRejectedToPending } from "../utils/driverApplication.logic.js";

const norm = (c) => String(c || "").toUpperCase().trim();

// GET /api/taxi/driver/requirements?country=
export const getRequirements = async (req, res, next) => {
  try {
    const country = norm(req.query.country);
    if (!country) return next({ status: 400, message: "country zorunlu" });
    const items = await DriverDocRequirement.find({ countryCode: country, isActive: true })
      .sort({ order: 1, key: 1 }).lean();
    res.json({ items });
  } catch (e) { next(e); }
};

// GET /api/taxi/driver/application/me
export const getMyApplication = async (req, res, next) => {
  try {
    const app = await DriverApplication.findOne({ user: req.user.id }).lean();
    res.json({ application: app || null });
  } catch (e) { next(e); }
};

// POST /api/taxi/driver/application
export const submitApplication = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const countryCode = norm(req.body.countryCode);
    if (!countryCode) return next({ status: 400, message: "countryCode zorunlu" });

    const reqs = await DriverDocRequirement.find({ countryCode, isActive: true }).lean();
    const allowed = new Set(reqs.map((r) => r.key));

    const documents = (req.body.documents || [])
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
      countryCode,
      vehicle: req.body.vehicle || {},
      selfieUrl: req.body.selfieUrl || "",
      documents,
    };

    if (!isSubmittable(draft, reqs)) {
      return next({ status: 400, message: "Tüm zorunlu belgeler ve selfie gerekli" });
    }

    const app = await DriverApplication.findOneAndUpdate(
      { user: userId },
      { $set: { ...draft, status: "pending", reviewedBy: null, reviewedAt: null, rejectReason: null } },
      { new: true, upsert: true }
    ).lean();
    res.json({ application: app });
  } catch (e) { next(e); }
};

// PUT /api/taxi/driver/application/resubmit
export const resubmitApplication = async (req, res, next) => {
  try {
    const app = await DriverApplication.findOne({ user: req.user.id });
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
