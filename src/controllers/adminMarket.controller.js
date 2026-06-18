// src/controllers/adminMarket.controller.js
import mongoose from "mongoose";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketOrder from "../models/MarketOrder.js";

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
