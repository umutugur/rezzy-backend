import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketOrgProduct from "../models/MarketOrgProduct.js";
import MarketBranchOverride from "../models/MarketBranchOverride.js";

/**
 * Pure merge: org product (+ optional branch override) -> a MarketProduct-shaped
 * resolved item. discountPrice precedence: override wins if the field is present
 * (including 0); otherwise the org default applies.
 */
export function mergeOrgProduct(orgProduct, override) {
  const o = override || {};
  const price = o.price != null ? Number(o.price) : Number(orgProduct.defaultPrice);
  const discountPrice =
    o.discountPrice !== undefined
      ? (o.discountPrice == null ? null : Number(o.discountPrice))
      : (orgProduct.defaultDiscountPrice ?? null);
  const isAvailable = o.isAvailable != null ? !!o.isAvailable : true;
  return {
    source: "org",
    orgProductId: orgProduct._id,
    _id: orgProduct._id,
    title: orgProduct.title,
    description: orgProduct.description || "",
    barcode: orgProduct.barcode || "",
    unit: orgProduct.unit || "piece",
    category: orgProduct.category,
    imageUrl: orgProduct.imageUrl || "",
    photos: orgProduct.imageUrl ? [orgProduct.imageUrl] : [],
    price,
    discountPrice,
    isAvailable,
    isActive: true,
  };
}

/** Effective product list for a store: resolved org items + local products. */
export async function resolveStoreCatalog(storeOrId) {
  const store =
    typeof storeOrId === "object" && storeOrId?._id
      ? storeOrId
      : await MarketStore.findById(storeOrId).lean();
  if (!store) return [];

  const local = await MarketProduct.find({ store: store._id, isActive: true }).lean();
  const localItems = local.map((p) => ({ ...p, source: "product" }));

  if (!store.organization) return localItems;

  const [orgProducts, overrides] = await Promise.all([
    MarketOrgProduct.find({ organizationId: store.organization, isActive: true }).sort({ order: 1 }).lean(),
    MarketBranchOverride.find({ store: store._id }).lean(),
  ]);
  const ovByProduct = new Map(overrides.map((o) => [String(o.orgProductId), o]));

  const orgItems = [];
  for (const op of orgProducts) {
    const ov = ovByProduct.get(String(op._id));
    if (ov?.hidden) continue;
    orgItems.push(mergeOrgProduct(op, ov));
  }
  return [...orgItems, ...localItems];
}

/** Resolve one org product for a store, for order pricing. null if not in org / hidden / inactive. */
export async function resolveOrgProductForOrder(storeId, orgProductId) {
  const store = await MarketStore.findById(storeId).lean();
  if (!store || !store.organization) return null;
  const op = await MarketOrgProduct.findOne({ _id: orgProductId, organizationId: store.organization, isActive: true }).lean();
  if (!op) return null;
  const ov = await MarketBranchOverride.findOne({ store: storeId, orgProductId }).lean();
  if (ov?.hidden) return null;
  return mergeOrgProduct(op, ov);
}
