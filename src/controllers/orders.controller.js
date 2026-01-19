// src/controllers/orders.controller.js
import mongoose from "mongoose";
import Stripe from "stripe";
import OrderSession from "../models/OrderSession.js";
import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";
import TableServiceRequest from "../models/TableServiceRequest.js";
import Reservation from "../models/Reservation.js";
import { buildItemsWithModifiersOrThrow } from "../services/modifierPricing.service.js";

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;

function currencyFromRegion(region) {
  if (String(region || "").toUpperCase() === "UK") return "GBP";
  return "TRY";
}

function hasRestaurantAccess(reqUser, rid) {
  if (!reqUser) return false;
  const role = String(reqUser.role || "").toLowerCase();
  const ridStr = String(rid || "");

  if (role === "admin") return true;

  if (role === "restaurant") {
    if (String(reqUser.restaurantId || "") === ridStr) return true;

    const rms = Array.isArray(reqUser.restaurantMemberships) ? reqUser.restaurantMemberships : [];
    return rms.some((m) => String(m?.restaurantId || m?.restaurant || "") === ridStr);
  }

  return false;
}

async function updateTable(restaurantId, tableId, patch) {
  if (!restaurantId || !tableId) return;
  try {
    await Restaurant.updateOne(
      { _id: restaurantId, "tables._id": tableId },
      { $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`tables.$.${k}`, v])) }
    );
  } catch (err) {
    console.error("[orders.updateTable] err", err);
  }
}

async function findClosestReservationForUser(restaurantId, userId) {
  try {
    if (!restaurantId || !userId) return null;

    const rid = new mongoose.Types.ObjectId(restaurantId);
    const uid = new mongoose.Types.ObjectId(userId);

    const candidates = await Reservation.find({
      restaurantId: rid,
      userId: uid,
      status: { $in: ["pending", "confirmed", "arrived"] },
    })
      .sort({ dateTimeUTC: 1 })
      .lean();

    if (!candidates.length) return null;

    const now = Date.now();
    let best = null;
    let bestDiffMin = Infinity;

    for (const r of candidates) {
      if (!r.dateTimeUTC) continue;
      const diffMs = Math.abs(new Date(r.dateTimeUTC).getTime() - now);
      const diffMin = diffMs / 60000;
      if (diffMin < bestDiffMin) {
        bestDiffMin = diffMin;
        best = r;
      }
    }

    if (!best || bestDiffMin > 720) return null;
    return best._id;
  } catch (err) {
    console.error("[findClosestReservationForUser] err", err);
    return null;
  }
}

export async function openSession(req, res) {
  try {
    const { restaurantId, tableId, reservationId } = req.body || {};
    if (!restaurantId || !tableId) {
      return res.status(400).json({ message: "restaurantId ve tableId zorunlu." });
    }

    const rid = String(restaurantId);
    const table = String(tableId);
    const uid = req.user?._id || req.user?.id;

    let resolvedReservationId = null;

    if (reservationId && mongoose.Types.ObjectId.isValid(reservationId)) {
      resolvedReservationId = reservationId;
    } else if (uid) {
      const matchId = await findClosestReservationForUser(rid, uid);
      if (matchId) resolvedReservationId = matchId;
    }

    let s = await OrderSession.findOne({ restaurantId: rid, tableId: table, status: "open" });

    if (s) {
      if (!s.reservationId && resolvedReservationId) {
        s.reservationId = resolvedReservationId;
        await s.save();
      }
      return res.json({ sessionId: s._id });
    }

    const r = await Restaurant.findById(rid).lean();
    const currency = currencyFromRegion(r?.region);

    s = await OrderSession.create({
      restaurantId: rid,
      tableId: table,
      reservationId:
        resolvedReservationId && mongoose.Types.ObjectId.isValid(resolvedReservationId) ? resolvedReservationId : null,
      currency,
    });

    await updateTable(rid, table, { hasActiveSession: true, sessionId: s._id, status: "order_active" });

    return res.json({ sessionId: s._id });
  } catch (e) {
    console.error("[openSession] err", e);
    return res.status(500).json({ message: "Session açılamadı." });
  }
}

