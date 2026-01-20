import mongoose from "mongoose";
import MenuCategory from "../models/MenuCategory.js";
import MenuItem from "../models/MenuItem.js";
import Restaurant from "../models/Restaurant.js";
import MenuCategorySet from "../models/MenuCategory.js";
import {
  createCategorySchema,
  updateCategorySchema,
  createItemSchema,
  updateItemSchema,
  listItemsQuerySchema,
} from "../validators/menu.schema.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import CoreCategory from "../models/CoreCategory.js";
import { getResolvedMenuForRestaurant } from "../services/menuResolve.service.js";

// ✅ Org menü modelleri
import OrgMenuCategory from "../models/OrgMenuCategory.js";
import OrgMenuItem from "../models/OrgMenuItem.js";
import ModifierGroup from "../models/ModifierGroup.js";

/* ---------------- helpers ---------------- */
function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}
async function attachModifierGroupsToMenu(menu, rid) {
  const m = menu && typeof menu === "object" ? menu : { categories: [] };

  // collect all modifierGroupIds from resolved categories/items
  const ids = new Set();

  for (const cat of m.categories || []) {
    for (const it of cat.items || []) {
      const arr = Array.isArray(it?.modifierGroupIds) ? it.modifierGroupIds : [];
      for (const x of arr) {
        const s = String(x || "").trim();
        if (mongoose.Types.ObjectId.isValid(s)) ids.add(s);
      }
    }
  }

  if (ids.size === 0) {
    return { ...m, modifierGroups: [] };
  }

  const docs = await ModifierGroup.find({
    _id: { $in: Array.from(ids) },
    restaurantId: rid,
    isActive: true,
  })
    .select("_id title description minSelect maxSelect order isActive options")
    .lean();

  const modifierGroups = (docs || [])
    .map((g) => ({
      _id: String(g._id),
      title: String(g.title || ""),
      description: g.description ?? null,
      minSelect: Number(g.minSelect ?? 0) || 0,
      maxSelect: Number(g.maxSelect ?? 1) || 1,
      order: Number(g.order ?? 0) || 0,
      isActive: Boolean(g.isActive ?? true),
      options: Array.isArray(g.options)
        ? g.options
            .filter((o) => (o?.isActive ?? true) !== false)
            .map((o) => ({
              _id: String(o._id || ""),
              title: String(o.title || ""),
              price: Number(o.price ?? 0) || 0,
              order: Number(o.order ?? 0) || 0,
              isActive: Boolean(o.isActive ?? true),
            }))
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        : [],
    }))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  return { ...m, modifierGroups };
}
/**
 * ✅ Ortalama harcama tabanı (avgSpendBase)
 * Artık **resolved menü** üzerinden hesaplanıyor:
 *  - Org menü + override + lokal item'lar
 *  - Org'suz restoranlarda klasik local menü
 */
export async function computeAvgSpendBaseForRestaurant(restaurantId) {
  const rid = toObjectId(restaurantId);
  if (!rid) return 0;

  // Tek kapı: org'lu ise org+override+local, değilse sadece local menü
  const resolved = await getResolvedMenuForRestaurant(rid.toString());

  const prices = [];

  for (const cat of resolved?.categories || []) {
    // Kategori pasifse komple atla (resolved zaten isActive taşıyor)
    if (cat.isActive === false) continue;

    for (const item of cat.items || []) {
      // Item aktif ve available mı?
      if (item.isActive === false) continue;
      if (item.isAvailable === false) continue;

      const p = Number(item.price);
      if (!Number.isFinite(p) || p <= 0) continue;

      prices.push(p);
    }
  }

  if (!prices.length) return 0;

  // Aynı eski mantık: trimmed average (uç değerleri kırparak)
  prices.sort((a, b) => a - b);

  const n = prices.length;
  const trimPercent = 10; // 🔒 HARDCODE – eskisiyle birebir
  const trimCount = Math.floor((n * trimPercent) / 100);

  let trimmed = prices;

  // kırpınca elde en az 3 veri kalıyorsa uygula
  if (n - 2 * trimCount >= 3) {
    trimmed = prices.slice(trimCount, n - trimCount);
  }

  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

  return Number.isFinite(avg) ? Math.round(avg) : 0;
}

/* ---------------- CATEGORY CRUD (panel) ---------------- */

