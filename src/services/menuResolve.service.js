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
 */
export async function getResolvedMenuForRestaurant(restaurantId, opts = {}) {
  const rid = toObjectId(restaurantId);
  if (!rid) {
    throw new Error("Invalid restaurantId");
  }

  const restaurant = await Restaurant.findById(rid)
    .select("_id organizationId")
    .lean();

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  // Org yoksa: klasik restoran menüsü (local only)
  if (!restaurant.organizationId) {
    return getLocalMenuForRestaurant(rid);
  }

  const orgId = restaurant.organizationId;

  // Org menü + override + lokal menü birlikte çekiliyor
  const [orgCategories, orgItems, restCategories, restItems] =
    await Promise.all([
      OrgMenuCategory.find({ organizationId: orgId, isActive: true })
        .sort({ order: 1, _id: 1 })
        .lean(),
      OrgMenuItem.find({ organizationId: orgId, isActive: true })
        .sort({ order: 1, _id: 1 })
        .lean(),
      MenuCategory.find({ restaurantId: rid }).lean(),
      MenuItem.find({ restaurantId: rid }).lean(),
    ]);

  // ---- Category override map: orgCategoryId -> categoryOverride ----
  const categoryOverrideByOrgId = new Map();
  const localCategories = [];

  for (const c of restCategories) {
    if (c.orgCategoryId) {
      const key = String(c.orgCategoryId);
      // birden fazla override varsa ilkini baz alıyoruz
      if (!categoryOverrideByOrgId.has(key)) {
        categoryOverrideByOrgId.set(key, c);
      }
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
      // burada da ilk override'ı baz alıyoruz
      if (!itemOverrideByOrgId.has(key)) {
        itemOverrideByOrgId.set(key, it);
      }
    } else {
      localItems.push(it);
    }
  }

  // Local item'ları kategoriId'ye göre gruplayalım (local category için lazım olacak)
  const localItemsByCategoryId = new Map();
  for (const it of localItems) {
    const key = String(it.categoryId);
    if (!localItemsByCategoryId.has(key)) {
      localItemsByCategoryId.set(key, []);
    }
    localItemsByCategoryId.get(key).push(it);
  }

  // ---- 1) Org tabanlı kategoriler (override + org merge) ----
  const resolvedCategories = [];

  for (const orgCat of orgCategories) {
    const orgCatIdStr = String(orgCat._id);
    const overrideCat = categoryOverrideByOrgId.get(orgCatIdStr) || null;

    const isActive =
      overrideCat?.isActive !== undefined
        ? overrideCat.isActive
        : orgCat.isActive;

    // Kategori tamamen pasifse skip
    if (!isActive) continue;

    const resolvedCategoryId = overrideCat?._id || orgCat._id;
    const resolvedCategory = {
      _id: resolvedCategoryId,
      categoryId: resolvedCategoryId, // backward compat için
      orgCategoryId: orgCat._id,
      restaurantId: restaurant._id,
      title: overrideCat?.title || orgCat.title,
      description: overrideCat?.description || orgCat.description || "",
      order:
        overrideCat?.order !== undefined ? overrideCat.order : orgCat.order || 0,
      isActive,
      source: overrideCat ? "org_override" : "org",
      items: [],
    };

    // Bu org kategoriye bağlı org item'lar
    const orgItemsForCategory = orgItems.filter(
      (it) => String(it.categoryId) === orgCatIdStr
    );

    const resolvedItems = [];

    for (const orgItem of orgItemsForCategory) {
      const orgItemIdStr = String(orgItem._id);
      const overrideItem = itemOverrideByOrgId.get(orgItemIdStr) || null;

      const itemIsActive =
        overrideItem?.isActive !== undefined
          ? overrideItem.isActive
          : orgItem.isActive;

      if (!itemIsActive) continue;

      const price =
        overrideItem?.price != null ? overrideItem.price : orgItem.defaultPrice;

      const photoUrl =
        overrideItem?.photoUrl || orgItem.photoUrl || "";

      const tags =
        overrideItem?.tags && overrideItem.tags.length
          ? overrideItem.tags
          : orgItem.tags || [];

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
        order:
          overrideItem?.order !== undefined
            ? overrideItem.order
            : orgItem.order || 0,
        isActive: itemIsActive,
        isAvailable:
          overrideItem?.isAvailable !== undefined
            ? overrideItem.isAvailable
            : true,
        source: overrideItem ? "org_override" : "org",
      });
    }

    // order'a göre sort
    resolvedItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    resolvedCategory.items = resolvedItems;

    // (opsiyonel) override kategori altında lokal item’lar da göstermek istersen:
    // const localForThisCat =
    //   overrideCat && localItemsByCategoryId.get(String(overrideCat._id));
    // onları da push edebiliriz. Şimdilik sade bırakıyorum.

    resolvedCategories.push(resolvedCategory);
  }

  // ---- 2) Local-only kategoriler (orgCategoryId null) ----
  for (const localCat of localCategories) {
    const localCatIdStr = String(localCat._id);

    if (localCat.isActive === false) continue;

    const localResolvedCategory = {
      id: localCat._id,
      categoryId: localCat._id,
      orgCategoryId: null,
      restaurantId: restaurant._id,
      title: localCat.title,
      description: localCat.description || "",
      order: localCat.order || 0,
      isActive: localCat.isActive !== false,
      source: "local",
      items: [],
    };

    const itemsForLocalCat =
      localItemsByCategoryId.get(localCatIdStr) || [];

    const resolvedLocalItems = itemsForLocalCat
      .filter((it) => it.isActive !== false && it.isAvailable !== false)
      .map((it) => ({
        id: it._id,
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
async function getLocalMenuForRestaurant(restaurantId) {
  const [categories, items] = await Promise.all([
    MenuCategory.find({
      restaurantId,
      isActive: true,
    })
      .sort({ order: 1, _id: 1 })
      .lean(),
    MenuItem.find({
      restaurantId,
      isActive: true,
      isAvailable: true,
    })
      .sort({ order: 1, _id: 1 })
      .lean(),
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