export async function getSession(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Geçersiz session id." });

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
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Geçersiz session id." });

    const s = await OrderSession.findByIdAndUpdate(id, { $set: { status: "closed", closedAt: new Date() } }, { new: true });
    if (!s) return res.status(404).json({ message: "Session bulunamadı." });

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

    await Order.updateMany({ sessionId: id, kitchenStatus: { $ne: "delivered" } }, { $set: { kitchenStatus: "delivered" } });

    try {
      await TableServiceRequest.updateMany({ sessionId: id, status: "open" }, { $set: { status: "handled" } });
    } catch (err) {
      console.error("[closeSession] TSR close err", err);
    }

    return res.json(s);
  } catch (e) {
    console.error("[closeSession] err", e);
    return res.status(500).json({ message: "Session kapatılamadı." });
  }
}

/**
 * ✅ QR / masa siparişi (server-authoritative + modifier snapshot)
 *
 * Beklenen items formatı:
 * items: [{ itemId, qty, note, selectedModifiers: [{ groupId, optionIds: [] }] }]
 */
export async function createOrder(req, res) {
  try {
    const { sessionId, restaurantId, tableId, items, paymentMethod, isGuest, guestName } = req.body || {};

    if (!sessionId || !restaurantId || !tableId) {
      return res.status(400).json({ message: "sessionId, restaurantId, tableId zorunlu." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items zorunlu." });
    }
    if (!["card", "venue"].includes(paymentMethod)) {
      return res.status(400).json({ message: "paymentMethod card veya venue olmalı." });
    }

    const sid = String(sessionId);
    const rid = String(restaurantId);
    const uid = req.user?._id || req.user?.id;

    const s = await OrderSession.findById(sid);
    if (!s || s.status !== "open") {
      return res.status(404).json({ message: "Açık adisyon bulunamadı." });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) return res.status(404).json({ message: "Restoran bulunamadı." });

    const currency = currencyFromRegion(restaurant?.region);

    // ✅ Tek otorite: server build + validate + snapshot
    const { builtItems, subtotal } = await buildItemsWithModifiersOrThrow({
      restaurant,
      items,
    });

    const total = subtotal;

    const o = await Order.create({
      sessionId: sid,
      restaurantId: rid,
      tableId: String(tableId),

      userId: uid ?? null,
      isGuest: !!isGuest || !uid,
      guestName: String(guestName || ""),

      items: builtItems.map((it) => ({
        itemId: it.itemId,
        itemTitle: it.itemTitle,
        basePrice: it.basePrice,
        quantity: it.quantity,
        selectedModifiers: it.selectedModifiers,
        note: it.note,

        unitModifiersTotal: it.unitModifiersTotal,
        unitTotal: it.unitTotal,
        lineTotal: it.lineTotal,
      })),

      total,
      currency,
      paymentMethod,
      paymentStatus: paymentMethod === "venue" ? "not_required" : "pending",

      status: "new",
      kitchenStatus: "new",
      source: "qr",
      stripePaymentIntentId: null,
    });

    await updateTable(rid, tableId, { hasActiveSession: true, sessionId: sid, status: "order_active" });

    if (paymentMethod === "venue") {
      s.totals.payAtVenueTotal += total;
      s.totals.grandTotal += total;
      s.lastOrderAt = new Date();
      await s.save();
      return res.json({ order: o, payment: null });
    }

    if (!stripe) {
      return res.status(500).json({ message: "Stripe konfigüre değil." });
    }

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
    const status = Number(e?.status || 500);
    const message = e?.message || "Sipariş oluşturulamadı.";
    return res.status(status).json({ message, code: e?.code || "ORDER_CREATE_FAILED", meta: e?.meta });
  }
}

export async function listSessionOrders(req, res) {
  try {
    const { sessionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: "Geçersiz session id." });
    }

    const list = await Order.find({ sessionId }).sort({ createdAt: -1 }).lean();
    return res.json(list);
  } catch (e) {
    console.error("[listSessionOrders] err", e);
    return res.status(500).json({ message: "Siparişler alınamadı." });
  }
}

