// src/services/menuResolve.service.js
import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import OrgMenuCategory from "../models/OrgMenuCategory.js";
import OrgMenuItem from "../models/OrgMenuItem.js";
import MenuCategory from "../models/MenuCategory.js";
import MenuItem from "../models/MenuItem.js";
import BranchMenuOverride from "../models/BranchMenuOverride.js";
import ModifierGroup from "../models/ModifierGroup.js";

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

function asIdList(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x))
    .filter((x) => mongoose.Types.ObjectId.isValid(x));
}

/**
 * Tek kapı:
 *  - Restaurant'ın organizationId'si varsa:
 *    OrgMenuCategory + OrgMenuItem + BranchMenuOverride + local menü merge eder.
 *  - organizationId yoksa:
 *    Eski sistem gibi sadece local menü döner.
 *
 * opts:
 *  - includeInactive: true ise pasif/hidden kayıtları da döner (panel yönetim için)
 *  - includeUnavailable: true ise isAvailable=false ürünleri de döner
 *  - includeModifierGroups: true ise item'ların modifierGroups populate edilir
 */
export async function getResolvedMenuForRestaurant(restaurantId, opts = {}) {
  const rid = toObjectId(restaurantId);
  if (!rid) throw new Error("Invalid restaurantId");

  const includeInactive = opts?.includeInactive === true;
  const includeUnavailable = opts?.includeUnavailable === true;
  const includeModifierGroups = opts?.includeModifierGroups === true;

  const restaurant = await Restaurant.findById(rid)
    .select("_id organizationId")
    .lean();
  if (!restaurant) throw new Error("Restaurant not found");

  // Org yoksa: klasik restoran menüsü (local only)
  if (!restaurant.organizationId) {
    const local = await getLocalMenuForRestaurant(rid, {
      includeInactive,
      includeUnavailable,
      includeModifierGroups,
    });
    return local;
  }

  const orgId = restaurant.organizationId;

  const [orgCategories, orgItems, overrides, localCategories, localItems] =
    await Promise.all([
      OrgMenuCategory.find({ organizationId: orgId })
        .sort({ order: 1, _id: 1 })
        .lean(),
      OrgMenuItem.find({ organizationId: orgId })
        .sort({ order: 1, _id: 1 })
        .lean(),

      BranchMenuOverride.find({ restaurantId: rid }).lean(),

      MenuCategory.find({ restaurantId: rid, orgCategoryId: null }).lean(),
      MenuItem.find({ restaurantId: rid, orgItemId: null }).lean(),
    ]);

  // override map
  const catOv = new Map();
  const itemOv = new Map();
  for (const ov of overrides) {
    const key = String(ov.targetId);
    if (ov.targetType === "category") catOv.set(key, ov);
    if (ov.targetType === "item") itemOv.set(key, ov);
  }

  // Local item'ları kategoriId'ye göre gruplayalım
  const localItemsByCategoryId = new Map();
  for (const it of localItems) {
    const key = String(it.categoryId);
    if (!localItemsByCategoryId.has(key)) localItemsByCategoryId.set(key, []);
    localItemsByCategoryId.get(key).push(it);
  }

  // Org items'ı categoryId'ye göre grupla
  const orgItemsByCategoryId = new Map();
  for (const it of orgItems) {
    const key = String(it.categoryId);
    if (!orgItemsByCategoryId.has(key)) orgItemsByCategoryId.set(key, []);
    orgItemsByCategoryId.get(key).push(it);
  }

  const resolvedCategories = [];

  // kullanilan modifier group id’leri topla (populate icin)
  const usedModifierGroupIds = new Set();

  // ---- 1) Org tabanlı kategoriler ----
  for (const orgCat of orgCategories) {
    const orgCatIdStr = String(orgCat._id);
    const overrideCat = catOv.get(orgCatIdStr) || null;

    const orgIsActive = orgCat.isActive !== false;
    const hidden = overrideCat?.hidden === true;

    const isActive = orgIsActive && !hidden;

    if (!includeInactive && !isActive) continue;

    const categoryOrder =
      overrideCat?.order !== undefined ? overrideCat.order : orgCat.order || 0;

    const resolvedCategoryId = orgCat._id;

    const resolvedCategory = {
      _id: resolvedCategoryId,
      categoryId: resolvedCategoryId,
      orgCategoryId: orgCat._id,
      restaurantId: restaurant._id,

      title: orgCat.title,
      description: orgCat.description || "",
      order: categoryOrder,
      isActive,
      source: overrideCat ? "org_branch_override" : "org",
      items: [],
    };

    const orgItemsForCategory = orgItemsByCategoryId.get(orgCatIdStr) || [];
    const resolvedItems = [];

    for (const orgItem of orgItemsForCategory) {
      const orgItemIdStr = String(orgItem._id);
      const overrideItem = itemOv.get(orgItemIdStr) || null;

      const orgItemActive = orgItem.isActive !== false;
      const itemHidden = overrideItem?.hidden === true;
      const itemIsActive = orgItemActive && !itemHidden;

      if (!includeInactive && !itemIsActive) continue;

      const isAvailable =
        overrideItem?.isAvailable !== undefined
          ? overrideItem.isAvailable
          : true;

      if (!includeUnavailable && isAvailable === false) continue;

      const price =
        overrideItem?.price != null ? overrideItem.price : orgItem.defaultPrice;

      const photoUrl = orgItem.photoUrl || "";
      const tags = orgItem.tags || [];

      const itemOrder =
        overrideItem?.order !== undefined ? overrideItem.order : orgItem.order || 0;

      // ✅ NEW: org item modifierGroupIds (modelde yoksa [])
      const modifierGroupIds = asIdList(orgItem.modifierGroupIds);
      for (const mid of modifierGroupIds) usedModifierGroupIds.add(mid);

      resolvedItems.push({
        _id: orgItem._id,
        itemId: orgItem._id,
        orgItemId: orgItem._id,
        restaurantId: restaurant._id,
        categoryId: resolvedCategoryId,

        title: orgItem.title,
        description: orgItem.description || "",
        price,
        photoUrl,
        tags,
        order: itemOrder,
        isActive: itemIsActive,
        isAvailable,
        source: overrideItem ? "org_branch_override" : "org",

        // ✅ NEW
        modifierGroupIds,
      });
    }

    resolvedItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    resolvedCategory.items = resolvedItems;
    resolvedCategories.push(resolvedCategory);
  }

  // ---- 2) Local-only kategoriler ----
  for (const localCat of localCategories) {
    const catIsActive = localCat.isActive !== false;
    if (!includeInactive && !catIsActive) continue;

    const localCatIdStr = String(localCat._id);

    const localResolvedCategory = {
      _id: localCat._id,
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
      .map((it) => {
        const modifierGroupIds = asIdList(it.modifierGroupIds);
        for (const mid of modifierGroupIds) usedModifierGroupIds.add(mid);

        return {
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

          // ✅ NEW
          modifierGroupIds,
        };
      });

    resolvedLocalItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    localResolvedCategory.items = resolvedLocalItems;

    resolvedCategories.push(localResolvedCategory);
  }

  // Kategori sıralaması
  resolvedCategories.sort((a, b) => (a.order || 0) - (b.order || 0));

  // ✅ OPTIONAL populate: modifierGroups
  if (includeModifierGroups && usedModifierGroupIds.size) {
    const ids = Array.from(usedModifierGroupIds);

    const q = {
      _id: { $in: ids },
      restaurantId: restaurant._id,
    };
    if (!includeInactive) q.isActive = true;

    const groups = await ModifierGroup.find(q)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const groupMap = new Map(groups.map((g) => [String(g._id), g]));

    for (const cat of resolvedCategories) {
      for (const item of cat.items || []) {
        const mids = asIdList(item.modifierGroupIds);
        const populated = [];

        for (const mid of mids) {
          const g = groupMap.get(String(mid));
          if (!g) continue;

          const options = Array.isArray(g.options) ? g.options : [];
          const filteredOptions = includeInactive
            ? options
            : options.filter((o) => o.isActive !== false);

          populated.push({
            _id: g._id,
            title: g.title,
            description: g.description || "",
            minSelect: Number(g.minSelect ?? 0),
            maxSelect: Number(g.maxSelect ?? 1),
            order: Number(g.order ?? 0),
            isActive: g.isActive !== false,
            options: filteredOptions
              .slice()
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((o) => ({
                _id: o._id,
                title: o.title,
                price: Number(o.price ?? 0),
                order: Number(o.order ?? 0),
                isActive: o.isActive !== false,
              })),
          });
        }

        item.modifierGroups = populated;
      }
    }
  }

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
  const includeModifierGroups = opts?.includeModifierGroups === true;

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

  const usedModifierGroupIds = new Set();

  const resolvedCategories = categories.map((c) => {
    const key = String(c._id);
    const catItems = itemsByCategoryId.get(key) || [];
    catItems.sort((a, b) => (a.order || 0) - (b.order || 0));

    return {
      _id: c._id,
      categoryId: c._id,
      orgCategoryId: null,
      restaurantId: c.restaurantId,
      title: c.title,
      description: c.description || "",
      order: c.order || 0,
      isActive: c.isActive !== false,
      source: "local",
      items: catItems.map((it) => {
        const modifierGroupIds = asIdList(it.modifierGroupIds);
        for (const mid of modifierGroupIds) usedModifierGroupIds.add(mid);

        return {
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

          // ✅ NEW
          modifierGroupIds,
        };
      }),
    };
  });

  // ✅ OPTIONAL populate: modifierGroups (local-only)
  if (includeModifierGroups && usedModifierGroupIds.size) {
    const ids = Array.from(usedModifierGroupIds);

    const q = { _id: { $in: ids }, restaurantId };
    if (!includeInactive) q.isActive = true;

    const groups = await ModifierGroup.find(q).sort({ order: 1, createdAt: 1 }).lean();
    const groupMap = new Map(groups.map((g) => [String(g._id), g]));

    for (const cat of resolvedCategories) {
      for (const item of cat.items || []) {
        const mids = asIdList(item.modifierGroupIds);
        const populated = [];

        for (const mid of mids) {
          const g = groupMap.get(String(mid));
          if (!g) continue;

          const options = Array.isArray(g.options) ? g.options : [];
          const filteredOptions = includeInactive
            ? options
            : options.filter((o) => o.isActive !== false);

          populated.push({
            _id: g._id,
            title: g.title,
            description: g.description || "",
            minSelect: Number(g.minSelect ?? 0),
            maxSelect: Number(g.maxSelect ?? 1),
            order: Number(g.order ?? 0),
            isActive: g.isActive !== false,
            options: filteredOptions
              .slice()
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((o) => ({
                _id: o._id,
                title: o.title,
                price: Number(o.price ?? 0),
                order: Number(o.order ?? 0),
                isActive: o.isActive !== false,
              })),
          });
        }

        item.modifierGroups = populated;
      }
    }
  }

  return {
    restaurantId,
    organizationId: null,
    categories: resolvedCategories,
  };
}