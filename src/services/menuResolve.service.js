// src/services/menuResolve.service.js
import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import OrgMenuCategory from "../models/OrgMenuCategory.js";
import OrgMenuItem from "../models/OrgMenuItem.js";
import MenuCategory from "../models/MenuCategory.js";
import MenuItem from "../models/MenuItem.js";

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

/**
 * Tek kapı:
 *  - Restaurant'ın organizationId'si varsa:
 *    OrgMenuCategory + OrgMenuItem + override + lokal item'ları merge eder.
 *  - organizationId yoksa:
 *    Eski sistem gibi sadece MenuCategory + MenuItem döner.
 *
 * opts:
 *  - includeInactive: true ise isActive=false kayıtları da döner (panel yönetim için)
 *  - includeUnavailable: true ise isAvailable=false ürünleri de döner
 */
export async function getResolvedMenuForRestaurant(restaurantId, opts = {}) {
  const rid = toObjectId(restaurantId);
  if (!rid) throw new Error("Invalid restaurantId");

  const includeInactive = opts?.includeInactive === true;
  const includeUnavailable = opts?.includeUnavailable === true;

  const restaurant = await Restaurant.findById(rid).select("_id organizationId").lean();
  if (!restaurant) throw new Error("Restaurant not found");

  // Org yoksa: klasik restoran menüsü (local only)
  if (!restaurant.organizationId) {
    return getLocalMenuForRestaurant(rid, { includeInactive, includeUnavailable });
  }

  const orgId = restaurant.organizationId;

  // Org menü + override + lokal menü birlikte çekiliyor
  const [orgCategories, orgItems, restCategories, restItems] = await Promise.all([
    // Org tarafında DB query'yi isActive true ile bırakıyoruz; kapalıları org tarafında dönmek istiyorsan
    // burada da includeInactive'e göre genişletebilirsin. Şimdilik mevcut davranışı koruyoruz.
    OrgMenuCategory.find({ organizationId: orgId, isActive: true }).sort({ order: 1, _id: 1 }).lean(),
    OrgMenuItem.find({ organizationId: orgId, isActive: true }).sort({ order: 1, _id: 1 }).lean(),
    // Restaurant tarafı override/local kayıtları: includeInactive true ise hepsini al
    MenuCategory.find({ restaurantId: rid }).lean(),
    MenuItem.find({ restaurantId: rid }).lean(),
  ]);

  // ---- Category override map: orgCategoryId -> categoryOverride ----
  const categoryOverrideByOrgId = new Map();
  const localCategories = [];

  for (const c of restCategories) {
    if (c.orgCategoryId) {
      const key = String(c.orgCategoryId);
      if (!categoryOverrideByOrgId.has(key)) categoryOverrideByOrgId.set(key, c);
    } else {
      localCategories.push(c);
    }
  }

  // ---- Item override map: orgItemId -> itemOverride ----
  const itemOverrideByOrgId = new Map();
  const localItems = [];

  for (const it of restItems) {
    if (it.orgItemId) {
      const key = String(it.orgItemId);
      if (!itemOverrideByOrgId.has(key)) itemOverrideByOrgId.set(key, it);
    } else {
      localItems.push(it);
    }
  }

  // Local item'ları kategoriId'ye göre gruplayalım
  const localItemsByCategoryId = new Map();
  for (const it of localItems) {
    const key = String(it.categoryId);
    if (!localItemsByCategoryId.has(key)) localItemsByCategoryId.set(key, []);
    localItemsByCategoryId.get(key).push(it);
  }

  // ---- 1) Org tabanlı kategoriler (override + org merge) ----
  const resolvedCategories = [];

  // optimize: orgItems'i categoryId'ye göre grupla (filter ile her seferinde taramayalım)
  const orgItemsByCategoryId = new Map();
  for (const it of orgItems) {
    const key = String(it.categoryId);
    if (!orgItemsByCategoryId.has(key)) orgItemsByCategoryId.set(key, []);
    orgItemsByCategoryId.get(key).push(it);
  }

  for (const orgCat of orgCategories) {
    const orgCatIdStr = String(orgCat._id);
    const overrideCat = categoryOverrideByOrgId.get(orgCatIdStr) || null;

    const isActive = overrideCat?.isActive !== undefined ? overrideCat.isActive : orgCat.isActive;

    // ✅ includeInactive=false ise pasif kategori skip
    if (!includeInactive && !isActive) continue;

    const resolvedCategoryId = overrideCat?._id || orgCat._id;

    const resolvedCategory = {
      _id: resolvedCategoryId,
      categoryId: resolvedCategoryId, // backward compat
      orgCategoryId: orgCat._id,
      restaurantId: restaurant._id,
      title: overrideCat?.title || orgCat.title,
      description: overrideCat?.description || orgCat.description || "",
      order: overrideCat?.order !== undefined ? overrideCat.order : orgCat.order || 0,
      isActive,
      source: overrideCat ? "org_override" : "org",
      items: [],
    };

    const orgItemsForCategory = orgItemsByCategoryId.get(orgCatIdStr) || [];
    const resolvedItems = [];

    for (const orgItem of orgItemsForCategory) {
      const orgItemIdStr = String(orgItem._id);
      const overrideItem = itemOverrideByOrgId.get(orgItemIdStr) || null;

      const itemIsActive =
        overrideItem?.isActive !== undefined ? overrideItem.isActive : orgItem.isActive;

      // ✅ includeInactive=false ise pasif item skip
      if (!includeInactive && !itemIsActive) continue;

      const isAvailable =
        overrideItem?.isAvailable !== undefined ? overrideItem.isAvailable : true;

      // ✅ includeUnavailable=false ise stok yok item skip
      if (!includeUnavailable && isAvailable === false) continue;

      const price = overrideItem?.price != null ? overrideItem.price : orgItem.defaultPrice;
      const photoUrl = overrideItem?.photoUrl || orgItem.photoUrl || "";
      const tags =
        overrideItem?.tags && overrideItem.tags.length ? overrideItem.tags : orgItem.tags || [];

      const resolvedItemId = overrideItem?._id || orgItem._id;

      resolvedItems.push({
        _id: resolvedItemId,
        itemId: resolvedItemId, // backward compat
        orgItemId: orgItem._id,
        restaurantId: restaurant._id,
        categoryId: resolvedCategoryId,
        title: overrideItem?.title || orgItem.title,
        description: overrideItem?.description || orgItem.description || "",
        price,
        photoUrl,
        tags,
        order: overrideItem?.order !== undefined ? overrideItem.order : orgItem.order || 0,
        isActive: itemIsActive,
        isAvailable,
        source: overrideItem ? "org_override" : "org",
      });
    }

    resolvedItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    resolvedCategory.items = resolvedItems;

    resolvedCategories.push(resolvedCategory);
  }

  // ---- 2) Local-only kategoriler (orgCategoryId null) ----
  for (const localCat of localCategories) {
    const localCatIdStr = String(localCat._id);

    const catIsActive = localCat.isActive !== false;

    // ✅ includeInactive=false ise pasif kategori skip
    if (!includeInactive && !catIsActive) continue;

    const localResolvedCategory = {
      id: localCat._id,
      _id: localCat._id, // bazı client'lar _id bakıyor
      categoryId: localCat._id,
      orgCategoryId: null,
      restaurantId: restaurant._id,
      title: localCat.title,
      description: localCat.description || "",
      order: localCat.order || 0,
      isActive: catIsActive,
      source: "local",
      items: [],
    };

    const itemsForLocalCat = localItemsByCategoryId.get(localCatIdStr) || [];

    const resolvedLocalItems = itemsForLocalCat
      .filter((it) => {
        const isActive = it.isActive !== false;
        const isAvailable = it.isAvailable !== false;

        if (!includeInactive && !isActive) return false;
        if (!includeUnavailable && !isAvailable) return false;
        return true;
      })
      .map((it) => ({
        id: it._id,
        _id: it._id,
        itemId: it._id,
        orgItemId: null,
        restaurantId: restaurant._id,
        categoryId: localCat._id,
        title: it.title,
        description: it.description || "",
        price: it.price ?? null,
        photoUrl: it.photoUrl || "",
        tags: it.tags || [],
        order: it.order || 0,
        isActive: it.isActive !== false,
        isAvailable: it.isAvailable !== false,
        source: "local",
      }));

    resolvedLocalItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    localResolvedCategory.items = resolvedLocalItems;

    resolvedCategories.push(localResolvedCategory);
  }

  // ---- 3) Kategori sıralaması ----
  resolvedCategories.sort((a, b) => (a.order || 0) - (b.order || 0));

  return {
    restaurantId: restaurant._id,
    organizationId: orgId,
    categories: resolvedCategories,
  };
}

