// src/controllers/market.controller.js
import mongoose from "mongoose";
import Stripe from "stripe";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketOrder from "../models/MarketOrder.js";
import MarketCollection from "../models/MarketCollection.js";
import UserAddress from "../models/UserAddress.js";
import CoreCategory from "../models/CoreCategory.js";
import { notifyUser } from "../services/notification.service.js";
import { resolveZoneForMarketStore } from "../utils/deliveryZoneResolver.js";
import { haversineMeters } from "../utils/haversine.js";
import { computeUnitPrice } from "../utils/marketUnitPrice.js";
import { effectivePrice, discountPercent, lowest30 } from "../utils/marketPricing.js";
import { resolveStoreCatalog, resolveOrgProductForOrder } from "../services/marketCatalogResolve.service.js";
import Organization from "../models/Organization.js";
import { resolveStoreImages } from "../utils/storeImages.js";

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
      pickup,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = { isActive: true };

    if (category) filter.category = category;
    if (String(pickup) === "1") filter.pickupEnabled = { $ne: false };

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

    const orgIds = [...new Set(stores.filter((s) => s.organization).map((s) => String(s.organization)))];
    if (orgIds.length) {
      const orgs = await Organization.find({ _id: { $in: orgIds } }).select("logoUrl coverUrl").lean();
      const orgMap = new Map(orgs.map((o) => [String(o._id), o]));
      for (const s of stores) {
        const org = s.organization ? orgMap.get(String(s.organization)) : null;
        const img = resolveStoreImages(s, org);
        s.logo = img.logo;
        s.photos = img.photos;
      }
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

    if (store.organization) {
      const orgArr = await Organization.find({ _id: store.organization }).select("logoUrl coverUrl").lean();
      const img = resolveStoreImages(store, orgArr[0] || null);
      store.logo = img.logo;
      store.photos = img.photos;
    }

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
 * Query: category, q, page, limit
 * Uses resolveStoreCatalog so chain stores also return resolved org items.
 * Standalone stores are unaffected (service returns local-only).
 */
export const listStoreProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { category, q, page = 1, limit = 40 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz market id" });
    }

    // Fetch full resolved catalog (org items + local products)
    let all = await resolveStoreCatalog(id);

    // Category filter (match ObjectId string or populated category._id)
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      const catStr = String(category);
      all = all.filter((p) => {
        const cat = p.category;
        if (!cat) return false;
        if (typeof cat === "object") return String(cat._id) === catStr;
        return String(cat) === catStr;
      });
    }

    // Text search filter (q ≥ 2 chars — case-insensitive substring on title)
    if (q && String(q).trim().length >= 2) {
      const needle = String(q).trim().toLowerCase();
      all = all.filter((p) => p.title && p.title.toLowerCase().includes(needle));
    }

    // Sort by title (mirrors the existing .sort({ title: 1 }))
    all.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

    const total = all.length;
    const pg = Number(page);
    const lim = Number(limit);
    const skip = (pg - 1) * lim;

    const pageItems = all.slice(skip, skip + lim);

    const itemsOut = pageItems.map((p) => {
      const out = { ...p, effectivePrice: effectivePrice(p), discountPercent: discountPercent(p) };
      delete out.priceHistory;
      return out;
    });
    res.json({ items: itemsOut, total, page: pg, limit: lim });
  } catch (e) {
    next(e);
  }
};

// Bir koleksiyonun önizleme ürünlerini çözer (max `limit`)
async function resolveCollectionProducts(col, limit = 10) {
  let products = [];
  if (col.kind === "discounted") {
    products = await MarketProduct.find({ isActive: true, discountPrice: { $type: "number" } })
      .sort({ updatedAt: -1 }).limit(limit).lean();
  } else {
    const ids = (col.productIds || []).slice(0, limit);
    const found = await MarketProduct.find({ _id: { $in: ids }, isActive: true }).lean();
    const byId = new Map(found.map((p) => [String(p._id), p]));
    products = ids.map((id) => byId.get(String(id))).filter(Boolean);
  }
  return products.map((p) => {
    const out = { ...p, effectivePrice: effectivePrice(p), discountPercent: discountPercent(p) };
    delete out.priceHistory;
    return out;
  });
}

/** GET /api/market/collections?region= — aktif koleksiyonlar + önizleme ürünleri */
export const listMarketCollections = async (req, res, next) => {
  try {
    const region = req.query.region ? String(req.query.region).trim().toUpperCase() : null;
    const q = { isActive: true };
    if (region) q.$or = [{ region }, { region: null }];
    const cols = await MarketCollection.find(q).sort({ order: 1, createdAt: -1 }).limit(20).lean();
    const items = await Promise.all(cols.map(async (c) => ({
      _id: c._id, title: c.title, kind: c.kind, imageUrl: c.imageUrl,
      products: await resolveCollectionProducts(c, 10),
    })));
    res.json({ items: items.filter((c) => c.products.length > 0) });
  } catch (e) { next(e); }
};

