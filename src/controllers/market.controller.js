// src/controllers/market.controller.js
import mongoose from "mongoose";
import Stripe from "stripe";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketOrder from "../models/MarketOrder.js";
import UserAddress from "../models/UserAddress.js";
import CoreCategory from "../models/CoreCategory.js";
import { notifyUser } from "../services/notification.service.js";
import { resolveZoneForMarketStore } from "../utils/deliveryZoneResolver.js";
import { computeUnitPrice } from "../utils/marketUnitPrice.js";
import { effectivePrice, discountPercent, lowest30 } from "../utils/marketPricing.js";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

/** Yardımcı: string'i güvenli ObjectId'ye dönüştür */
const toObjectId = (id) => {
  try {
    const v = String(id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(v)) return null;
    return new mongoose.Types.ObjectId(v);
  } catch {
    return null;
  }
};

/**
 * GET /api/market/stores
 * Query: lat, lng, radius (km, default 10), category, page, limit
 */
export const listNearbyStores = async (req, res, next) => {
  try {
    const {
      lat,
      lng,
      radius = 10,
      category,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { isActive: true };

    if (category) filter.category = category;

    let stores;
    let total;

    const skip = (Number(page) - 1) * Number(limit);
    const lim = Number(limit);

    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      const radiusMeters = parseFloat(radius) * 1000;

      if (isNaN(latNum) || isNaN(lngNum) || isNaN(radiusMeters)) {
        return next({ status: 400, message: "Geçersiz konum parametresi" });
      }

      const geoFilter = {
        ...filter,
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [lngNum, latNum] },
            $maxDistance: radiusMeters,
          },
        },
      };

      // $near ile countDocuments çalışmaz; aggregate ile sayalım
      const [docs, countResult] = await Promise.all([
        MarketStore.find(geoFilter).skip(skip).limit(lim).lean(),
        MarketStore.aggregate([
          {
            $geoNear: {
              near: { type: "Point", coordinates: [lngNum, latNum] },
              distanceField: "dist",
              maxDistance: radiusMeters,
              spherical: true,
              query: filter,
            },
          },
          { $count: "total" },
        ]),
      ]);

      stores = docs;
      total = countResult[0]?.total ?? 0;
    } else {
      [stores, total] = await Promise.all([
        MarketStore.find(filter)
          .sort({ rating: -1, name: 1 })
          .skip(skip)
          .limit(lim)
          .lean(),
        MarketStore.countDocuments(filter),
      ]);
    }

    res.json({
      items: stores,
      total: Number(total),
      page: Number(page),
      limit: lim,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/market/stores/:id
 */
export const getStoreDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz market id" });
    }

    const store = await MarketStore.findOne({ _id: id, isActive: true }).lean();
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    res.json(store);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/market/products/:id
 * Public. Ürün + birim fiyat + ilgili ürünler (aynı mağaza/kategori, max 8).
 */
export const getProductDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz ürün id" });
    }

    const product = await MarketProduct.findOne({ _id: id, isActive: true })
      .populate("category")
      .lean();
    if (!product) return next({ status: 404, message: "Ürün bulunamadı" });

    const unitPrice = computeUnitPrice(product.price, product.netQuantity, product.netUnit);

    const categoryId = product.category?._id ?? product.category ?? null;
    let related = [];
    if (categoryId) {
      related = await MarketProduct.find({
        store: product.store,
        category: categoryId,
        isActive: true,
        _id: { $ne: product._id },
      })
        .limit(8)
        .lean();
    }
    if (related.length < 8) {
      const excludeIds = [product._id, ...related.map((r) => r._id)];
      const fill = await MarketProduct.find({
        store: product.store,
        isActive: true,
        _id: { $nin: excludeIds },
      })
        .limit(8 - related.length)
        .lean();
      related = related.concat(fill);
    }

    product.effectivePrice = effectivePrice(product);
    product.discountPercent = discountPercent(product);
    product.lowest30 = lowest30(product);
    delete product.priceHistory;

    const relatedOut = related.map((r) => {
      const out = { ...r, effectivePrice: effectivePrice(r), discountPercent: discountPercent(r) };
      delete out.priceHistory;
      return out;
    });

    res.json({ product: { ...product, unitPrice }, related: relatedOut });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/market/stores/:id/products
 * Query: category, page, limit
 */