/** GET /api/panel/restaurants/:rid/menu/categories?includeInactive=true */
export const listCategories = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }

    const includeInactive = String(req.query.includeInactive || "") === "true";

    const q = { restaurantId: rid };
    if (!includeInactive) q.isActive = true;

    const items = await MenuCategory.find(q)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/** POST /api/panel/restaurants/:rid/menu/categories */
export const createCategory = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid))
      return res.status(400).json({ message: "Invalid restaurant id" });

    const { error, value } = createCategorySchema.validate(req.body || {}, {
      abortEarly: true,
    });
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const { title, description = "", order = 0 } = value;

    const rest = await Restaurant.findById(rid)
      .select("_id owner organizationId")
      .lean();
    if (!rest)
      return res.status(404).json({ message: "Restaurant not found" });

    // ✅ Artık orgCategoryId ile override yaratmak yok.
    const doc = await MenuCategory.create({
      restaurantId: rid,
      orgCategoryId: null,
      title: String(title).trim(),
      description: String(description || "").trim(),
      order: Number(order) || 0,
      isActive: true,
    });

    res.status(201).json({ ok: true, category: doc });
  } catch (e) {
    next(e);
  }
};

/** PATCH /api/panel/restaurants/:rid/menu/categories/:cid */
export const updateCategory = async (req, res, next) => {
  try {
    const { rid, cid } = req.params;
    if (!isValidId(rid) || !isValidId(cid))
      return res.status(400).json({ message: "Invalid id" });

    const { error, value } = updateCategorySchema.validate(req.body || {}, {
      abortEarly: true,
    });
    if (error)
      return res
        .status(400)
        .json({ message: error.details[0].message });

    const { title, description, order, isActive } = value;

    // 🔍 Önce mevcut kategoriyi çekelim, override mı local mi görelim
    const existing = await MenuCategory.findOne({
      _id: cid,
      restaurantId: rid,
    }).lean();

    if (!existing)
      return res.status(404).json({ message: "Category not found" });

    const isOverride = !!existing.orgCategoryId;

    // Local kategori ise eski davranış: tüm alanlar güncellenebilir
    if (!isOverride) {
      const patch = {};

      if (title != null) patch.title = String(title).trim();
      if (description != null)
        patch.description = String(description).trim();
      if (order != null) patch.order = Number(order) || 0;
      if (isActive != null) patch.isActive = !!isActive;

      const doc = await MenuCategory.findByIdAndUpdate(
        existing._id,
        { $set: patch },
        { new: true }
      ).lean();

      return res.json({ ok: true, category: doc });
    }

    // ✅ Org override kategorilerde: Sadece order / isActive (+ opsiyonel description) override
    const overridePatch = {};

    if (order != null) overridePatch.order = Number(order) || 0;
    if (isActive != null) overridePatch.isActive = !!isActive;
    if (description != null)
      overridePatch.description = String(description).trim();

    // title override etmiyoruz; başlık OrgMenuCategory'den geliyor
    const doc = await MenuCategory.findByIdAndUpdate(
      existing._id,
      { $set: overridePatch },
      { new: true }
    ).lean();

    return res.json({ ok: true, category: doc });
  } catch (e) {
    next(e);
  }
};