export async function createStripeIntent(req, res) {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) return res.status(400).json({ message: "Geçersiz orderId." });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!stripe) return res.status(500).json({ message: "Stripe konfigüre değil." });

    let customerId = order.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { userId: String(order.userId || "guest") } });
      customerId = customer.id;
      order.stripeCustomerId = customerId;
    }

    const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: "2024-06-20" });

    let clientSecret = null;
    if (order.stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
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
 * ✅ WALK-IN (server-authoritative + modifier snapshot)
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

    let s = await OrderSession.findOne({ restaurantId: rid, tableId: table, status: "open" });

    if (!s) {
      const r = await Restaurant.findById(rid).lean();
      const currency = currencyFromRegion(r?.region);

      s = await OrderSession.create({ restaurantId: rid, tableId: table, reservationId: null, currency });

      await updateTable(rid, table, { hasActiveSession: true, sessionId: s._id, status: "order_active" });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) return res.status(404).json({ message: "Restoran bulunamadı." });
    const currency = currencyFromRegion(restaurant?.region);

    const { builtItems, subtotal } = await buildItemsWithModifiersOrThrow({
      restaurant,
      items,
    });

    const total = subtotal;

    const order = await Order.create({
      sessionId: s._id,
      restaurantId: rid,
      tableId: table,
      userId: null,
      isGuest: true,
      guestName: String(guestName || ""),

      items: builtItems.map((it) => ({
        itemId: it.itemId,
        itemTitle: it.itemTitle,
        basePrice: it.basePrice,
        quantity: it.quantity,
        selectedModifiers: it.selectedModifiers,
        note: it.note,
        unitModifiersTotal: it.unitModifiersTotal,
        unitTotal: it.unitTotal,
        lineTotal: it.lineTotal,
      })),

      total,
      currency,
      paymentMethod: "venue",
      paymentStatus: "not_required",
      source: "walk_in",
      status: "new",
      kitchenStatus: "new",
    });

    s.totals.payAtVenueTotal += total;
    s.totals.grandTotal += total;
    s.lastOrderAt = new Date();
    await s.save();

    await updateTable(rid, table, { hasActiveSession: true, sessionId: s._id, status: "order_active" });

    return res.json({ order, sessionId: s._id, totals: s.totals });
  } catch (e) {
    console.error("[createWalkInOrder] err", e);
    const status = Number(e?.status || 500);
    const message = e?.message || "Walk-in sipariş oluşturulamadı.";
    return res.status(status).json({ message, code: e?.code || "WALKIN_CREATE_FAILED", meta: e?.meta });
  }
}

/**
 * ✅ Mutfak fiş listesi — modifier snapshot’ı da göstermek istersen burada formatlayabilirsin.
 */
export async function listKitchenTickets(req, res) {
  try {
    const { restaurantId } = req.params;
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: "Geçersiz restaurantId." });
    }

    const rid = String(restaurantId);

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) return res.status(404).json({ message: "Restoran bulunamadı." });

    const tableMap = new Map();
    (restaurant.tables || []).forEach((t) => {
      if (!t) return;
      const key = String(t._id || t.name);
      const label = t.displayName || t.label || t.name || key;
      tableMap.set(key, label);
    });

    const orders = await Order.find({
      restaurantId: rid,
      status: { $ne: "cancelled" },
      paymentStatus: { $in: ["paid", "not_required"] },
      kitchenStatus: { $in: ["new", "preparing", "ready", "delivered"] },
    })
      .sort({ createdAt: 1 })
      .lean();

    const now = Date.now();

    const tickets = orders.map((o) => {
      const tableKey = String(o.tableId);
      const tableLabel = tableMap.get(tableKey) || tableKey;

      const createdAtMs = o.createdAt ? new Date(o.createdAt).getTime() : now;
      const minutesAgo = Math.max(0, Math.floor((now - createdAtMs) / (60 * 1000)));

      return {
        id: String(o._id),
        kitchenStatus: o.kitchenStatus || "new",
        tableId: tableKey,
        tableLabel,
        source: o.source || "qr",
        minutesAgo,
        items: (o.items || []).map((it) => ({
          title: it.itemTitle,
          qty: it.quantity,
          note: it.note || "",
          modifiers: it.selectedModifiers || [],
        })),
      };
    });

    return res.json({ tickets });
  } catch (e) {
    console.error("[listKitchenTickets] err", e);
    return res.status(500).json({ message: "Mutfak fişleri alınamadı." });
  }
}