export const listStoreProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, page = 1, limit = 40 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz market id" });
    }

    const filter = { store: toObjectId(id), isActive: true };
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      filter.category = toObjectId(category);
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

    const itemsOut = items.map((p) => {
      const out = { ...p, effectivePrice: effectivePrice(p), discountPercent: discountPercent(p) };
      delete out.priceHistory;
      return out;
    });
    res.json({ items: itemsOut, total, page: Number(page), limit: lim });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/market/orders
 * Body: { storeId, items:[{productId, qty}], type, deliveryAddressId, note, paymentMethod }
 */
export const createOrder = async (req, res, next) => {
  try {
    const {
      storeId,
      items,
      type = "delivery",
      deliveryAddressId,
      note = "",
      paymentMethod = "cash",
    } = req.body || {};

    const userId = req.user?.id;
    if (!userId) return next({ status: 401, message: "Unauthorized" });

    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      return next({ status: 400, message: "Geçersiz storeId" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return next({ status: 400, message: "items alanı zorunlu ve boş olamaz" });
    }
    if (!["pickup", "delivery"].includes(type)) {
      return next({ status: 400, message: "type pickup veya delivery olmalı" });
    }
    if (type === "delivery" && !deliveryAddressId) {
      return next({ status: 400, message: "Teslimat siparişi için deliveryAddressId gerekli" });
    }

    const store = await MarketStore.findOne({ _id: storeId, isActive: true }).lean();
    if (!store) return next({ status: 404, message: "Market bulunamadı" });

    if (type === "delivery" && deliveryAddressId) {
      if (!mongoose.Types.ObjectId.isValid(deliveryAddressId)) {
        return next({ status: 400, message: "Geçersiz deliveryAddressId" });
      }
      const addr = await UserAddress.findOne({
        _id: deliveryAddressId,
        userId,
        isActive: true,
      }).lean();
      if (!addr) return next({ status: 404, message: "Adres bulunamadı" });
    }

    // Ürün snapshot'larını topla
    const productIds = items.map((i) => i.productId).filter(Boolean);
    const products = await MarketProduct.find({
      _id: { $in: productIds },
      store: toObjectId(storeId),
      isActive: true,
    }).lean();

    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
        return next({ status: 400, message: `Geçersiz productId: ${item.productId}` });
      }
      const product = productMap.get(String(item.productId));
      if (!product) {
        return next({ status: 400, message: `Ürün bulunamadı: ${item.productId}` });
      }

      const qty = Number(item.qty);
      if (!qty || qty < 1) {
        return next({ status: 400, message: `Geçersiz adet: ${item.productId}` });
      }

      const lineTotal = +(product.price * qty).toFixed(2);
      subtotal += lineTotal;

      orderItems.push({
        productId: product._id,
        title: product.title,
        price: product.price,
        qty,
        unit: product.unit,
        lineTotal,
      });
    }

    subtotal = +subtotal.toFixed(2);

    // Teslimat ücreti: hex-zone varsa zone fiyatı, yoksa flat pricing
    let deliveryFee = 0;
    let effectiveMinOrder = store.minOrderAmount ?? 0;
    let effectiveFreeThreshold = store.freeDeliveryThreshold ?? null;

    if (type === "delivery") {
      // Adresin koordinatlarını al
      const addrDoc = await UserAddress.findById(deliveryAddressId).lean();
      const addrCoords = Array.isArray(addrDoc?.location?.coordinates)
        ? addrDoc.location.coordinates
        : null;

      if (addrCoords) {
        try {
          const zoneResult = await resolveZoneForMarketStore({
            storeId,
            customerLocation: addrCoords,
          });
          if (!zoneResult.ok) {
            return next({
              status: 400,
              message: zoneResult.reason === "ZONE_INACTIVE"
                ? "Bu adres teslimat bölgesi henüz aktif değil."
                : "Bu adres teslimat bölgesi dışında.",
            });
          }
          effectiveMinOrder = zoneResult.minOrderAmount;
          effectiveFreeThreshold = zoneResult.freeDeliveryThreshold;
          deliveryFee = effectiveFreeThreshold != null && subtotal >= effectiveFreeThreshold
            ? 0
            : zoneResult.feeAmount;
        } catch (zoneErr) {
          // Zone resolver hata fırlatırsa (store inactive vs.) onu ilet
          if (zoneErr?.status) return next(zoneErr);
          // Koordinat veya grid hatası → flat pricing'e dön
          deliveryFee = effectiveFreeThreshold != null && subtotal >= effectiveFreeThreshold
            ? 0
            : store.deliveryFee ?? 0;
        }
      } else {
        // Adresin koordinatı yoksa flat pricing
        deliveryFee = effectiveFreeThreshold != null && subtotal >= effectiveFreeThreshold
          ? 0
          : store.deliveryFee ?? 0;
      }
    }

    if (type === "delivery" && effectiveMinOrder > 0 && subtotal < effectiveMinOrder) {
      return next({
        status: 400,
        message: `Minimum sipariş tutarı ${effectiveMinOrder} TL`,
      });
    }

    const total = +(subtotal + deliveryFee).toFixed(2);

    const safePaymentMethod = ["cash", "card", "online"].includes(paymentMethod) ? paymentMethod : "cash";

    const order = await MarketOrder.create({
      customer: toObjectId(userId),
      store: toObjectId(storeId),
      items: orderItems,
      type,
      deliveryAddress: deliveryAddressId ? toObjectId(deliveryAddressId) : null,
      subtotal,
      deliveryFee,
      discount: 0,
      total,
      note,
      paymentMethod: safePaymentMethod,
      paymentStatus: safePaymentMethod === "online" ? "pending" : "pending",
    });

    // Toplam sipariş sayısını artır (best-effort)
    MarketStore.findByIdAndUpdate(storeId, { $inc: { totalOrders: 1 } }).catch(() => {});

    // ─── Online ödeme: Stripe PaymentIntent oluştur ──────────────────────────
    if (safePaymentMethod === "online") {
      if (!stripe) {
        // Stripe konfigüre değilse siparişi iptal et
        await MarketOrder.findByIdAndDelete(order._id);
        return next({ status: 500, message: "Stripe konfigüre değil. Online ödeme yapılamıyor." });
      }

      try {
        const pi = await stripe.paymentIntents.create({
          amount: Math.round(total * 100), // kuruş/cent cinsinden
          currency: "try",
          automatic_payment_methods: { enabled: true },
          metadata: {
            kind: "market_order",
            orderId: String(order._id),
            storeId: String(storeId),
            userId: String(userId),
          },
        });

        order.stripePaymentIntentId = pi.id;
        await order.save();

        // Market sahibine yeni sipariş bildirimi (best-effort)
        notifyUser(String(store.owner), {
          type: "market_new_order",
          key: `market_new_order_${order._id}`,
          i18n: {
            key: "market_new_order",
            vars: { total: total.toFixed(0) },
          },
          data: { screen: "MarketOrderDetail", orderId: String(order._id) },
          sound: "default",
        }).catch(() => {});

        return res.status(201).json({
          order,
          payment: {
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            amount: total,
            currency: "TRY",
          },
        });
      } catch (stripeErr) {
        console.error("[market.createOrder] Stripe error", stripeErr);
        // Stripe hatası durumunda siparişi iptal et
        await MarketOrder.findByIdAndDelete(order._id).catch(() => {});
        return next({ status: 500, message: "Ödeme sistemi başlatılamadı. Lütfen tekrar deneyin." });
      }
    }

    // ─── Nakit / Kart (kapıda) ───────────────────────────────────────────────
    // Market sahibine yeni sipariş bildirimi gönder (best-effort)
    notifyUser(String(store.owner), {
      type: "market_new_order",
      key: `market_new_order_${order._id}`,
      i18n: {
        key: "market_new_order",
        vars: { total: total.toFixed(0) },
      },
      data: { screen: "MarketOrderDetail", orderId: String(order._id) },
      sound: "default",
    }).catch(() => {});

    res.status(201).json({ order, payment: null });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/market/orders
 * Kullanıcının kendi siparişleri, sayfalı
 */
export const listMyOrders = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next({ status: 401, message: "Unauthorized" });

    const { page = 1, limit = 20, status } = req.query;
    const filter = { customer: toObjectId(userId) };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const lim = Number(limit);

    const [items, total] = await Promise.all([
      MarketOrder.find(filter)
        .populate({ path: "store", select: "name category photos city" })
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
 * GET /api/market/orders/:id
 */
export const getOrderDetail = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next({ status: 401, message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz sipariş id" });
    }

    const order = await MarketOrder.findOne({ _id: id, customer: toObjectId(userId) })
      .populate({ path: "store", select: "name category photos address city phone" })
      .populate({ path: "deliveryAddress" })
      .lean();

    if (!order) return next({ status: 404, message: "Sipariş bulunamadı" });

    res.json(order);
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/market/orders/:id/cancel
 * Müşteri kendi siparişini iptal eder.
 * Yalnızca status===pending VE sipariş oluşturulalı 5 dakikadan az geçmişse çalışır.
 */
export const cancelOrder = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next({ status: 401, message: "Unauthorized" });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz sipariş id" });
    }

    const order = await MarketOrder.findOne({ _id: id, customer: toObjectId(userId) });
    if (!order) return next({ status: 404, message: "Sipariş bulunamadı" });

    if (order.status !== "pending") {
      return next({ status: 409, message: "Yalnızca bekleyen siparişler iptal edilebilir" });
    }

    // 5 dakika penceresi
    const CANCEL_WINDOW_MS = 5 * 60 * 1000;
    const elapsed = Date.now() - new Date(order.createdAt).getTime();
    if (elapsed > CANCEL_WINDOW_MS) {
      return next({
        status: 409,
        message: "İptal süresi doldu. Siparişler yalnızca ilk 5 dakikada iptal edilebilir.",
      });
    }

    order.status = "cancelled";
    order.cancelReason = "customer_request";
    order.cancelledBy = "customer";
    await order.save();

    // Best-effort: market sahibine bildirim
    if (order.store) {
      MarketStore.findById(order.store)
        .select("owner name")
        .lean()
        .then((store) => {
          if (!store?.owner) return;
          notifyUser(String(store.owner), {
            type: "market_order_cancelled_customer",
            key: `market_order_${order._id}_cancelled_customer`,
            i18n: {
              key: "market_order_cancelled_by_customer",
              vars: { storeName: store.name },
            },
            data: { screen: "MarketOrderDetail", orderId: String(order._id) },
            sound: "default",
          }).catch(() => {});
        })
        .catch(() => {});
    }

    res.json({ ok: true, order });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/market/categories
 * businessTypes içinde "market" geçen aktif CoreCategory'leri döner.
 * Herkese açık (auth gerekmez).
 */
export const listMarketCategories = async (req, res, next) => {
  try {
    const categories = await CoreCategory.find({
      businessTypes: "market",
      isActive: true,
    })
      .select("key i18n order")
      .sort({ order: 1, key: 1 })
      .lean();

    res.json({ items: categories, total: categories.length });
  } catch (e) {
    next(e);
  }
};
