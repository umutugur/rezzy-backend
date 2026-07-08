// src/controllers/marketPanel.controller.js
import mongoose from "mongoose";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import MarketOrder from "../models/MarketOrder.js";
import CoreCategory from "../models/CoreCategory.js";
import { notifyUser } from "../services/notification.service.js";
import { effectivePrice, recordPriceHistory } from "../utils/marketPricing.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";
import { resolveStoreCatalog } from "../services/marketCatalogResolve.service.js";
import MarketBranchOverride from "../models/MarketBranchOverride.js";
import MarketOrgProduct from "../models/MarketOrgProduct.js";
import { reverseRedemptionForOrder } from "../services/promotionsService.js";
import User from "../models/User.js";
import { resolvePanelStore } from "../services/panelStoreAccess.service.js";
import { buildAccessSet } from "../services/panelStoreAccess.js";
import { parsePriceRows } from "../services/bulkPrice.js";

const toObjectId = (id) => {
  try {
    const v = String(id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(v)) return null;
    return new mongoose.Types.ObjectId(v);
  } catch {
    return null;
  }
};

/** GET /market/panel/my-stores — panelde erişilebilir mağazalar */
export const listMyPanelStores = async (req, res, next) => {
  try {
    const uid = toObjectId(req.user?.id);
    const [owned, userDoc] = await Promise.all([
      MarketStore.find({ owner: uid }).select("_id name city isActive").lean(),
      User.findById(uid).select("marketMemberships").lean(),
    ]);
    const memberIds = (userDoc?.marketMemberships || []).map((m) => m.store);
    const memberStores = memberIds.length
      ? await MarketStore.find({ _id: { $in: memberIds } }).select("_id name city isActive").lean()
      : [];
    const set = buildAccessSet(owned, userDoc?.marketMemberships);
    const byId = new Map([...owned, ...memberStores].map((s) => [String(s._id), s]));
    const items = [...byId.values()].map((s) => ({ ...s, access: set.get(String(s._id)) }));
    res.json({ items });
  } catch (e) { next(e); }
};

// Satış birimi enum'una güvenli normalize — geçersiz/eski etiketler "piece"e düşer
const UNIT_ENUM = ["kg", "piece", "litre", "pack"];
const UNIT_ALIASES = { adet: "piece", lt: "litre", l: "litre", litre: "litre", paket: "pack", kilo: "kg" };
function normalizeUnit(u) {
  const v = String(u || "").toLowerCase().trim();
  if (UNIT_ENUM.includes(v)) return v;
  if (UNIT_ALIASES[v]) return UNIT_ALIASES[v];
  return "piece";
}

// attributes: yalnızca {label,value} string çiftleri, label≤40 value≤80, max 30
function sanitizeAttributes(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a) => a && typeof a.label === "string" && typeof a.value === "string" && a.label.trim() && a.value.trim())
    .slice(0, 30)
    .map((a) => ({ label: a.label.trim().slice(0, 40), value: a.value.trim().slice(0, 80) }));
}

// ---------------------------------------------------------------------------
// SİPARİŞ YÖNETİMİ
// ---------------------------------------------------------------------------

/**
 * GET /api/market/panel/orders
 * Query: status, page, limit
 */