/**
 * Org’suz restoranlar için basit local menü
 */
async function getLocalMenuForRestaurant(restaurantId, opts = {}) {
  const includeInactive = opts?.includeInactive === true;
  const includeUnavailable = opts?.includeUnavailable === true;

  const catQuery = { restaurantId };
  if (!includeInactive) catQuery.isActive = true;

  const itemQuery = { restaurantId };
  if (!includeInactive) itemQuery.isActive = true;
  if (!includeUnavailable) itemQuery.isAvailable = true;

  const [categories, items] = await Promise.all([
    MenuCategory.find(catQuery).sort({ order: 1, _id: 1 }).lean(),
    MenuItem.find(itemQuery).sort({ order: 1, _id: 1 }).lean(),
  ]);

  const itemsByCategoryId = new Map();
  for (const it of items) {
    const key = String(it.categoryId);
    if (!itemsByCategoryId.has(key)) itemsByCategoryId.set(key, []);
    itemsByCategoryId.get(key).push(it);
  }

  const resolvedCategories = categories.map((c) => {
    const key = String(c._id);
    const catItems = itemsByCategoryId.get(key) || [];
    catItems.sort((a, b) => (a.order || 0) - (b.order || 0));

    return {
      id: c._id,
      _id: c._id,
      categoryId: c._id,
      orgCategoryId: null,
      restaurantId: c.restaurantId,
      title: c.title,
      description: c.description || "",
      order: c.order || 0,
      isActive: c.isActive !== false,
      source: "local",
      items: catItems.map((it) => ({
        id: it._id,
        _id: it._id,
        itemId: it._id,
        orgItemId: null,
        restaurantId: it.restaurantId,
        categoryId: it.categoryId,
        title: it.title,
        description: it.description || "",
        price: it.price ?? null,
        photoUrl: it.photoUrl || "",
        tags: it.tags || [],
        order: it.order || 0,
        isActive: it.isActive !== false,
        isAvailable: it.isAvailable !== false,
        source: "local",
      })),
    };
  });

  return {
    restaurantId,
    organizationId: null,
    categories: resolvedCategories,
  };
}