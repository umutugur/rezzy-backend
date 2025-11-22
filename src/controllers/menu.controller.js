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


/* ---------------- helpers ---------------- */
function toObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

/**
 * ✅ Ortalama harcama tabanı (avgSpendBase)
 * Sadece aktif + available ürünlerin fiyat ortalaması.
 * Rezervasyon create akışında FIX MENÜ yoksa buradan taban çekeceğiz.
 */
export async function computeAvgSpendBaseForRestaurant(restaurantId) {
  const rid = toObjectId(restaurantId);
  if (!rid) return 0;

  const docs = await MenuItem.find({
    restaurantId: rid,
    isActive: true,
    isAvailable: true,
    price: { $gt: 0 },
  })
    .select("price")
    .lean();

  if (!docs.length) return 0;

  const prices = docs
    .map(d => Number(d.price))
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const n = prices.length;
  const trimPercent = 10;                  // 🔒 HARDCODE
  const trimCount = Math.floor(n * trimPercent / 100);

  let trimmed = prices;

  // kırpınca elde en az 3 veri kalıyorsa uygula
  if (n - 2 * trimCount >= 3) {
    trimmed = prices.slice(trimCount, n - trimCount);
  }

  const avg =
    trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

  return Number.isFinite(avg) ? Math.round(avg) : 0;
}

/* ---------------- CATEGORY CRUD (panel) ---------------- */

/** GET /api/panel/restaurants/:rid/menu/categories */
export const listCategories = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) return res.status(400).json({ message: "Invalid restaurant id" });

    // 1) Önce mevcut kategorileri say
    const existingCount = await MenuCategory.countDocuments({
      restaurantId: rid,
      isActive: true,
    });

    // 2) Eğer hiç kategori yoksa ve restoran bir kategori setine bağlıysa, setten seed et
    if (existingCount === 0) {
  const rest = await Restaurant.findById(rid)
    .select("_id businessType preferredLanguage")
    .lean();

  const bt = rest?.businessType || "restaurant";

  // CoreCategory'den bu businessType'a uygun olanları çek
  const coreCats = await CoreCategory.find({
    isActive: true,
    businessTypes: bt,
  })
    .sort({ order: 1, createdAt: 1 })
    .lean();

  if (coreCats.length) {
    const lang = rest?.preferredLanguage || "tr";

    const seedDocs = coreCats.map((c) => ({
      restaurantId: rid,
      coreCategoryId: c._id,
      title: c.i18n?.[lang]?.title || c.i18n?.tr?.title || c.key,
      description: c.i18n?.[lang]?.description || c.i18n?.tr?.description || "",
      order: Number(c.order ?? 0) || 0,
      isActive: true,
    }));

    await MenuCategory.insertMany(seedDocs);
  }
}

    const items = await MenuCategory.find({
      restaurantId: rid,
      isActive: true,
    })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json({ items });
  } catch (e) { next(e); }
};

/** POST /api/panel/restaurants/:rid/menu/categories */
export const createCategory = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) return res.status(400).json({ message: "Invalid restaurant id" });

    const { error, value } = createCategorySchema.validate(req.body || {}, { abortEarly: true });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { title, description = "", order = 0 } = value;

    const rest = await Restaurant.findById(rid).select("_id owner").lean();
    if (!rest) return res.status(404).json({ message: "Restaurant not found" });

    const doc = await MenuCategory.create({
      restaurantId: rid,
      title: String(title).trim(),
      description: String(description || "").trim(),
      order: Number(order) || 0,
      isActive: true,
    });

    res.status(201).json({ ok: true, category: doc });
  } catch (e) { next(e); }
};

/** PATCH /api/panel/restaurants/:rid/menu/categories/:cid */
export const updateCategory = async (req, res, next) => {
  try {
    const { rid, cid } = req.params;
    if (!isValidId(rid) || !isValidId(cid))
      return res.status(400).json({ message: "Invalid id" });

    const { error, value } = updateCategorySchema.validate(req.body || {}, { abortEarly: true });
    if (error) return res.status(400).json({ message: error.details[0].message });

    const patch = {};
    const { title, description, order, isActive } = value;

    if (title != null) patch.title = String(title).trim();
    if (description != null) patch.description = String(description).trim();
    if (order != null) patch.order = Number(order) || 0;
    if (isActive != null) patch.isActive = !!isActive;

    const doc = await MenuCategory.findOneAndUpdate(
      { _id: cid, restaurantId: rid },
      { $set: patch },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Category not found" });
    res.json({ ok: true, category: doc });
  } catch (e) { next(e); }
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
  } catch (e) { next(e); }
};

