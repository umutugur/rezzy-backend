// src/services/deliveryCategoryMatch.js
// Resolves a delivery chip key -> Set of matching restaurant ids (as strings).
// Matches keywords against restaurant name/businessType AND menu category titles + menu item titles.
import ServiceCategory from "../models/ServiceCategory.js";
import Restaurant from "../models/Restaurant.js";
import MenuCategory from "../models/MenuCategory.js";
import MenuItem from "../models/MenuItem.js";
import { keywordRegexes } from "./serviceCategories.helpers.js";

const _cache = new Map(); // `${region}|${key}` -> { ids:Set<string>|null, at:number }
const TTL = 60_000;

export function clearDeliveryCategoryCache() { _cache.clear(); }

/**
 * @returns {Promise<Set<string>|null>} null = chip unknown or has no keywords (no filtering)
 */
export async function restaurantIdsForCategory(region, categoryKey) {
  const cacheKey = `${String(region || "").toUpperCase()}|${String(categoryKey).toLowerCase()}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.ids;

  const chip = await ServiceCategory.findOne({ surface: "delivery", key: String(categoryKey).toLowerCase(), isActive: true }).lean();
  const regexes = keywordRegexes(chip?.keywords);
  let ids = null;
  if (regexes.length) {
    ids = new Set();
    const or = (field) => regexes.map((rx) => ({ [field]: rx }));
    // 1) direct: name / businessType
    const direct = await Restaurant.find({ $or: [...or("name"), ...or("businessType")] }).select("_id").lean();
    for (const d of direct) ids.add(String(d._id));
    // 2) menu category titles
    const catRestIds = await MenuCategory.distinct("restaurantId", { isActive: true, $or: or("title") });
    for (const id of catRestIds) ids.add(String(id));
    // 3) menu item titles (active + available only)
    const itemRestIds = await MenuItem.distinct("restaurantId", { isActive: true, isAvailable: true, $or: or("title") });
    for (const id of itemRestIds) ids.add(String(id));
  }
  _cache.set(cacheKey, { ids, at: Date.now() });
  return ids;
}
