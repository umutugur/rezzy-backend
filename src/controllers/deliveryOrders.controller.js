// src/controllers/deliveryOrders.controller.js
import mongoose from "mongoose";
import Stripe from "stripe";

import DeliveryOrder from "../models/DeliveryOrder.js";
import DeliveryPaymentAttempt from "../models/DeliveryPaymentAttempt.js";
import UserAddress from "../models/UserAddress.js";
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";
import { resolveZoneForRestaurant } from "../utils/deliveryZoneResolver.js";
import { buildItemsWithModifiersOrThrow } from "../services/modifierPricing.service.js";

import Campaign from "../models/Campaign.js";
import UserCoupon from "../models/UserCoupon.js";
import CouponRedemption from "../models/CouponRedemption.js";
import { evaluateForOrder, regionOf } from "../services/promotionsService.js";
import { computeCommission } from "../services/promotionEngine.js";

/**
 * Resolve a coupon for a delivery order (restaurant surface).
 * surface = "restaurant", base = subtotal, store = restaurantId.
 * Returns financial fields; does NOT consume the coupon.
 */
export async function resolveDeliveryCoupon(req, { restaurant, subtotal, deliveryFee, paymentMethod }) {
  const commission = computeCommission(subtotal, restaurant?.commissionRate ?? 0);
  const out = { discount: 0, platformContribution: 0, businessContribution: 0, couponCampaign: null, commission };
  const id = req.body?.couponCampaignId;
  if (id) {
    const campaign = await Campaign.findById(id);
    const held = campaign
      ? await UserCoupon.findOne({ user: req.user.id, campaign: campaign._id, status: "active" })
      : null;
    if (campaign && held) {
      const r = await evaluateForOrder({
        campaign,
        user: req.user.id,
        base: subtotal,
        deliveryFee,
        surface: "restaurant",
        region: regionOf(req),
        paymentMethod,
        storeId: String(restaurant._id),
        storeCategory: restaurant.businessType,
        organizationId: restaurant.organizationId || null,
      });
      if (r.eligible) {
        out.discount = r.discount;
        out.platformContribution = r.platformContribution;
        out.businessContribution = r.businessContribution;
        out.couponCampaign = campaign._id;
      }
    }
  }
  return out;
}

/**
 * Record a coupon redemption for a materialized delivery order:
 * CouponRedemption{surface:"restaurant"} + atomic Campaign.budget.spent $inc
 * + UserCoupon.usedCount $inc (+ flip to "used" at perUser cap).
 * `c` = { couponCampaign, discount, platformContribution, businessContribution, commission }
 */
export async function recordDeliveryRedemption(order, c, { region } = {}) {
  if (!c?.couponCampaign || !(c.discount > 0)) return;
  const campSel = await Campaign.findById(c.couponCampaign).select("budget").lean();
  const add = campSel?.budget?.basis === "discount" ? c.discount : c.platformContribution;
  await CouponRedemption.create({
    campaign: c.couponCampaign,
    user: order.userId,
    surface: "restaurant",
    orderRef: order._id,
    store: order.restaurantId,
    organization: order.organizationId || null,
    gross: order.subtotal,
    discount: c.discount,
    platformContribution: c.platformContribution,
    businessContribution: c.businessContribution,
    commission: c.commission,
    paymentMethod: order.paymentMethod,
    region: region || "",
    status: "applied",
  });
  await Campaign.updateOne({ _id: c.couponCampaign }, { $inc: { "budget.spent": add } });
  const uc = await UserCoupon.findOneAndUpdate(
    { user: order.userId, campaign: c.couponCampaign },
    { $inc: { usedCount: 1 } },
    { new: true }
  );
  if (uc) {
    const camp = await Campaign.findById(c.couponCampaign).select("usageLimit").lean();
    if (uc.usedCount >= (camp?.usageLimit?.perUser ?? 1)) {
      await UserCoupon.updateOne({ _id: uc._id }, { $set: { status: "used" } });
    }
  }
}

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

function safeStr(v) {
  return String(v ?? "").trim();
}

function buildAddressTextSnapshot(addr) {
  if (!addr) return "";
  const full =
    safeStr(addr.fullAddress) ||
    safeStr(addr.address) ||
    safeStr(addr.addressLine) ||
    safeStr(addr.formatted) ||
    safeStr(addr.text);

  if (full) return full;

  const title = safeStr(addr.title || addr.label || addr.name);
  const district = safeStr(addr.district || addr.town || addr.neighborhood);
  const street = safeStr(addr.street || addr.streetName);
  const buildingNo = safeStr(addr.buildingNo || addr.building || addr.no);
  const doorNo = safeStr(addr.doorNo || addr.door || addr.apartment);
  const city = safeStr(addr.city || addr.province || addr.state);

  const parts = [district, street, buildingNo, doorNo, city].filter(Boolean).join(", ");
  const out = parts || "";
  return title ? `${title}${out ? ": " : ""}${out}` : out;
}