/** DELETE /api/panel/restaurants/:rid/menu/categories/:cid (soft delete) */
export const deleteCategory = async (req, res, next) => {
  try {
    const { rid, cid } = req.params;
    if (!isValidId(rid) || !isValidId(cid))
      return res.status(400).json({ message: "Invalid id" });

    const doc = await MenuCategory.findOneAndUpdate(
      { _id: cid, restaurantId: rid },
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Category not found" });

    await MenuItem.updateMany(
      { restaurantId: rid, categoryId: cid },
      { $set: { isActive: false } }
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/* ---------------- ITEM CRUD (panel) ---------------- */

/** GET /api/panel/restaurants/:rid/menu/items?categoryId= */
export const listItems = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid))
      return res.status(400).json({ message: "Invalid restaurant id" });

    const {
      error: qErr,
      value: qVal,
    } = listItemsQuerySchema.validate(req.query || {}, {
      abortEarly: true,
    });
    if (qErr)
      return res
        .status(400)
        .json({ message: qErr.details[0].message });
    const { categoryId } = qVal;
    const includeInactive = String(req.query.includeInactive || "") === "true";

    const q = { restaurantId: rid };
    if (categoryId && isValidId(categoryId)) q.categoryId = categoryId;

    // default: sadece aktif
    if (!includeInactive) q.isActive = true;

    const items = await MenuItem.find(q)
      .sort({ order: 1, createdAt: 1 })
      .lean();
    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/** POST /api/panel/restaurants/:rid/menu/items  (multipart/form-data) */
export const createItem = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid))
      return res.status(400).json({ message: "Invalid restaurant id" });

    const { error: iErr, value: iVal } = createItemSchema.validate(req.body || {}, {
      abortEarly: true,
    });
    if (iErr) return res.status(400).json({ message: iErr.details[0].message });

    const {
      categoryId,
      title,
      description = "",
      price,
      tags = [],
      order = 0,
      isAvailable = true,
      modifierGroupIds = [],
    } = iVal;

    const cat = await MenuCategory.findOne({
      _id: categoryId,
      restaurantId: rid,
      isActive: true,
    }).lean();
    if (!cat) return res.status(404).json({ message: "Category not found" });

    let photoUrl = "";
    const f =
      req.file ||
      (Array.isArray(req.files) && req.files[0]) ||
      (req.files?.file && req.files.file[0]) ||
      (req.files?.photo && req.files.photo[0]);

    if (f?.buffer) {
      const up = await uploadBufferToCloudinary(f.buffer, {
        folder: process.env.CLOUDINARY_FOLDER || "rezvix/menu",
        resource_type: "auto",
      });
      photoUrl = up.secure_url;
    }
    // modifierGroupIds doğrulama: hepsi bu restoranın mı?
let mgIds = Array.isArray(modifierGroupIds) ? modifierGroupIds : [];
mgIds = mgIds.map(String).filter((x) => mongoose.Types.ObjectId.isValid(x));

if (mgIds.length) {
  const cnt = await ModifierGroup.countDocuments({
    _id: { $in: mgIds },
    restaurantId: rid,
    isActive: true,
  });
  if (cnt !== mgIds.length) {
    return res.status(400).json({ message: "Seçilen opsiyon gruplarından bazıları geçersiz." });
  }
}
    const doc = await MenuItem.create({
      restaurantId: rid,
      categoryId,
      orgItemId: null, // ✅ artık override yok
      title: String(title).trim(),
      description: String(description || "").trim(),
      price: Number(price),
      photoUrl,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      order: Number(order) || 0,
      isAvailable: !!isAvailable,
      isActive: true,
      modifierGroupIds: mgIds,
    });

    res.status(201).json({ ok: true, item: doc });
  } catch (e) {
    next(e);
  }
};
/** PATCH /api/panel/restaurants/:rid/menu/items/:iid */
export const updateItem = async (req, res, next) => {
  try {
    const { rid, iid } = req.params;
    if (!isValidId(rid) || !isValidId(iid))
      return res.status(400).json({ message: "Invalid id" });

    const {
      error: uErr,
      value: uVal,
    } = updateItemSchema.validate(req.body || {}, { abortEarly: true });
    if (uErr)
      return res.status(400).json({ message: uErr.details[0].message });

    const {
      categoryId,
      title,
      description,
      price,
      tags,
      order,
      isAvailable,
      isActive,
      removePhoto,
      modifierGroupIds
    } = uVal;

    // 🔍 Önce mevcut item’ı çekelim; org override mı local mi görelim
    const existing = await MenuItem.findOne({
      _id: iid,
      restaurantId: rid,
    }).lean();

    if (!existing)
      return res.status(404).json({ message: "Item not found" });

    const isOverride = !!existing.orgItemId;

    const patch = {};

    // Category değişikliği: Sadece local item’larda izin veriyoruz
    if (categoryId != null && !isOverride) {
      const cat = await MenuCategory.findOne({
        _id: categoryId,
        restaurantId: rid,
        isActive: true,
      }).lean();
      if (!cat)
        return res.status(404).json({ message: "Category not found" });
      patch.categoryId = categoryId;
    }

    // Local item için title/description güncellenebilir
    if (!isOverride) {
      if (title != null) patch.title = String(title).trim();
      if (description != null)
        patch.description = String(description).trim();
    }

    if (price != null) patch.price = Number(price);
    if (tags != null)
      patch.tags = Array.isArray(tags) ? tags.map(String) : [];
    if (order != null) patch.order = Number(order) || 0;
    if (isAvailable != null) patch.isAvailable = !!isAvailable;
    if (isActive != null) patch.isActive = !!isActive;

    // Fotoğraf upload / silme (local + override için geçerli)
    if (removePhoto === "true" || removePhoto === true) {
      patch.photoUrl = "";
    } else {
      const f =
        req.file ||
        (Array.isArray(req.files) && req.files[0]) ||
        (req.files?.file && req.files.file[0]) ||
        (req.files?.photo && req.files.photo[0]);

      if (f?.buffer) {
        const up = await uploadBufferToCloudinary(f.buffer, {
          folder: process.env.CLOUDINARY_FOLDER || "rezvix/menu",
          resource_type: "auto",
        });
        patch.photoUrl = up.secure_url;
      }
      if (modifierGroupIds != null) {
  let mgIds = Array.isArray(modifierGroupIds) ? modifierGroupIds : [];
  mgIds = mgIds.map(String).filter((x) => mongoose.Types.ObjectId.isValid(x));

  if (mgIds.length) {
    const cnt = await ModifierGroup.countDocuments({
      _id: { $in: mgIds },
      restaurantId: rid,
      isActive: true,
    });
    if (cnt !== mgIds.length) {
      return res.status(400).json({
        message: "Seçilen opsiyon gruplarından bazıları geçersiz.",
      });
    }
  }
  patch.modifierGroupIds = mgIds;
}
    }

    // ✅ Org override item’larda sadece belirli alanları uygula
    let patchToApply = patch;
    if (isOverride) {
      const overridePatch = {};
      if (Object.prototype.hasOwnProperty.call(patch, "price")) {
        overridePatch.price = patch.price;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "tags")) {
        overridePatch.tags = patch.tags;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "order")) {
        overridePatch.order = patch.order;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "isAvailable")) {
        overridePatch.isAvailable = patch.isAvailable;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "isActive")) {
        overridePatch.isActive = patch.isActive;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "photoUrl")) {
        overridePatch.photoUrl = patch.photoUrl;
      }
      // title / description / categoryId override ETMİYORUZ
      patchToApply = overridePatch;
    }

    const doc = await MenuItem.findByIdAndUpdate(
      existing._id,
      { $set: patchToApply },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Item not found" });
    res.json({ ok: true, item: doc });
  } catch (e) {
    next(e);
  }
};

