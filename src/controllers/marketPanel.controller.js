// src/controllers/marketPanel.controller.js
import mongoose from "mongoose";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketOrder from "../models/MarketOrder.js";
import { notifyUser } from "../services/notification.service.js";

const toObjectId = (id) => {
  try {
    const v = String(id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(v)) return null;
    return new mongoose.Types.ObjectId(v);
  } catch {
    return null;
  }
};

/** Kullanıcının sahip olduğu market store'u bul */
const findOwnerStore = async (userId) => {
  const oid = toObjectId(userId);
  if (!oid) return null;
  return MarketStore.findOne({ owner: oid }).lean();
};

// ---------------------------------------------------------------------------
// SİPARİŞ YÖNETİMİ
// ---------------------------------------------------------------------------

/**
 * GET /api/market/panel/orders
 * Query: status, page, limit
 */
export const listPanelOrders = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const store = await findOwnerStore(userId);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    const { status, page = 1, limit = 30 } = req.query;
    const filter = { store: store._id };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const lim = Number(limit);

    const [items, total] = await Promise.all([
      MarketOrder.find(filter)
        .populate({ path: "customer", select: "name email" })
        .populate({ path: "deliveryAddress" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      MarketOrder.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), limit: lim });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/market/panel/orders/:id/status
 * Body: { status }
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { status, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz sipariş id" });
    }

    const validStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "delivered",
      "cancelled",
    ];
    if (!status || !validStatuses.includes(status)) {
      return next({ status: 400, message: `Geçersiz status. Olası değerler: ${validStatuses.join(", ")}` });
    }

    const store = await findOwnerStore(userId);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    const order = await MarketOrder.findOne({ _id: id, store: store._id });
    if (!order) return next({ status: 404, message: "Sipariş bulunamadı" });

    order.status = status;
    if (status === "delivered") order.deliveredAt = new Date();
    if (status === "cancelled") {
      const VALID_REASONS = ["out_of_stock", "closed", "out_of_zone", "cannot_fulfill", "other"];
      order.cancelReason = VALID_REASONS.includes(reason) ? reason : "other";
      order.cancelledBy = "store";
    }
    await order.save();

    // Push notification — best-effort (müşteriyi bilgilendir)
    const STATUS_NOTIF_KEY = {
      confirmed: "market_order_confirmed",
      preparing: "market_order_preparing",
      ready:     "market_order_ready",
      delivered: "market_order_delivered",
      cancelled: "market_order_cancelled_by_store",
    };

    const REASON_TEXT = {
      out_of_stock: "Ürün stokta yok",
      closed: "İşletme şu an kapalı",
      out_of_zone: "Adres teslimat bölgesi dışında",
      cannot_fulfill: "Sipariş karşılanamıyor",
      other: "Diğer",
    };

    let notifKey = STATUS_NOTIF_KEY[status];
    if (status === "ready" && order.type === "delivery") {
      notifKey = "market_order_on_the_way";
    }

    if (notifKey && order.customer) {
      notifyUser(String(order.customer), {
        type: "market_order_status",
        key: `market_order_${order._id}_${status}`,
        i18n: {
          key: notifKey,
          vars: { storeName: store.name, reason: REASON_TEXT[order.cancelReason] ?? "" },
        },
        data: {
          screen: "MarketOrderDetail",
          orderId: String(order._id),
        },
        sound: "default",
      }).catch(() => {}); // best-effort — başarısız olsa da devam et
    }

    res.json({ ok: true, order });
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// STORE YÖNETİMİ
// ---------------------------------------------------------------------------

/**
 * GET /api/market/panel/store
 * Market sahibinin kendi store bilgisi
 */
export const getMyStore = async (req, res, next) => {
  try {
    const store = await findOwnerStore(req.user?.id);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });
    res.json(store);
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/market/panel/store
 * Market sahibi kendi store'unu günceller.
 * Güncellenebilir alanlar: name, description, address, city, location, workingHours,
 *   deliveryZoneKm, minOrderAmount, deliveryFee, freeDeliveryThreshold, photos
 * Değiştirilemeyen alanlar: owner, isActive, category, totalOrders, rating
 */