/** GET /api/market/collections/:id?page=&limit= — koleksiyonun tüm ürünleri (sayfalı) */
export const getMarketCollectionProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return next({ status: 400, message: "Geçersiz koleksiyon id" });
    const col = await MarketCollection.findOne({ _id: id, isActive: true }).lean();
    if (!col) return next({ status: 404, message: "Koleksiyon bulunamadı" });

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    let filter, totalCount;
    if (col.kind === "discounted") {
      filter = { isActive: true, discountPrice: { $type: "number" } };
      totalCount = await MarketProduct.countDocuments(filter);
      const docs = await MarketProduct.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();
      const items = docs.map((p) => { const o = { ...p, effectivePrice: effectivePrice(p), discountPercent: discountPercent(p) }; delete o.priceHistory; return o; });
      return res.json({ items, total: totalCount, page, limit });
    }
    const ids = col.productIds || [];
    const pageIds = ids.slice(skip, skip + limit);
    const found = await MarketProduct.find({ _id: { $in: pageIds }, isActive: true }).lean();
    const byId = new Map(found.map((p) => [String(p._id), p]));
    const items = pageIds.map((x) => byId.get(String(x))).filter(Boolean)
      .map((p) => { const o = { ...p, effectivePrice: effectivePrice(p), discountPercent: discountPercent(p) }; delete o.priceHistory; return o; });
    res.json({ items, total: ids.length, page, limit });
  } catch (e) { next(e); }
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

    if (type === "pickup" && store.pickupEnabled === false) {
      return next({ status: 400, message: "Bu market gel-al hizmeti vermiyor" });
    }

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
    // Local lines: productId present (and/or source absent / "product") → existing DB lookup
    // Org lines: source === "org" with orgProductId → resolveOrgProductForOrder

    // Pre-fetch all local product IDs in one query for efficiency
    const localProductIds = items
      .filter((i) => !i.source || i.source === "product")
      .map((i) => i.productId)
      .filter(Boolean);

    const localProducts = localProductIds.length
      ? await MarketProduct.find({
          _id: { $in: localProductIds },
          store: toObjectId(storeId),
          isActive: true,
        }).lean()
      : [];

    const productMap = new Map(localProducts.map((p) => [String(p._id), p]));

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const source = item.source || "product"; // absent source → local ("product")
      const qty = Number(item.qty);

      if (source === "org") {
        // ── Org-catalog line ────────────────────────────────────────────────
        const { orgProductId } = item;
        if (!orgProductId || !mongoose.Types.ObjectId.isValid(orgProductId)) {
          return next({ status: 400, message: `Geçersiz orgProductId: ${orgProductId}` });
        }
        if (!qty || qty < 1) {
          return next({ status: 400, message: `Geçersiz adet: ${orgProductId}` });
        }

        const resolved = await resolveOrgProductForOrder(storeId, orgProductId);
        if (!resolved) {
          return next({ status: 400, message: "Ürün bu mağazada mevcut değil" });
        }
        if (resolved.isAvailable === false) {
          return next({ status: 400, message: "Ürün stokta yok" });
        }

        const unitEff = effectivePrice(resolved);
        const lineTotal = +(unitEff * qty).toFixed(2);
        subtotal += lineTotal;

        orderItems.push({
          productId: resolved.orgProductId,  // store the orgProductId as reference
          title: resolved.title,
          price: unitEff,                    // server-side price, client price ignored
          qty,
          unit: resolved.unit,
          imageUrl: resolved.imageUrl,
          lineTotal,
        });
      } else {
        // ── Local-product line (existing logic, byte-for-byte) ───────────────
        if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
          return next({ status: 400, message: `Geçersiz productId: ${item.productId}` });
        }
        const product = productMap.get(String(item.productId));
        if (!product) {
          return next({ status: 400, message: `Ürün bulunamadı: ${item.productId}` });
        }

        if (!qty || qty < 1) {
          return next({ status: 400, message: `Geçersiz adet: ${item.productId}` });
        }

        const unitEff = effectivePrice(product);
        const lineTotal = +(unitEff * qty).toFixed(2);
        subtotal += lineTotal;

        orderItems.push({
          productId: product._id,
          title: product.title,
          price: unitEff,
          qty,
          unit: product.unit,
          lineTotal,
        });
      }
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
          // Hex-grid yoksa (flat pricing) → deliveryZoneKm yarıçapı ile serviceability
          if (zoneResult.useFlatPricing) {
            const storeCoords = Array.isArray(store.location?.coordinates)
              ? store.location.coordinates
              : null;
            if (storeCoords && addrCoords) {
              const distM = haversineMeters(
                addrCoords[1], addrCoords[0], storeCoords[1], storeCoords[0]
              );
              const maxM = (store.deliveryZoneKm ?? 5) * 1000;
              if (distM > maxM) {
                return next({ status: 400, message: "Bu adres teslimat bölgesi dışında." });
              }
            }
          }
          effectiveMinOrder = zoneResult.minOrderAmount;
          effectiveFreeThreshold = zoneResult.freeDeliveryThreshold;
          deliveryFee = effectiveFreeThreshold != null && subtotal >= effectiveFreeThreshold
            ? 0
            : zoneResult.feeAmount;
        } catch (zoneErr) {
          // Zone resolver hata fırlatırsa (store inactive vs.) onu ilet
          if (zoneErr?.status) return next(zoneErr);
          // Koordinat veya grid hatası → flat pricing'e dön; yine de yarıçap kontrolü
          const storeCoordsForRadius = Array.isArray(store.location?.coordinates)
            ? store.location.coordinates : null;
          if (storeCoordsForRadius && addrCoords) {
            const distM = haversineMeters(addrCoords[1], addrCoords[0], storeCoordsForRadius[1], storeCoordsForRadius[0]);
            if (distM > (store.deliveryZoneKm ?? 5) * 1000) {
              return next({ status: 400, message: "Bu adres teslimat bölgesi dışında." });
            }
          }
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
 * GET /api/market/search
 * Query: q (≥2), lat, lng, radius(km=10), category, brand, discounted(=1),
 *        sort(relevance|price_asc|price_desc), page, limit(≤50)
 */
export const searchProducts = async (req, res, next) => {
  try {
    const {
      q = "", lat, lng, radius = 10, category, brand,
      discounted, sort = "relevance", page = 1, limit = 20,
    } = req.query;

    const query = String(q).trim();
    if (query.length < 2) {
      return res.json({ items: [], total: 0, page: Number(page), limit: Number(limit), brands: [] });
    }

    let storeIds;
    if (lat && lng) {
      const latNum = parseFloat(lat), lngNum = parseFloat(lng);
      const radiusMeters = parseFloat(radius) * 1000;
      if (isNaN(latNum) || isNaN(lngNum) || isNaN(radiusMeters)) {
        return next({ status: 400, message: "Geçersiz konum parametresi" });
      }
      const stores = await MarketStore.find({
        isActive: true,
        location: { $near: { $geometry: { type: "Point", coordinates: [lngNum, latNum] }, $maxDistance: radiusMeters } },
      }).select("_id").limit(200).lean();
      storeIds = stores.map((s) => s._id);
    } else {
      const stores = await MarketStore.find({ isActive: true }).select("_id").limit(200).lean();
      storeIds = stores.map((s) => s._id);
    }
    if (storeIds.length === 0) {
      return res.json({ items: [], total: 0, page: Number(page), limit: Number(limit), brands: [] });
    }

    const filter = { isActive: true, store: { $in: storeIds }, $text: { $search: query } };
    if (category && mongoose.Types.ObjectId.isValid(category)) filter.category = toObjectId(category);
    if (brand) filter.brand = String(brand);
    if (discounted === "1") filter.discountPrice = { $type: "number" };

    const lim = Math.min(Number(limit) || 20, 50);
    const pg = Math.max(Number(page) || 1, 1);
    const skip = (pg - 1) * lim;

    let sortSpec, projection;
    if (sort === "price_asc") { sortSpec = { price: 1 }; }
    else if (sort === "price_desc") { sortSpec = { price: -1 }; }
    else { sortSpec = { score: { $meta: "textScore" } }; projection = { score: { $meta: "textScore" } }; }

    const findQuery = projection ? MarketProduct.find(filter, projection) : MarketProduct.find(filter);

    const [items, total, brandsRaw] = await Promise.all([
      findQuery.sort(sortSpec).skip(skip).limit(lim).populate("store", "name").lean(),
      MarketProduct.countDocuments(filter),
      (() => { const bf = { ...filter }; delete bf.brand; return MarketProduct.distinct("brand", bf); })(),
    ]);

    const itemsOut = items.map((p) => {
      const out = { ...p, effectivePrice: effectivePrice(p), discountPercent: discountPercent(p) };
      delete out.priceHistory;
      delete out.score;
      return out;
    });
    const brands = (brandsRaw || []).filter((b) => b && String(b).trim()).sort();

    res.json({ items: itemsOut, total: Math.min(total, 200), page: pg, limit: lim, brands });
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