/* ---------------- ITEM CRUD (panel) ---------------- */

/** GET /api/panel/restaurants/:rid/menu/items?categoryId= */
export const listItems = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) return res.status(400).json({ message: "Invalid restaurant id" });

    const { error: qErr, value: qVal } = listItemsQuerySchema.validate(req.query || {}, { abortEarly: true });
    if (qErr) return res.status(400).json({ message: qErr.details[0].message });
    const { categoryId } = qVal;

    const q = { restaurantId: rid, isActive: true };
    if (categoryId && isValidId(categoryId)) q.categoryId = categoryId;

    const items = await MenuItem.find(q)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json({ items });
  } catch (e) { next(e); }
};

/** POST /api/panel/restaurants/:rid/menu/items  (multipart/form-data) */
export const createItem = async (req, res, next) => {
  try {
    const { rid } = req.params;
    if (!isValidId(rid)) return res.status(400).json({ message: "Invalid restaurant id" });

    const { error: iErr, value: iVal } = createItemSchema.validate(req.body || {}, { abortEarly: true });
    if (iErr) return res.status(400).json({ message: iErr.details[0].message });

    const { categoryId, title, description = "", price, tags = [], order = 0, isAvailable = true } = iVal;

    const cat = await MenuCategory.findOne({ _id: categoryId, restaurantId: rid, isActive: true }).lean();
    if (!cat) return res.status(404).json({ message: "Category not found" });

    let photoUrl = "";
    const f =
      req.file ||
      (Array.isArray(req.files) && req.files[0]) ||
      (req.files?.file && req.files.file[0]) ||
      (req.files?.photo && req.files.photo[0]);

    if (f?.buffer) {
      const up = await uploadBufferToCloudinary(f.buffer, {
        folder: process.env.CLOUDINARY_FOLDER || "rezzy/menu",
        resource_type: "auto",
      });
      photoUrl = up.secure_url;
    }

    const doc = await MenuItem.create({
      restaurantId: rid,
      categoryId,
      title: String(title).trim(),
      description: String(description || "").trim(),
      price: Number(price),
      photoUrl,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      order: Number(order) || 0,
      isAvailable: !!isAvailable,
      isActive: true,
    });

    res.status(201).json({ ok: true, item: doc });
  } catch (e) { next(e); }
};

/** PATCH /api/panel/restaurants/:rid/menu/items/:iid */
export const updateItem = async (req, res, next) => {
  try {
    const { rid, iid } = req.params;
    if (!isValidId(rid) || !isValidId(iid))
      return res.status(400).json({ message: "Invalid id" });

    const { error: uErr, value: uVal } = updateItemSchema.validate(req.body || {}, { abortEarly: true });
    if (uErr) return res.status(400).json({ message: uErr.details[0].message });

    const patch = {};
    const {
      categoryId, title, description, price, tags, order,
      isAvailable, isActive, removePhoto
    } = uVal;

    if (categoryId != null) {
      const cat = await MenuCategory.findOne({ _id: categoryId, restaurantId: rid, isActive: true }).lean();
      if (!cat) return res.status(404).json({ message: "Category not found" });
      patch.categoryId = categoryId;
    }

    if (title != null) patch.title = String(title).trim();
    if (description != null) patch.description = String(description).trim();
    if (price != null) patch.price = Number(price);
    if (tags != null) patch.tags = Array.isArray(tags) ? tags.map(String) : [];
    if (order != null) patch.order = Number(order) || 0;
    if (isAvailable != null) patch.isAvailable = !!isAvailable;
    if (isActive != null) patch.isActive = !!isActive;

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
          folder: process.env.CLOUDINARY_FOLDER || "rezzy/menu",
          resource_type: "auto",
        });
        patch.photoUrl = up.secure_url;
      }
    }

    const doc = await MenuItem.findOneAndUpdate(
      { _id: iid, restaurantId: rid },
      { $set: patch },
      { new: true }
    ).lean();

    if (!doc) return res.status(404).json({ message: "Item not found" });
    res.json({ ok: true, item: doc });
  } catch (e) { next(e); }
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
  } catch (e) { next(e); }
};