/** DELETE /api/panel/restaurants/:rid/menu/items/:iid (soft) */
export const deleteItem = async (req, res, next) => {
  try {
    const { rid, iid } = req.params;
    if (!isValidId(rid) || !isValidId(iid))
      return res.status(400).json({ message: "Invalid id" });

    const doc = await MenuItem.findOneAndUpdate(
      { _id: iid, restaurantId: rid },
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Item not found" });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/* ---------------- RESOLVED MENU READ (panel / müşteri için temel kapı) ---------------- */

/**
 * GET /api/panel/restaurants/:rid/menu/resolved?includeInactive=true&includeUnavailable=true
 * - Org + override + lokal item’lar merge edilmiş menüyü döner
 * - Hem restoran panelindeki menü preview, hem de istersen QR / müşteri tarafı için
 *   kullanılabilecek tek kapı endpoint.
 */
export const getResolvedMenuForPanel = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }


    const includeInactive = String(req.query.includeInactive || "") === "true";
    const includeUnavailable = String(req.query.includeUnavailable || "") === "true";

    const menu = await getResolvedMenuForRestaurant(String(rid), {
      includeInactive,
      includeUnavailable,
    });
    // service ne döndürüyorsa aynen passthrough:
    // { categories: [...], organizationId, restaurantId, ... }
    res.json(menu || { categories: [] });
  } catch (e) {
    next(e);
  }
};
// public
export const getResolvedMenuForPublic = async (req, res, next) => {
  try {
    const { rid } = req.params;

    if (!mongoose.Types.ObjectId.isValid(String(rid || ""))) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }

    const menu = await getResolvedMenuForRestaurant(rid, {
      includeInactive: false,
      includeUnavailable: false,
    });

    const withMods = await attachModifierGroupsToMenu(menu, rid);
    return res.json(withMods);
  } catch (e) {
    next(e);
  }
};