export const listPanelOrders = async (req, res, next) => {
  try {
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

    const { status, page = 1, limit = 30 } = req.query;
    const filter = { store: store._id };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const lim = Number(limit);

    const [items, total] = await Promise.all([
      MarketOrder.find(filter)
        .populate({ path: "customer", select: "name email phone" })
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

    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

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
    if (status === "cancelled") await reverseRedemptionForOrder(order._id);

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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;
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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { access } = r;
    if (access !== "owner" && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Bu işlem yalnızca mağaza sahibine açık" });
    }

    // lean() kullanmadan gerçek document çek (save için)
    const store = await MarketStore.findById(r.store._id);
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
      "logo",
      "gridSettings",
      "deliveryZones",
      "location",
      "pickupEnabled",
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
        } else if (key === "pickupEnabled") {
          store[key] = req.body[key] === true || req.body[key] === "true";
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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

    const { title, description, price, unit, stock, photos, category, barcode,
      brand, attributes, netQuantity, netUnit, discountPrice } = req.body || {};

    if (!title || typeof title !== "string" || !title.trim()) {
      return next({ status: 400, message: "title zorunlu" });
    }
    if (price == null || isNaN(Number(price)) || Number(price) < 0) {
      return next({ status: 400, message: "Geçerli bir price giriniz" });
    }
    if (!category) {
      return next({ status: 400, message: "category zorunlu" });
    }
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return next({ status: 400, message: "Geçersiz category id" });
    }
    const catDoc = await CoreCategory.findOne({ _id: category, businessTypes: "market", isActive: true }).select("_id").lean();
    if (!catDoc) {
      return next({ status: 400, message: "Geçersiz market kategorisi" });
    }

    const product = await MarketProduct.create({
      title: title.trim(),
      description: description || "",
      price: Number(price),
      unit: normalizeUnit(unit),
      stock: Number(stock ?? 0),
      photos: Array.isArray(photos) ? photos : [],
      category: toObjectId(category),
      store: store._id,
      barcode: barcode || null,
      brand: typeof brand === "string" ? brand.trim() : "",
      attributes: sanitizeAttributes(attributes),
      netQuantity: netQuantity != null && Number(netQuantity) >= 0 ? Number(netQuantity) : null,
      netUnit: ["L","ml","kg","g","piece"].includes(netUnit) ? netUnit : null,
      discountPrice:
        discountPrice != null && Number(discountPrice) >= 0 && Number(discountPrice) < Number(price)
          ? Number(discountPrice) : null,
      priceHistory: [{
        price: (discountPrice != null && Number(discountPrice) >= 0 && Number(discountPrice) < Number(price))
          ? Number(discountPrice) : Number(price),
        at: new Date(),
      }],
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
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz ürün id" });
    }

    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

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
      "brand",
      "attributes",
      "netQuantity",
      "netUnit",
      "discountPrice",
    ];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === "category") {
          if (!mongoose.Types.ObjectId.isValid(req.body[key])) {
            return next({ status: 400, message: "Geçersiz category id" });
          }
          const catDoc = await CoreCategory.findOne({ _id: req.body[key], businessTypes: "market", isActive: true }).select("_id").lean();
          if (!catDoc) {
            return next({ status: 400, message: "Geçersiz market kategorisi" });
          }
          product.category = toObjectId(req.body[key]);
        } else if (key === "attributes") {
          product.attributes = sanitizeAttributes(req.body[key]);
        } else if (key === "brand") {
          product.brand = typeof req.body[key] === "string" ? req.body[key].trim() : "";
        } else if (key === "netQuantity") {
          const n = req.body[key];
          product.netQuantity = n != null && Number(n) >= 0 ? Number(n) : null;
        } else if (key === "netUnit") {
          product.netUnit = ["L","ml","kg","g","piece"].includes(req.body[key]) ? req.body[key] : null;
        } else if (key === "discountPrice") {
          const dv = req.body[key];
          product.discountPrice =
            dv != null && Number(dv) >= 0 && Number(dv) < Number(product.price) ? Number(dv) : null;
        } else if (key === "unit") {
          product.unit = normalizeUnit(req.body[key]);
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

    if (product.isModified("price") || product.isModified("discountPrice")) {
      recordPriceHistory(product);
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
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next({ status: 400, message: "Geçersiz ürün id" });
    }

    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

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
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

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

/** POST /api/market/panel/upload — tek görsel yükle, URL döner (photos alanında kullanılır) */
export const uploadPanelImage = async (req, res, next) => {
  try {
    if (!req.file?.buffer) return next({ status: 400, message: "Görsel dosyası gerekli" });
    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: process.env.CLOUDINARY_FOLDER_MARKET || "rezvix/market",
      resource_type: "image",
    });
    res.json({ url: result.secure_url });
  } catch (e) { next(e); }
};

/** GET /api/market/panel/product-image-suggestions?barcode=&title=&brand=&limit= */
export const productImageSuggestions = async (req, res, next) => {
  try {
    const { barcode, title, brand } = req.query;
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const seen = new Set();
    const items = [];
    const pushDocs = (docs, source) => {
      for (const p of docs) {
        const url = p.photos?.[0];
        if (!url || seen.has(url)) continue;
        seen.add(url);
        items.push({ url, source, title: p.title, brand: p.brand });
        if (items.length >= limit) break;
      }
    };
    if (barcode && String(barcode).trim()) {
      const docs = await MarketProduct.find({
        barcode: String(barcode).trim(),
        isActive: true,
        "photos.0": { $exists: true },
      }).select("photos title brand").limit(limit).lean();
      pushDocs(docs, "barcode");
    }
    if (items.length < limit) {
      const term = [title, brand].filter(Boolean).map(String).join(" ").trim();
      if (term) {
        const docs = await MarketProduct.find({
          $text: { $search: term },
          isActive: true,
          "photos.0": { $exists: true },
        }).select("photos title brand").limit(limit * 2).lean();
        pushDocs(docs, "match");
      }
    }
    res.json({ items });
  } catch (e) { next(e); }
};

// ---------------------------------------------------------------------------
// ZİNCİR KATALOĞU — ŞUBE OVERRIDE
// ---------------------------------------------------------------------------

// GET /market/panel/org-products?q=
export const listMyOrgProducts = async (req, res, next) => {
  try {
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;
    if (!store.organization) return res.json({ items: [], organization: null });
    const resolved = await resolveStoreCatalog(store);
    const overrides = await MarketBranchOverride.find({ store: store._id }).lean();
    const ovMap = new Map(overrides.map((o) => [String(o.orgProductId), o]));
    let items = resolved.filter((it) => it.source === "org").map((it) => {
      const ov = ovMap.get(String(it.orgProductId));
      return {
        ...it,
        override: ov
          ? { price: ov.price ?? null, discountPrice: ov.discountPrice ?? null, isAvailable: ov.isAvailable ?? null, hidden: !!ov.hidden }
          : null,
      };
    });
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q) items = items.filter((it) => it.title.toLowerCase().includes(q) || String(it.barcode || "").includes(q));
    res.json({ items, organization: store.organization });
  } catch (e) { next(e); }
};

