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