export const updateMyStore = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const oid = toObjectId(userId);
    if (!oid) return next({ status: 401, message: "Unauthorized" });

    // lean() kullanmadan gerçek document çek (save için)
    const store = await MarketStore.findOne({ owner: oid });
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    const ALLOWED = [
      "name",
      "description",
      "address",
      "city",
      "workingHours",
      "deliveryZoneKm",
      "minOrderAmount",
      "deliveryFee",
      "freeDeliveryThreshold",
      "photos",
      "gridSettings",
      "deliveryZones",
      "location",
    ];

    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) {
        // Sayısal alanlar için validasyon
        if (["deliveryZoneKm", "minOrderAmount", "deliveryFee"].includes(key)) {
          const num = Number(req.body[key]);
          if (isNaN(num) || num < 0) {
            return next({ status: 400, message: `${key} geçerli bir sayı olmalı` });
          }
          store[key] = num;
        } else if (key === "freeDeliveryThreshold") {
          if (req.body[key] === null) {
            store[key] = null;
          } else {
            const num = Number(req.body[key]);
            if (isNaN(num) || num < 0) {
              return next({ status: 400, message: "freeDeliveryThreshold geçerli bir sayı veya null olmalı" });
            }
            store[key] = num;
          }
        } else if (key === "photos") {
          if (!Array.isArray(req.body[key])) {
            return next({ status: 400, message: "photos bir dizi olmalı" });
          }
          store[key] = req.body[key];
        } else if (key === "gridSettings") {
          const gs = req.body[key];
          if (gs && typeof gs === "object") {
            if (gs.cellSizeMeters !== undefined) {
              const n = Number(gs.cellSizeMeters);
              if (!isNaN(n) && n >= 50) store.gridSettings.cellSizeMeters = n;
            }
            if (gs.radiusMeters !== undefined) {
              const n = Number(gs.radiusMeters);
              if (!isNaN(n) && n >= 200) store.gridSettings.radiusMeters = n;
            }
            if (gs.orientation === "flat" || gs.orientation === "pointy") {
              store.gridSettings.orientation = gs.orientation;
            }
          }
        } else if (key === "deliveryZones") {
          if (!Array.isArray(req.body[key])) {
            return next({ status: 400, message: "deliveryZones bir dizi olmalı" });
          }
          store.deliveryZones = req.body[key].map((z) => ({
            id: String(z.id),
            name: z.name ?? undefined,
            isActive: z.isActive !== false,
            minOrderAmount: Math.max(0, Number(z.minOrderAmount ?? 0)),
            feeAmount: Math.max(0, Number(z.feeAmount ?? 0)),
            freeDeliveryThreshold: z.freeDeliveryThreshold != null ? Number(z.freeDeliveryThreshold) : null,
          }));
        } else if (key === "location") {
          const loc = req.body[key];
          const lng = Number(loc?.coordinates?.[0]);
          const lat = Number(loc?.coordinates?.[1]);
          if (
            loc?.type !== "Point" ||
            !Number.isFinite(lng) || !Number.isFinite(lat) ||
            lng < -180 || lng > 180 || lat < -90 || lat > 90
          ) {
            return next({ status: 400, message: "location geçerli bir GeoJSON Point olmalı" });
          }
          store.location = { type: "Point", coordinates: [lng, lat] };
        } else {
          store[key] = req.body[key];
        }
      }
    }

    await store.save();
    res.json(store.toObject());
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------------------
// ÜRÜN YÖNETİMİ
// ---------------------------------------------------------------------------

/**
 * GET /api/market/panel/products
 * Query: category, isActive, page, limit
 */
export const listPanelProducts = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const store = await findOwnerStore(userId);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    const { category, isActive, page = 1, limit = 40 } = req.query;

    const filter = { store: store._id };
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      filter.category = toObjectId(category);
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === "true" || isActive === "1";
    }

    const skip = (Number(page) - 1) * Number(limit);
    const lim = Number(limit);

    const [items, total] = await Promise.all([
      MarketProduct.find(filter)
        .populate({ path: "category", select: "key i18n" })
        .sort({ title: 1 })
        .skip(skip)
        .limit(lim)
        .lean(),
      MarketProduct.countDocuments(filter),
    ]);

    res.json({ items, total, page: Number(page), limit: lim });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/market/panel/products
 * Body: { title, description, price, unit, stock, photos, category, barcode }
 */
export const createProduct = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const store = await findOwnerStore(userId);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    const { title, description, price, unit, stock, photos, category, barcode } =
      req.body || {};

    if (!title || typeof title !== "string" || !title.trim()) {
      return next({ status: 400, message: "title zorunlu" });
    }
    if (price == null || isNaN(Number(price)) || Number(price) < 0) {
      return next({ status: 400, message: "Geçerli bir price giriniz" });
    }
    if (category && !mongoose.Types.ObjectId.isValid(category)) {
      return next({ status: 400, message: "Geçersiz category id" });
    }

    const product = await MarketProduct.create({
      title: title.trim(),
      description: description || "",
      price: Number(price),
      unit: unit || "piece",
      stock: Number(stock ?? 0),
      photos: Array.isArray(photos) ? photos : [],
      category: category ? toObjectId(category) : undefined,
      store: store._id,
      barcode: barcode || null,
    });

    res.status(201).json(product);
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/market/panel/products/:id
 * Body: herhangi bir ürün alanı
 */
export const updateProduct = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz ürün id" });
    }

    const store = await findOwnerStore(userId);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    const product = await MarketProduct.findOne({ _id: id, store: store._id });
    if (!product) return next({ status: 404, message: "Ürün bulunamadı" });

    const allowed = [
      "title",
      "description",
      "price",
      "unit",
      "stock",
      "photos",
      "category",
      "isActive",
      "barcode",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "category") {
          if (!mongoose.Types.ObjectId.isValid(req.body[key])) {
            return next({ status: 400, message: "Geçersiz category id" });
          }
          product.category = toObjectId(req.body[key]);
        } else if (key === "price" || key === "stock") {
          const num = Number(req.body[key]);
          if (isNaN(num) || num < 0) {
            return next({ status: 400, message: `${key} geçerli bir sayı olmalı` });
          }
          product[key] = num;
        } else {
          product[key] = req.body[key];
        }
      }
    }

    await product.save();
    res.json(product);
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/market/panel/products/:id
 * Soft delete — isActive = false
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz ürün id" });
    }

    const store = await findOwnerStore(userId);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    const product = await MarketProduct.findOne({ _id: id, store: store._id });
    if (!product) return next({ status: 404, message: "Ürün bulunamadı" });

    product.isActive = false;
    await product.save();

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/market/panel/org/stores
 * Aynı organizasyona ait tüm aktif market şubelerini listeler.
 * market_owner kendi org'una ait store'ları görür.
 */
export const listOrgStores = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const store = await findOwnerStore(userId);
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    if (!store.organization) {
      return res.json({ stores: [] });
    }

    const stores = await MarketStore.find({
      organization: store.organization,
      isActive: true,
    })
      .select("_id name address city rating")
      .lean();

    return res.json({ stores });
  } catch (e) {
    next(e);
  }
};