// PUT /market/panel/org-products/:orgProductId/override  body {price?,discountPrice?,isAvailable?,hidden?} | {} clears
export const upsertBranchOverride = async (req, res, next) => {
  try {
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;
    if (!store.organization) return next({ status: 400, message: "Bu market bir zincire bağlı değil" });
    const orgProductId = req.params.orgProductId;
    const op = await MarketOrgProduct.findOne({ _id: orgProductId, organizationId: store.organization }).lean();
    if (!op) return next({ status: 404, message: "Zincir ürünü bulunamadı" });

    const { price, discountPrice, isAvailable, hidden } = req.body || {};
    const isEmpty = price == null && discountPrice == null && isAvailable == null && hidden == null;
    if (isEmpty) {
      await MarketBranchOverride.deleteOne({ store: store._id, orgProductId });
      return res.json({ ok: true, cleared: true });
    }
    const set = {};
    const unset = {};
    if (price != null) set.price = Number(price); else unset.price = "";
    if (discountPrice != null) set.discountPrice = Number(discountPrice); else unset.discountPrice = "";
    if (isAvailable != null) set.isAvailable = !!isAvailable; else unset.isAvailable = "";
    set.hidden = !!hidden;
    const update = { $set: set };
    if (Object.keys(unset).length) update.$unset = unset;
    const doc = await MarketBranchOverride.findOneAndUpdate(
      { store: store._id, orgProductId }, update, { new: true, upsert: true }
    ).lean();
    res.json({ ok: true, override: doc });
  } catch (e) { next(e); }
};