async function buildCustomerSnapshot({ userId, reqUser }) {
  const fromReqName = safeStr(reqUser?.name);
  const fromReqPhone = safeStr(reqUser?.phone);

  if (fromReqName && fromReqPhone) return { customerName: fromReqName, customerPhone: fromReqPhone };

  const u = await User.findById(userId).select("name phone").lean();
  return {
    customerName: fromReqName || safeStr(u?.name),
    customerPhone: fromReqPhone || safeStr(u?.phone),
  };
}

async function buildDeliveryPricingOrThrow({ userId, restaurantId, addressId, items, hexId }) {
  const rid = String(restaurantId);

  const r = await Restaurant.findById(rid).select("isActive status region delivery organizationId businessType commissionRate").lean();
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

  // ✅ Tek otorite: item + modifier validation + subtotal
  const { builtItems, subtotal } = await buildItemsWithModifiersOrThrow({
    restaurant: r,
    items,
  });

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

  // Delivery modelleri qty alanı kullanıyor; builtItems zaten qty de koyuyor
  const calcItems = builtItems.map((it) => ({
    itemId: it.itemId,
    itemTitle: it.itemTitle,
    basePrice: it.basePrice,
    qty: it.qty,
    note: it.note,
    selectedModifiers: it.selectedModifiers,
    unitModifiersTotal: it.unitModifiersTotal,
    unitTotal: it.unitTotal,
    lineTotal: it.lineTotal,
  }));

  return {
    restaurant: r,
    currency,
    zone: zoneOut.zone,
    address: addr,
    addressText: buildAddressTextSnapshot(addr),
    calcItems,
    subtotal,
    deliveryFee,
    total,
    minOrderAmount,
  };
}

export async function checkoutDeliveryOrder(req, res, next) {
  try {
    const userId = assertAuth(req);

    if (!stripe) throw { status: 500, code: "STRIPE_NOT_CONFIGURED", message: "Stripe konfigüre değil." };

    const { restaurantId, addressId, items, hexId } = req.body || {};
    const customerNote = safeStr(req.body?.customerNote ?? req.body?.note ?? "");

    const rid = asObjectId(restaurantId, "RESTAURANT_ID_INVALID", "restaurantId geçersiz.");
    const aid = asObjectId(addressId, "DELIVERY_ADDRESS_REQUIRED", "Paket servis için teslimat adresi seçmeniz gerekiyor.");

    const pricing = await buildDeliveryPricingOrThrow({
      userId,
      restaurantId: rid,
      addressId: aid,
      items,
      hexId,
    });

    const cust = await buildCustomerSnapshot({ userId, reqUser: req.user });

    // ── Coupon (Phase 5) ── snapshot only; redemption is created at materialization (webhook)
    const coupon = await resolveDeliveryCoupon(req, {
      restaurant: pricing.restaurant,
      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      paymentMethod: "card",
    });
    const total = +(pricing.subtotal + pricing.deliveryFee - coupon.discount).toFixed(2);

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
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

    const attempt = await DeliveryPaymentAttempt.create({
      restaurantId: rid,
      userId: new mongoose.Types.ObjectId(String(userId)),
      addressId: aid,

      customerName: cust.customerName,
      customerPhone: cust.customerPhone,
      addressText: pricing.addressText,
      customerNote,

      zoneId: String(pricing.zone.id),
      zoneIsActive: true,
      minOrderAmountSnapshot: pricing.minOrderAmount,
      feeAmountSnapshot: pricing.deliveryFee,

      currency: pricing.currency,
      items: pricing.calcItems,

      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      total,

      discount: coupon.discount,
      couponCampaign: coupon.couponCampaign,
      platformContribution: coupon.platformContribution,
      businessContribution: coupon.businessContribution,
      commission: coupon.commission,

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
        amount: total,
        currency: pricing.currency,
      },
      pricing: {
        subtotal: pricing.subtotal,
        minOrderAmount: pricing.minOrderAmount,
        deliveryFee: pricing.deliveryFee,
        discount: coupon.discount,
        total,
        zoneId: pricing.zone.id,
      },
    });
  } catch (e) {
    return next(e);
  }
}

