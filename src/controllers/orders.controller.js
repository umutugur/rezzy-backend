// controllers/orders.controller.js
import mongoose from "mongoose";
import Stripe from "stripe";
import OrderSession from "../models/OrderSession.js";
import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" })
  : null;

function currencyFromRegion(region) {
  if (region === "UK") return "GBP";
  return "TRY";
}

/** Masa güncelleme helper */
async function updateTable(restaurantId, tableId, patch) {
  if (!restaurantId || !tableId) return;
  try {
    await Restaurant.updateOne(
      { _id: restaurantId, "tables._id": tableId },
      {
        $set: Object.fromEntries(
          Object.entries(patch).map(([k, v]) => [`tables.$.${k}`, v])
        ),
      }
    );
  } catch (err) {
    console.error("[orders.updateTable] err", err);
  }
}

export async function openSession(req, res) {
  try {
    const { restaurantId, tableId, reservationId } = req.body || {};
    if (!restaurantId || !tableId) {
      return res
        .status(400)
        .json({ message: "restaurantId ve tableId zorunlu." });
    }

    const rid = String(restaurantId);
    const table = String(tableId);

    let s = await OrderSession.findOne({
      restaurantId: rid,
      tableId: table,
      status: "open",
    });

    if (!s) {
      const r = await Restaurant.findById(rid).lean();
      const currency = currencyFromRegion(r?.region);

      s = await OrderSession.create({
        restaurantId: rid,
        tableId: table,
        reservationId:
          reservationId && mongoose.Types.ObjectId.isValid(reservationId)
            ? reservationId
            : null,
        currency,
      });

      // MASAYI AKTİF YAP
      await updateTable(rid, table, {
        hasActiveSession: true,
        sessionId: s._id,
        status: "order_active",
      });
    }

    return res.json({ sessionId: s._id });
  } catch (e) {
    console.error("[openSession] err", e);
    return res.status(500).json({ message: "Session açılamadı." });
  }
}

export async function getSession(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Geçersiz session id." });
    }
    const s = await OrderSession.findById(id).lean();
    if (!s) return res.status(404).json({ message: "Session bulunamadı." });
    return res.json(s);
  } catch (e) {
    console.error("[getSession] err", e);
    return res.status(500).json({ message: "Session alınamadı." });
  }
}

export async function closeSession(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Geçersiz session id." });
    }

    const s = await OrderSession.findByIdAndUpdate(
      id,
      { $set: { status: "closed", closedAt: new Date() } },
      { new: true }
    );
    if (!s) return res.status(404).json({ message: "Session bulunamadı." });

    // MASAYI SIFIRLA
    await Restaurant.updateMany(
      { "tables.sessionId": id },
      {
        $set: {
          "tables.$[t].hasActiveSession": false,
          "tables.$[t].sessionId": null,
          "tables.$[t].status": "empty",
        },
      },
      { arrayFilters: [{ "t.sessionId": id }] }
    );

    return res.json(s);
  } catch (e) {
    console.error("[closeSession] err", e);
    return res.status(500).json({ message: "Session kapatılamadı." });
  }
}

export async function createOrder(req, res) {
  try {
    const {
      sessionId,
      restaurantId,
      tableId,
      items,
      paymentMethod,
      isGuest,
      guestName,
    } = req.body || {};

    if (!sessionId || !restaurantId || !tableId) {
      return res.status(400).json({
        message: "sessionId, restaurantId, tableId zorunlu.",
      });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items zorunlu." });
    }
    if (!["card", "venue"].includes(paymentMethod)) {
      return res
        .status(400)
        .json({ message: "paymentMethod card veya venue olmalı." });
    }

    const sid = String(sessionId);
    const rid = String(restaurantId);

    const s = await OrderSession.findById(sid);
    if (!s || s.status !== "open") {
      return res.status(404).json({ message: "Açık adisyon bulunamadı." });
    }

    const r = await Restaurant.findById(rid).lean();
    const currency = currencyFromRegion(r?.region);

    const calcItems = items.map((x) => ({
      itemId: x.itemId,
      title: x.title,
      price: Number(x.price || 0),
      qty: Math.max(1, Number(x.qty || 1)),
    }));

    const total = calcItems.reduce((sum, it) => sum + it.price * it.qty, 0);

    const o = await Order.create({
      sessionId: sid,
      restaurantId: rid,
      tableId: String(tableId),
      userId: req.user?._id ?? null,
      isGuest: !!isGuest || !req.user,
      guestName: guestName || "",
      items: calcItems,
      total,
      currency,
      paymentMethod,
      paymentStatus: paymentMethod === "venue" ? "not_required" : "pending",
      // createOrder mevcutta QR/Rezzy akışı için kullanılıyor → default "qr"
    });

    // MASAYI order_active yap
    await updateTable(rid, tableId, {
      hasActiveSession: true,
      sessionId: sid,
      status: "order_active",
    });

    if (paymentMethod === "venue") {
      s.totals.payAtVenueTotal += total;
      s.totals.grandTotal += total;
      s.lastOrderAt = new Date();
      await s.save();
      return res.json({ order: o, payment: null });
    }

    if (!stripe)
      return res.status(500).json({ message: "Stripe konfigüre değil." });

    const pi = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        kind: "qr_order",
        orderId: String(o._id),
        sessionId: String(s._id),
        restaurantId: rid,
        tableId: String(tableId),
      },
    });

    o.stripePaymentIntentId = pi.id;
    await o.save();

    s.lastOrderAt = new Date();
    await s.save();

    return res.json({
      order: o,
      payment: {
        paymentIntentId: pi.id,
        clientSecret: pi.client_secret,
        amount: total,
        currency,
      },
    });
  } catch (e) {
    console.error("[createOrder] err", e);
    return res.status(500).json({ message: "Sipariş oluşturulamadı." });
  }
}

