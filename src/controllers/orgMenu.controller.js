// controllers/orgMenu.controller.js
import mongoose from "mongoose";
import Organization from "../models/Organization.js";
import OrgMenuCategory from "../models/OrgMenuCategory.js";
import OrgMenuItem from "../models/OrgMenuItem.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

/* ------------ helpers ------------ */

async function assertOrganization(oid) {
  const org = await Organization.findById(oid)
    .select("_id name region")
    .lean();
  if (!org) return null;
  return org;
}

/* ------------ GET: Org menü (kategori + item birlikte) ------------ */

export const getOrgMenu = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }

    const org = await assertOrganization(oid);
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const categories = await OrgMenuCategory.find({
      organizationId: oid,
    })
      .sort({ order: 1, _id: 1 })
      .lean();

    const items = await OrgMenuItem.find({
      organizationId: oid,
    })
      .sort({ order: 1, _id: 1 })
      .lean();

    const itemsByCat = new Map();
    for (const it of items) {
      const key = String(it.categoryId);
      if (!itemsByCat.has(key)) itemsByCat.set(key, []);
      itemsByCat.get(key).push(it);
    }

    const resultCategories = categories.map((c) => ({
      _id: c._id,
      title: c.title,
      description: c.description || null,
      order: c.order ?? 0,
      isActive: c.isActive,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      items: (itemsByCat.get(String(c._id)) || []).map((it) => ({
        _id: it._id,
        title: it.title,
        description: it.description || null,
        defaultPrice: it.defaultPrice,
        photoUrl: it.photoUrl || null,
        tags: it.tags || [],
        order: it.order ?? 0,
        isActive: it.isActive,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
    }));

    res.json({
      organization: {
        _id: org._id,
        name: org.name,
        region: org.region || null,
      },
      categories: resultCategories,
    });
  } catch (e) {
    next(e);
  }
};

/* ------------ CATEGORY: create / update / delete ------------ */

// POST /admin/organizations/:oid/menu/categories
export const createOrgCategory = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }

    const org = await assertOrganization(oid);
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    let { title, description, order, isActive } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "title is required" });
    }
    title = String(title).trim();

    if (order != null) order = Number(order);
    if (typeof isActive !== "boolean") {
      isActive = true;
    }

    const cat = await OrgMenuCategory.create({
      organizationId: org._id,
      title,
      description: description || undefined,
      order: order != null ? order : 0,
      isActive,
    });

    res.status(201).json({
      ok: true,
      category: {
        _id: cat._id,
        title: cat.title,
        description: cat.description || null,
        order: cat.order ?? 0,
        isActive: cat.isActive,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /admin/organizations/:oid/menu/categories/:cid
export const updateOrgCategory = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    const cid = toObjectId(req.params.cid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }
    if (!cid) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const cat = await OrgMenuCategory.findOne({ _id: cid, organizationId: oid });
    if (!cat) {
      return res.status(404).json({ message: "Category not found" });
    }

    let { title, description, order, isActive } = req.body || {};

    const patch = {};
    if (title != null && String(title).trim()) {
      patch.title = String(title).trim();
    }
    if (description !== undefined) {
      patch.description = description || undefined;
    }
    if (order != null) {
      const num = Number(order);
      if (!Number.isNaN(num)) patch.order = num;
    }
    if (typeof isActive === "boolean") {
      patch.isActive = isActive;
    }

    const updated = await OrgMenuCategory.findByIdAndUpdate(
      cid,
      { $set: patch },
      { new: true }
    ).lean();

    res.json({
      ok: true,
      category: {
        _id: updated._id,
        title: updated.title,
        description: updated.description || null,
        order: updated.order ?? 0,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

// DELETE /admin/organizations/:oid/menu/categories/:cid
// 🔔 Soft-delete: isActive=false yapıyoruz (hard delete yerine)
export const deleteOrgCategory = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    const cid = toObjectId(req.params.cid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }
    if (!cid) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const cat = await OrgMenuCategory.findOne({ _id: cid, organizationId: oid });
    if (!cat) {
      return res.status(404).json({ message: "Category not found" });
    }

    const updated = await OrgMenuCategory.findByIdAndUpdate(
      cid,
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    res.json({
      ok: true,
      category: {
        _id: updated._id,
        isActive: updated.isActive,
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ------------ ITEM: create / update / delete ------------ */

// POST /admin/organizations/:oid/menu/items
export const createOrgItem = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }

    const org = await assertOrganization(oid);
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    let {
      categoryId,
      title,
      description,
      defaultPrice,
      photoUrl,
      tags,
      order,
      isActive,
    } = req.body || {};

    const catId = toObjectId(categoryId);
    if (!catId) {
      return res.status(400).json({ message: "categoryId is required" });
    }

    const cat = await OrgMenuCategory.findOne({
      _id: catId,
      organizationId: oid,
    }).lean();
    if (!cat) {
      return res
        .status(400)
        .json({ message: "Category does not belong to this organization" });
    }

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "title is required" });
    }
    title = String(title).trim();

    if (defaultPrice == null) {
      return res.status(400).json({ message: "defaultPrice is required" });
    }
    defaultPrice = Number(defaultPrice);
    if (Number.isNaN(defaultPrice) || defaultPrice < 0) {
      return res.status(400).json({ message: "Invalid defaultPrice" });
    }

    if (order != null) order = Number(order);
    if (typeof isActive !== "boolean") {
      isActive = true;
    }
        // 🔽 Fotoğraf: önce body.photoUrl (string), varsa üstüne file upload override eder
    let finalPhotoUrl = photoUrl || undefined;

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
      finalPhotoUrl = up.secure_url;
    }
    const item = await OrgMenuItem.create({
      organizationId: org._id,
      categoryId: cat._id,
      title,
      description: description || undefined,
      defaultPrice,
      photoUrl: finalPhotoUrl,        
      tags: Array.isArray(tags) ? tags : [],
      order: order != null ? order : 0,
      isActive,
    });

    res.status(201).json({
      ok: true,
      item: {
        _id: item._id,
        categoryId: item.categoryId,
        title: item.title,
        description: item.description || null,
        defaultPrice: item.defaultPrice,
        photoUrl: item.photoUrl || null,
        tags: item.tags || [],
        order: item.order ?? 0,
        isActive: item.isActive,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

// PATCH /admin/organizations/:oid/menu/items/:iid
export const updateOrgItem = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    const iid = toObjectId(req.params.iid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }
    if (!iid) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const item = await OrgMenuItem.findOne({
      _id: iid,
      organizationId: oid,
    });
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    let {
      categoryId,
      title,
      description,
      defaultPrice,
      photoUrl,
      tags,
      order,
      isActive,
    } = req.body || {};

    const patch = {};

    if (categoryId) {
      const catId = toObjectId(categoryId);
      if (!catId) {
        return res.status(400).json({ message: "Invalid categoryId" });
      }
      const cat = await OrgMenuCategory.findOne({
        _id: catId,
        organizationId: oid,
      }).lean();
      if (!cat) {
        return res
          .status(400)
          .json({ message: "Category does not belong to this organization" });
      }
      patch.categoryId = cat._id;
    }

    if (title != null && String(title).trim()) {
      patch.title = String(title).trim();
    }

    if (description !== undefined) {
      patch.description = description || undefined;
    }

    if (defaultPrice != null) {
      const num = Number(defaultPrice);
      if (Number.isNaN(num) || num < 0) {
        return res.status(400).json({ message: "Invalid defaultPrice" });
      }
      patch.defaultPrice = num;
    }

    if (photoUrl !== undefined) {
      patch.photoUrl = photoUrl || undefined;
    }
        // 🔽 Fotoğraf güncelleme:
    // - Eğer yeni file geldiyse Cloudinary'ye yükle ve override et
    // - Eğer body.photoUrl boş string ise fotoğrafı temizle
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
    } else if (photoUrl === "" || photoUrl === null) {
      patch.photoUrl = undefined;
    }
    
    if (tags !== undefined) {
      patch.tags = Array.isArray(tags) ? tags : [];
    }

    if (order != null) {
      const num = Number(order);
      if (!Number.isNaN(num)) patch.order = num;
    }

    if (typeof isActive === "boolean") {
      patch.isActive = isActive;
    }

    const updated = await OrgMenuItem.findByIdAndUpdate(
      iid,
      { $set: patch },
      { new: true }
    ).lean();

    res.json({
      ok: true,
      item: {
        _id: updated._id,
        categoryId: updated.categoryId,
        title: updated.title,
        description: updated.description || null,
        defaultPrice: updated.defaultPrice,
        photoUrl: updated.photoUrl || null,
        tags: updated.tags || [],
        order: updated.order ?? 0,
        isActive: updated.isActive,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

// DELETE /admin/organizations/:oid/menu/items/:iid
// 🔔 Soft-delete: isActive=false
export const deleteOrgItem = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    const iid = toObjectId(req.params.iid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }
    if (!iid) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const item = await OrgMenuItem.findOne({
      _id: iid,
      organizationId: oid,
    });
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const updated = await OrgMenuItem.findByIdAndUpdate(
      iid,
      { $set: { isActive: false } },
      { new: true }
    ).lean();

    res.json({
      ok: true,
      item: {
        _id: updated._id,
        isActive: updated.isActive,
      },
    });
  } catch (e) {
    next(e);
  }
};