/** GET /api/market/panel/reports?from=&to= — mağaza satış/sipariş raporu (gelir = delivered) */
export const getReports = async (req, res, next) => {
  try {
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

    const now = new Date();
    const to = req.query.to ? new Date(req.query.to) : now;
    const from = req.query.from ? new Date(req.query.from) : new Date(now.getTime() - 30 * 864e5);
    if (isNaN(to.getTime()) || isNaN(from.getTime())) {
      return next({ status: 400, message: "Geçersiz tarih" });
    }
    const fromStart = new Date(from); fromStart.setHours(0, 0, 0, 0);
    const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999);
    const TZ = "Europe/Istanbul";
    const match = { store: store._id, createdAt: { $gte: fromStart, $lte: toEnd } };
    const deliveredOnly = { $match: { status: "delivered" } };

    const [facet] = await MarketOrder.aggregate([
      { $match: match },
      { $facet: {
        kpis: [
          { $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            deliveredOrders: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] } },
            revenue: { $sum: { $cond: [{ $eq: ["$status", "delivered"] }, "$total", 0] } },
            cancelledOrders: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
            pendingOrders: { $sum: { $cond: [{ $in: ["$status", ["pending", "confirmed", "preparing", "ready"]] }, 1, 0] } },
          } },
        ],
        itemsSold: [
          deliveredOnly, { $unwind: "$items" },
          { $group: { _id: null, qty: { $sum: "$items.qty" } } },
        ],
        timeseries: [
          deliveredOnly,
          { $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            revenue: { $sum: "$total" }, orders: { $sum: 1 },
          } },
          { $sort: { _id: 1 } },
        ],
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byPayment: [deliveredOnly, { $group: { _id: "$paymentMethod", count: { $sum: 1 }, revenue: { $sum: "$total" } } }],
        byType: [deliveredOnly, { $group: { _id: "$type", count: { $sum: 1 }, revenue: { $sum: "$total" } } }],
        topProducts: [
          deliveredOnly, { $unwind: "$items" },
          { $group: { _id: "$items.title", qty: { $sum: "$items.qty" }, revenue: { $sum: "$items.lineTotal" } } },
          { $sort: { revenue: -1 } }, { $limit: 10 },
        ],
      } },
    ]);

    const k = facet.kpis[0] || { totalOrders: 0, deliveredOrders: 0, revenue: 0, cancelledOrders: 0, pendingOrders: 0 };
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    res.json({
      range: { from: fromStart, to: toEnd },
      kpis: {
        revenue: round2(k.revenue),
        deliveredOrders: k.deliveredOrders,
        totalOrders: k.totalOrders,
        pendingOrders: k.pendingOrders,
        cancelledOrders: k.cancelledOrders,
        avgOrderValue: k.deliveredOrders ? round2(k.revenue / k.deliveredOrders) : 0,
        cancelRate: k.totalOrders ? Math.round((k.cancelledOrders / k.totalOrders) * 10000) / 10000 : 0,
        itemsSold: facet.itemsSold[0]?.qty || 0,
      },
      timeseries: facet.timeseries.map((d) => ({ date: d._id, revenue: round2(d.revenue), orders: d.orders })),
      byStatus: facet.byStatus.map((d) => ({ status: d._id, count: d.count })),
      byPayment: facet.byPayment.map((d) => ({ method: d._id || "unknown", count: d.count, revenue: round2(d.revenue) })),
      byType: facet.byType.map((d) => ({ type: d._id || "unknown", count: d.count, revenue: round2(d.revenue) })),
      topProducts: facet.topProducts.map((d) => ({ title: d._id, qty: d.qty, revenue: round2(d.revenue) })),
    });
  } catch (e) { next(e); }
};

// POST /market/panel/bulk-price  body { rows:[{barcode,price}], dryRun?:bool, storeId? }
export const panelBulkPrice = async (req, res, next) => {
  try {
    const r = await resolvePanelStore(req.user, req.query.storeId || req.body?.storeId);
    if (r.error) return res.status(r.error.status).json(r.error);
    const { store } = r;

    const rawRows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
    const dryRun = req.body.dryRun === true;
    const { valid, invalid } = parsePriceRows(rawRows);

    let matched = 0, updated = 0;
    const notFound = [];
    for (const row of valid) {
      const existing = await MarketProduct.findOne({ store: store._id, barcode: row.barcode }).select("_id").lean();
      if (!existing) { notFound.push(row.barcode); continue; }
      matched++;
      if (!dryRun) {
        await MarketProduct.updateOne({ _id: existing._id }, { $set: { price: row.price } });
        updated++;
      }
    }
    res.json({ dryRun, total: rawRows.length, matched, updated, notFound, invalid });
  } catch (e) { next(e); }
};
