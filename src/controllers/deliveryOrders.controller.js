// src/controllers/deliveryOrders.controller.js
import mongoose from "mongoose";
import Stripe from "stripe";

import DeliveryOrder from "../models/DeliveryOrder.js";
import DeliveryPaymentAttempt from "../models/DeliveryPaymentAttempt.js";
import UserAddress from "../models/UserAddress.js";
import Restaurant from "../models/Restaurant.js";
import MenuItem from "../models/MenuItem.js";
import { resolveZoneForRestaurant } from "../utils/deliveryZoneResolver.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;

function currencyFromRegion(region) {
  if (String(region || "").toUpperCase() === "UK") return "GBP";
  return "TRY";
}

function assertAuth(req) {
  const uid = req.user?._id || req.user?.id;
  if (!uid) throw { status: 401, code: "UNAUTHORIZED", message: "Unauthorized" };
  return String(uid);
}

function asObjectId(v, code, message) {
  if (!v || !mongoose.Types.ObjectId.isValid(String(v))) throw { status: 400, code, message };
  return new mongoose.Types.ObjectId(String(v));
}

async function buildDeliveryPricingOrThrow({ userId, restaurantId, addressId, items, hexId }) {
  const rid = String(restaurantId);

  const r = await Restaurant.findById(rid).select("isActive status region delivery").lean();
  if (!r) throw { status: 404, code: "RESTAURANT_NOT_FOUND", message: "Restoran bulunamadı." };

  if (!r.isActive || String(r.status || "active") !== "active") {
    throw { status: 400, code: "RESTAURANT_INACTIVE", message: "Restoran şu an sipariş alamıyor." };
  }
  if (!r.delivery?.enabled) {
    throw { status: 400, code: "DELIVERY_DISABLED", message: "Bu restoran şu an paket servis almıyor." };
  }

  const addr = await UserAddress.findOne({ _id: addressId, userId, isActive: true }).lean();
  if (!addr) {
    throw { status: 404, code: "ADDRESS_NOT_FOUND", message: "Adres bulunamadı. Lütfen farklı bir adres seçin." };
  }

  const coords = addr?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) {
    throw {
      status: 400,
      code: "ADDRESS_LOCATION_INVALID",
      message: "Bu adresin konumu eksik. Lütfen adresi haritadan tekrar seçin.",
    };
  }

  // Zone resolve (backend authoritative)
  const zoneOut = await resolveZoneForRestaurant({
    restaurantId: rid,
    customerLocation: coords,
    hexId,
  });

  if (!zoneOut.ok) {
    throw {
      status: 400,
      code: "DELIVERY_ZONE_NOT_FOUND",
      message: "Bu adres için paket servis bölgesi bulunamadı. Lütfen farklı bir adres seçin.",
    };
  }

  if (!zoneOut.zone.isActive) {
    throw {
      status: 400,
      code: "DELIVERY_ZONE_INACTIVE",
      message: "Seçtiğiniz adrese şu an paket servis yapılamıyor. Lütfen farklı bir adres seçin.",
    };
  }

  // Items normalize
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 400, code: "ITEMS_REQUIRED", message: "Sepet boş olamaz." };
  }

  const normalized = items.map((x) => ({
    itemId: String(x?.itemId || ""),
    qty: Math.max(1, Number(x?.qty || 1)),
    note: String(x?.note || ""),
  }));

  const ids = normalized.map((x) => x.itemId).filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (ids.length !== normalized.length) {
    throw { status: 400, code: "ITEM_ID_INVALID", message: "Sepette geçersiz ürün var." };
  }

  const menuItems = await MenuItem.find({
    _id: { $in: ids },
    restaurantId: rid,
    isActive: true,
    isAvailable: true,
  })
    .select("_id title price")
    .lean();

  const miMap = new Map(menuItems.map((m) => [String(m._id), m]));

  const calcItems = normalized.map((it) => {
    const m = miMap.get(String(it.itemId));
    if (!m) {
      throw {
        status: 400,
        code: "ITEM_NOT_AVAILABLE",
        message: "Sepetteki bazı ürünler artık mevcut değil. Lütfen sepeti güncelleyin.",
      };
    }
    const price = Math.max(0, Number(m.price || 0));
    return {
      itemId: m._id,
      title: String(m.title || ""),
      price,
      qty: it.qty,
      note: it.note,
    };
  });

  const subtotal = calcItems.reduce((sum, it) => sum + it.price * it.qty, 0);

  const minOrderAmount = Math.max(0, Number(zoneOut.zone.minOrderAmount || 0));
  if (subtotal < minOrderAmount) {
    const currency = currencyFromRegion(r?.region);
    throw {
      status: 400,
      code: "DELIVERY_MIN_ORDER_NOT_MET",
      message: `Bu bölge için minimum sepet tutarı ${minOrderAmount} ${currency}. Sepetinize ürün ekleyin.`,
      meta: { minOrderAmount, subtotal },
    };
  }

  const deliveryFee = Math.max(0, Number(zoneOut.zone.feeAmount || 0));
  const total = subtotal + deliveryFee;
  const currency = currencyFromRegion(r?.region);

  return {
    restaurant: r,
    currency,
    zone: zoneOut.zone,
    address: addr,
    calcItems,
    subtotal,
    deliveryFee,
    total,
    minOrderAmount,
  };
}