export async function listSessionOrders(req, res) {
  try {
    const { sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Geçersiz session id." });
    }

    const list = await Order.find({ sessionId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(list);
  } catch (e) {
    console.error("[listSessionOrders] err", e);
    return res.status(500).json({ message: "Siparişler alınamadı." });
  }
}

export async function createStripeIntent(req, res) {
  try {
    const { orderId } = req.params;
    const { saveCard = true } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "Geçersiz orderId." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!stripe)
      return res.status(500).json({ message: "Stripe konfigüre değil." });

    let customerId = order.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { userId: String(order.userId || "guest") },
      });
      customerId = customer.id;
      order.stripeCustomerId = customerId;
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-06-20" }
    );

    let clientSecret = null;
    if (order.stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId
      );
      clientSecret = pi.client_secret;
    } else {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(order.total * 100),
        currency: String(order.currency || "TRY").toLowerCase(),
        automatic_payment_methods: { enabled: true },
        customer: customerId,
      });
      order.stripePaymentIntentId = pi.id;
      clientSecret = pi.client_secret;
    }

    await order.save();

    return res.json({
      paymentIntentClientSecret: clientSecret,
      customerId,
      ephemeralKey: ephemeralKey.secret,
    });
  } catch (e) {
    console.error("[createStripeIntent] err", e);
    return res.status(500).json({ message: "Stripe intent oluşturulamadı." });
  }
}

/**
 * ✅ WALK-IN SİPARİŞ OLUŞTURMA
 * Path: /api/orders/restaurants/:restaurantId/tables/:tableId/walk-in
 * - Session yoksa açar
 * - paymentMethod = "venue"
 * - totals/payAtVenueTotal & grandTotal güncellenir
 * - masa status = "order_active"
 * - source = "walk_in"
 */
export async function createWalkInOrder(req, res) {
  try {
    const { restaurantId, tableId } = req.params;
    const { items, guestName } = req.body || {};

    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: "Geçersiz restaurantId." });
    }
    if (!tableId) {
      return res.status(400).json({ message: "tableId zorunlu." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items zorunlu." });
    }

    const rid = String(restaurantId);
    const table = String(tableId);

    // 1) Açık session var mı?
    let s = await OrderSession.findOne({
      restaurantId: rid,
      tableId: table,
      status: "open",
    });

    // 2) Yoksa session aç
    if (!s) {
      const r = await Restaurant.findById(rid).lean();
      const currency = currencyFromRegion(r?.region);

      s = await OrderSession.create({
        restaurantId: rid,
        tableId: table,
        reservationId: null,
        currency,
      });

      await updateTable(rid, table, {
        hasActiveSession: true,
        sessionId: s._id,
        status: "order_active",
      });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    const currency = currencyFromRegion(restaurant?.region);

    const calcItems = items.map((x) => ({
      itemId: x.itemId,
      title: x.title,
      price: Number(x.price || 0),
      qty: Math.max(1, Number(x.qty || 1)),
      note: x.note || "",
    }));

    const total = calcItems.reduce((sum, it) => sum + it.price * it.qty, 0);

    const order = await Order.create({
      sessionId: s._id,
      restaurantId: rid,
      tableId: table,
      userId: null,              // walk-in → masaya oturan fiziksel müşteri
      isGuest: true,
      guestName: guestName || "",
      items: calcItems,
      total,
      currency,
      paymentMethod: "venue",
      paymentStatus: "not_required",
      source: "walk_in",
    });

    // 3) Session totals güncelle
    s.totals.payAtVenueTotal += total;
    s.totals.grandTotal += total;
    s.lastOrderAt = new Date();
    await s.save();

    // 4) Masa durumu
    await updateTable(rid, table, {
      hasActiveSession: true,
      sessionId: s._id,
      status: "order_active",
    });

    return res.json({
      order,
      sessionId: s._id,
      totals: s.totals,
    });
  } catch (e) {
    console.error("[createWalkInOrder] err", e);
    return res.status(500).json({ message: "Walk-in sipariş oluşturulamadı." });
  }
}