export async function updateKitchenStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status } = req.body || {};

    const allowed = ["new", "preparing", "ready", "delivered"];
    if (!mongoose.Types.ObjectId.isValid(orderId) || !allowed.includes(status)) {
      return res.status(400).json({ message: "Geçersiz parametre." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Sipariş bulunamadı." });

    if (order.paymentStatus && !["paid", "not_required"].includes(String(order.paymentStatus))) {
      return res.status(400).json({ message: "Ödeme tamamlanmadan sipariş durumu güncellenemez." });
    }

    order.kitchenStatus = status;
    await order.save();

    const rid = String(order.restaurantId);
    const tableId = String(order.tableId);
    const sessionId = String(order.sessionId);

    if (status === "ready") {
      const existing = await TableServiceRequest.findOne({
        restaurantId: rid,
        tableId,
        sessionId,
        type: "order_ready",
        status: "open",
      });

      if (!existing) {
        await TableServiceRequest.create({ restaurantId: rid, tableId, sessionId, type: "order_ready", status: "open" });
        await Restaurant.updateOne({ _id: rid, "tables._id": tableId }, { $set: { "tables.$.status": "waiter_call" } });
      }
    }

    if (status === "delivered") {
      await TableServiceRequest.updateMany(
        { restaurantId: rid, tableId, sessionId, type: "order_ready", status: "open" },
        { $set: { status: "handled" } }
      );

      const stillWaiting = await TableServiceRequest.exists({ restaurantId: rid, tableId, status: "open" });
      if (!stillWaiting) {
        await Restaurant.updateOne({ _id: rid, "tables._id": tableId }, { $set: { "tables.$.status": "order_active" } });
      }
    }

    return res.json({ ok: true, status });
  } catch (e) {
    console.error("[updateKitchenStatus] err", e);
    return res.status(500).json({ message: "Durum güncellenemedi." });
  }
}

export async function cancelOrder(req, res, next) {
  const orderId = String(req.params.orderId || "").trim();
  const ridParam = String(req.params.restaurantId || req.params.rid || "").trim();

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    return res.status(400).json({ message: "Geçersiz order id." });
  }

  if (ridParam) {
    if (!hasRestaurantAccess(req.user, ridParam)) {
      return res.status(403).json({ message: "Bu restoran için yetkin yok." });
    }
  }

  const session = await mongoose.startSession();

  try {
    let outOrder = null;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw { status: 404, message: "Sipariş bulunamadı." };

      const rid = String(order.restaurantId);

      if (ridParam && rid !== ridParam) throw { status: 403, message: "Bu sipariş bu restorana ait değil." };

      if (!ridParam) {
        const role = String(req.user?.role || "").toLowerCase();
        if (role === "restaurant" && !hasRestaurantAccess(req.user, rid)) {
          throw { status: 403, message: "Bu restoran için yetkin yok." };
        }
      }

      if (order.status === "cancelled") {
        outOrder = order;
        return;
      }

      if (String(order.kitchenStatus || "") === "delivered") {
        throw { status: 400, message: "Teslim edilmiş sipariş iptal edilemez." };
      }

      if (String(order.paymentMethod || "") === "card" && String(order.paymentStatus || "") === "paid") {
        throw { status: 400, message: "Ödenmiş (kart) sipariş iptal edilemez." };
      }

      order.status = "cancelled";
      await order.save({ session });

      const os = await OrderSession.findById(order.sessionId).session(session);
      if (os) {
        const amt = Number(order.total || 0);

        if (String(order.paymentMethod || "") === "card") {
          os.totals.cardTotal = Math.max(0, Number(os.totals.cardTotal || 0) - amt);
        } else {
          os.totals.payAtVenueTotal = Math.max(0, Number(os.totals.payAtVenueTotal || 0) - amt);
        }

        os.totals.grandTotal = Math.max(0, Number(os.totals.cardTotal || 0) + Number(os.totals.payAtVenueTotal || 0));

        const last = await Order.findOne({ sessionId: os._id, status: { $ne: "cancelled" } })
          .sort({ createdAt: -1 })
          .select({ createdAt: 1 })
          .session(session);

        os.lastOrderAt = last?.createdAt ?? null;
        await os.save({ session });
      }

      outOrder = order;
    });

    return res.json({ ok: true, order: outOrder });
  } catch (err) {
    if (typeof next === "function" && err && typeof err === "object" && "status" in err) return next(err);

    const status = Number(err?.status || 500);
    const message = err?.message || "Sipariş iptal edilemedi.";
    console.error("[cancelOrder] err", err);
    return res.status(status).json({ message });
  } finally {
    session.endSession();
  }
}