/**
 * ✅ B Modeli: CARD ödeme için checkout oluşturur.
 * - DeliveryOrder yaratmaz
 * - Stripe PI + DeliveryPaymentAttempt yaratır
 */
export async function checkoutDeliveryOrder(req, res, next) {
  try {
    const userId = assertAuth(req);

    if (!stripe) {
      throw { status: 500, code: "STRIPE_NOT_CONFIGURED", message: "Stripe konfigüre değil." };
    }

    const { restaurantId, addressId, items, hexId } = req.body || {};

    const rid = asObjectId(restaurantId, "RESTAURANT_ID_INVALID", "restaurantId geçersiz.");
    const aid = asObjectId(addressId, "DELIVERY_ADDRESS_REQUIRED", "Paket servis için teslimat adresi seçmeniz gerekiyor.");

    const pricing = await buildDeliveryPricingOrThrow({
      userId,
      restaurantId: rid,
      addressId: aid,
      items,
      hexId,
    });

    // Stripe PI
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(pricing.total * 100),
      currency: String(pricing.currency || "TRY").toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: "delivery_attempt",
        restaurantId: String(rid),
        userId: String(userId),
        addressId: String(aid),
        zoneId: String(pricing.zone.id),
      },
    });

    // Attempt create
    const attempt = await DeliveryPaymentAttempt.create({
      restaurantId: rid,
      userId: new mongoose.Types.ObjectId(String(userId)),
      addressId: aid,

      zoneId: String(pricing.zone.id),
      zoneIsActive: true,
      minOrderAmountSnapshot: pricing.minOrderAmount,
      feeAmountSnapshot: pricing.deliveryFee,

      currency: pricing.currency,
      items: pricing.calcItems,

      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      total: pricing.total,

      paymentMethod: "card",
      stripePaymentIntentId: pi.id,
      status: "pending",
      deliveryOrderId: null,
    });

    return res.status(201).json({
      ok: true,
      attemptId: String(attempt._id),
      payment: {
        paymentIntentId: pi.id,
        clientSecret: pi.client_secret,
        amount: pricing.total,
        currency: pricing.currency,
      },
      pricing: {
        subtotal: pricing.subtotal,
        minOrderAmount: pricing.minOrderAmount,
        deliveryFee: pricing.deliveryFee,
        total: pricing.total,
        zoneId: pricing.zone.id,
      },
    });
  } catch (e) {
    return next(e);
  }
}

/**
 * ✅ Cash / card_on_delivery: Stripe yok → DeliveryOrder direkt yaratılır
 */
export async function createDeliveryOrderCOD(req, res, next) {
  try {
    const userId = assertAuth(req);

    const { restaurantId, addressId, items, paymentMethod, hexId } = req.body || {};

    if (!["cash", "card_on_delivery"].includes(String(paymentMethod || ""))) {
      throw { status: 400, code: "PAYMENT_METHOD_INVALID", message: "paymentMethod geçersiz." };
    }

    const rid = asObjectId(restaurantId, "RESTAURANT_ID_INVALID", "restaurantId geçersiz.");
    const aid = asObjectId(addressId, "DELIVERY_ADDRESS_REQUIRED", "Paket servis için teslimat adresi seçmeniz gerekiyor.");

    const pricing = await buildDeliveryPricingOrThrow({
      userId,
      restaurantId: rid,
      addressId: aid,
      items,
      hexId,
    });

    // Delivery komisyonu şimdilik 0
    const commissionRate = 0;
    const commissionAmount = 0;

    const doc = await DeliveryOrder.create({
      restaurantId: rid,
      userId: new mongoose.Types.ObjectId(String(userId)),
      addressId: aid,

      zoneId: String(pricing.zone.id),
      zoneIsActive: true,
      minOrderAmountSnapshot: pricing.minOrderAmount,
      feeAmountSnapshot: pricing.deliveryFee,

      items: pricing.calcItems,
      currency: pricing.currency,

      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      total: pricing.total,

      commissionRate,
      commissionAmount,

      paymentMethod: String(paymentMethod),
      paymentStatus: "pending",
      stripePaymentIntentId: null,

      status: "new",
    });

    return res.status(201).json({
      ok: true,
      order: doc,
      pricing: {
        subtotal: pricing.subtotal,
        minOrderAmount: pricing.minOrderAmount,
        deliveryFee: pricing.deliveryFee,
        total: pricing.total,
        zoneId: pricing.zone.id,
      },
    });
  } catch (e) {
    return next(e);
  }
}

/**
 * ✅ Client polling: attempt durumunu ve oluşan orderId'yi döner
 */
export async function getDeliveryAttemptStatus(req, res, next) {
  try {
    const userId = assertAuth(req);
    const { attemptId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      throw { status: 400, code: "ATTEMPT_ID_INVALID", message: "attemptId geçersiz." };
    }

    const a = await DeliveryPaymentAttempt.findOne({ _id: attemptId, userId }).lean();
    if (!a) throw { status: 404, code: "ATTEMPT_NOT_FOUND", message: "Payment attempt bulunamadı." };

    return res.json({
      ok: true,
      attempt: {
        id: String(a._id),
        status: a.status,
        stripePaymentIntentId: a.stripePaymentIntentId,
        deliveryOrderId: a.deliveryOrderId ? String(a.deliveryOrderId) : null,
        total: a.total,
        currency: a.currency,
        createdAt: a.createdAt,
      },
    });
  } catch (e) {
    return next(e);
  }
}