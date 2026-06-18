// src/controllers/adminMarket.controller.js
import mongoose from "mongoose";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketOrder from "../models/MarketOrder.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";

const STORE_UPDATE_FIELDS = [
  "name", "description", "category", "address", "city", "isActive",
  "commissionRate", "deliveryZoneKm", "minOrderAmount", "deliveryFee",
  "freeDeliveryThreshold", "pickupEnabled", "logo",
];

const toObjectId = (id) => {
  const v = String(id || "").trim();
  return mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null;
};

export const listStores = async (req, res, next) => {
  try {
    const { q, city, organization, isActive } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    if (q && String(q).trim()) filter.name = { $regex: String(q).trim(), $options: "i" };
    if (city) filter.city = city;
    if (organization) filter.organization = toObjectId(organization);
    if (isActive === "true") filter.isActive = true;
    else if (isActive === "false") filter.isActive = false;
    const [items, total] = await Promise.all([
      MarketStore.find(filter)
        .select("_id name city category isActive organization rating totalOrders")
        .populate("organization", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MarketStore.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (e) {
    next(e);
  }
};

export const getStore = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return next({ status: 400, message: "Geçersiz market id" });
    const store = await MarketStore.findById(id)
      .populate("organization", "name region")
      .lean();
    if (!store) return next({ status: 404, message: "Market bulunamadı" });
    const [productCount, orderAgg] = await Promise.all([
      MarketProduct.countDocuments({ store: id }),
      MarketOrder.aggregate([
        { $match: { store: id } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            delivered: {
              $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
            },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "delivered"] },
                  { $ifNull: ["$total", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);
    const summary = orderAgg[0] || { total: 0, delivered: 0, revenue: 0 };
    res.json({ store, stats: { productCount, orders: summary } });
  } catch (e) {
    next(e);
  }
};

export const searchProducts = async (req, res, next) => {
  try {
    const { q, storeId } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    if (storeId) filter.store = toObjectId(storeId);
    if (q && String(q).trim()) filter.title = { $regex: String(q).trim(), $options: "i" };
    const [items, total] = await Promise.all([
      MarketProduct.find(filter)
        .select("_id title barcode store")
        .populate("store", "name")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MarketProduct.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  } catch (e) {
    next(e);
  }
};

// PATCH /admin/market/stores/:id
export const updateStore = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return next({ status: 400, message: "Geçersiz market id" });
    const set = {};
    for (const k of STORE_UPDATE_FIELDS) {
      if (req.body[k] !== undefined) set[k] = req.body[k];
    }
    if (req.body.organization !== undefined) {
      set.organization = req.body.organization ? toObjectId(req.body.organization) : null;
      if (req.body.organization && !set.organization) {
        return next({ status: 400, message: "Geçersiz organizasyon id" });
      }
      if (set.organization) {
        const exists = await Organization.exists({ _id: set.organization });
        if (!exists) return next({ status: 404, message: "Organizasyon bulunamadı" });
      }
    }
    const store = await MarketStore.findByIdAndUpdate(id, { $set: set }, { new: true })
      .populate("organization", "name").lean();
    if (!store) return next({ status: 404, message: "Market bulunamadı" });
    res.json({ store });
  } catch (e) { next(e); }
};

// POST /admin/market/stores
// body: { store:{...}, owner:{name,email,password} | {existingOwnerId}, organization?, organizationName? }
export const createStore = async (req, res, next) => {
  try {
    const { store = {}, owner = {}, organization, organizationName } = req.body;
    if (!store.name || !store.category) {
      return next({ status: 400, message: "Market adı ve kategori zorunlu" });
    }
    // 1) owner: existing or new
    let ownerId = owner.existingOwnerId ? toObjectId(owner.existingOwnerId) : null;
    if (!ownerId) {
      if (!owner.name || !owner.email || !owner.password) {
        return next({ status: 400, message: "Yeni sahip için ad, e-posta ve şifre gerekli" });
      }
      const dup = await User.findOne({ email: owner.email }).lean();
      if (dup) return next({ status: 409, message: "Bu e-posta zaten kayıtlı" });
      const u = new User({
        name: owner.name, email: owner.email, password: owner.password,
        role: "market_owner",
        providers: [{ name: "password", sub: owner.email }],
      });
      await u.save();
      ownerId = u._id;
    }
    // 2) organization: attach existing or create new chain
    let orgId = organization ? toObjectId(organization) : null;
    if (!orgId && organizationName && String(organizationName).trim()) {
      const org = await Organization.create({ name: String(organizationName).trim() });
      orgId = org._id;
    }
    if (organization && !orgId) return next({ status: 400, message: "Geçersiz organizasyon id" });
    // 3) create store
    const allowed = {};
    for (const k of STORE_UPDATE_FIELDS) if (store[k] !== undefined) allowed[k] = store[k];
    if (store.location) allowed.location = store.location;
    const created = await MarketStore.create({ ...allowed, owner: ownerId, organization: orgId });
    res.status(201).json({ store: created });
  } catch (e) { next(e); }
};