export async function createDeliveryOrderCOD(req, res, next) {
  try {
    const userId = assertAuth(req);

    const { restaurantId, addressId, items, paymentMethod, hexId } = req.body || {};
    const customerNote = safeStr(req.body?.customerNote ?? req.body?.note ?? "");

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

    const cust = await buildCustomerSnapshot({ userId, reqUser: req.user });

    const commissionRate = 0;
    const commissionAmount = 0;

    // ── Coupon (Phase 5) ──
    const coupon = await resolveDeliveryCoupon(req, {
      restaurant: pricing.restaurant,
      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      paymentMethod: String(paymentMethod),
    });
    const total = +(pricing.subtotal + pricing.deliveryFee - coupon.discount).toFixed(2);

    const doc = await DeliveryOrder.create({
      restaurantId: rid,
      userId: new mongoose.Types.ObjectId(String(userId)),
      addressId: aid,

      customerName: cust.customerName,
      customerPhone: cust.customerPhone,
      addressText: pricing.addressText,
      customerNote,

      zoneId: String(pricing.zone.id),
      zoneIsActive: true,
      minOrderAmountSnapshot: pricing.minOrderAmount,
      feeAmountSnapshot: pricing.deliveryFee,

      items: pricing.calcItems,
      currency: pricing.currency,

      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      total,

      discount: coupon.discount,
      couponCampaign: coupon.couponCampaign,
      platformContribution: coupon.platformContribution,
      businessContribution: coupon.businessContribution,
      commission: coupon.commission,

      commissionRate,
      commissionAmount,

      paymentMethod: String(paymentMethod),
      paymentStatus: "pending",
      stripePaymentIntentId: null,

      status: "new",
    });

    await recordDeliveryRedemption(
      { ...doc.toObject(), organizationId: pricing.restaurant?.organizationId || null },
      coupon,
      { region: regionOf(req) }
    );

    return res.status(201).json({
      ok: true,
      order: doc,
      pricing: {
        subtotal: pricing.subtotal,
        minOrderAmount: pricing.minOrderAmount,
        deliveryFee: pricing.deliveryFee,
        discount: coupon.discount,
        total,
        zoneId: pricing.zone.id,
      },
    });
  } catch (e) {
    return next(e);
  }
}

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
function isActiveStatus(status) {
  return ["new", "accepted", "on_the_way"].includes(String(status || ""));
}

function buildItemsPreview(items) {
  const arr = Array.isArray(items) ? items : [];
  if (arr.length === 0) return "";
  const first = arr[0];
  const firstQty = Number(first?.qty || 1) || 1;
  const firstTitle = String(first?.itemTitle || "").trim();

  const extraCount = arr.length - 1;
  if (!firstTitle) return extraCount > 0 ? `+${extraCount} ürün` : "";

  if (extraCount > 0) return `${firstQty}× ${firstTitle} · +${extraCount} ürün`;
  return `${firstQty}× ${firstTitle}`;
}

export async function listMyDeliveryOrders(req, res, next) {
  try {
    const userId = assertAuth(req);

    const limitRaw = Number(req.query?.limit || 20);
    const limit = Math.min(50, Math.max(1, Math.floor(limitRaw || 20)));

    // Son N siparişi çek (createdAt desc)
    const rows = await DeliveryOrder.find({ userId: new mongoose.Types.ObjectId(String(userId)) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Restaurant snapshot (tek seferde)
    const restaurantIds = Array.from(
      new Set(rows.map((o) => String(o.restaurantId)).filter(Boolean))
    );

    const restaurants = await Restaurant.find({ _id: { $in: restaurantIds } })
      .select("name photos")
      .lean();

    const rMap = new Map();
    for (const r of restaurants) {
      rMap.set(String(r._id), {
        id: String(r._id),
        name: r?.name || null,
        photo: Array.isArray(r?.photos) ? r.photos[0] : null,
      });
    }

    const mapped = rows.map((o) => {
      const r = rMap.get(String(o.restaurantId)) || null;
      const itemsPreview = buildItemsPreview(o.items);
      const firstItemTitle = String(o?.items?.[0]?.itemTitle || "").trim() || null;
      const itemCount = (Array.isArray(o.items) ? o.items : []).reduce(
        (sum, it) => sum + (Number(it?.qty || 0) || 0),
        0
      );

      return {
        _id: String(o._id),
        createdAt: o.createdAt,
        status: o.status,

        restaurantId: String(o.restaurantId),
        restaurantName: r?.name || null,
        restaurantPhoto: r?.photo || null,

        total: Number(o.total || 0),
        currency: o.currency || "TRY",

        itemsPreview,
        firstItemTitle,
        itemCount,
      };
    });

    // ✅ Aktifleri en üste al (stable)
    const active = [];
    const passive = [];
    for (const x of mapped) (isActiveStatus(x.status) ? active : passive).push(x);

    return res.json({ ok: true, items: [...active, ...passive] });
  } catch (e) {
    return next(e);
  }
}

export async function getMyDeliveryOrder(req, res, next) {
  try {
    const userId = assertAuth(req);
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(String(orderId))) {
      throw { status: 400, code: "ORDER_ID_INVALID", message: "orderId geçersiz." };
    }

    const o = await DeliveryOrder.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(String(userId)) }).lean();
    if (!o) throw { status: 404, code: "ORDER_NOT_FOUND", message: "Sipariş bulunamadı." };

    const r = await Restaurant.findById(o.restaurantId).select("name photos").lean();

    return res.json({
      ok: true,
      order: {
        ...o,
        _id: String(o._id),
        restaurantId: String(o.restaurantId),
        userId: String(o.userId),
        addressId: String(o.addressId),
      },
      restaurant: r
        ? { id: String(r._id), name: r?.name || null, photo: Array.isArray(r?.photos) ? r.photos[0] : null }
        : null,
    });
  } catch (e) {
    return next(e);
  }
}