// controllers/orders.controller.js
import mongoose from "mongoose";
import Stripe from "stripe";
import OrderSession from "../models/OrderSession.js";
import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";
import TableServiceRequest from "../models/TableServiceRequest.js"; // 🆕 eklendi

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

    // ✅ Bu session'a ait tüm siparişleri mutfak açısından "teslim edildi" yap
    await Order.updateMany(
      { sessionId: id, kitchenStatus: { $ne: "delivered" } },
      { $set: { kitchenStatus: "delivered" } }
    );

    // 🆕 Adisyon kapandığında bu session'a ait TÜM açık TableServiceRequest'leri kapat
    // (order_ready + waiter_call + bill_request ne varsa)
    try {
      await TableServiceRequest.updateMany(
        {
          sessionId: id,
          status: "open",
        },
        { $set: { status: "handled" } }
      );
    } catch (err) {
      console.error("[closeSession] TSR close err", err);
    }

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
      // createOrder mevcutta QR/Rezvix akışı için kullanılıyor → default "qr"
      kitchenStatus: "new",
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
      userId: null,
      isGuest: true,
      guestName: guestName || "",
      items: calcItems,
      total,
      currency,
      paymentMethod: "venue",
      paymentStatus: "not_required",
      source: "walk_in",
      kitchenStatus: "new",
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

/**
 * ✅ Mutfak ekranı için fiş listesi
 */
export async function listKitchenTickets(req, res) {
  try {
    const { restaurantId } = req.params;
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: "Geçersiz restaurantId." });
    }

    const rid = String(restaurantId);

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) {
      return res.status(404).json({ message: "Restoran bulunamadı." });
    }

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
      kitchenStatus: { $in: ["new", "preparing", "ready", "delivered"] },
    })
      .sort({ createdAt: 1 })
      .lean();

    const now = Date.now();

    const tickets = orders.map((o) => {
      const tableKey = String(o.tableId);
      const tableLabel = tableMap.get(tableKey) || tableKey;

      const createdAtMs = o.createdAt ? new Date(o.createdAt).getTime() : now;
      const minutesAgo = Math.max(
        0,
        Math.floor((now - createdAtMs) / (60 * 1000))
      );

      return {
        id: String(o._id),
        kitchenStatus: o.kitchenStatus || "new",
        tableId: tableKey,
        tableLabel,
        source: o.source || "qr",
        minutesAgo,
        items: (o.items || []).map((it) => ({
          title: it.title,
          qty: it.qty,
          note: it.note || "",
        })),
      };
    });

    return res.json({ tickets });
  } catch (e) {
    console.error("[listKitchenTickets] err", e);
    return res
      .status(500)
      .json({ message: "Mutfak fişleri alınamadı." });
  }
}

/**
 * 🔥 Mutfağın sipariş durumunu günceller (NEW → PREPARING → READY → DELIVERED)
 * READY olduğunda otomatik garson uyarısı (order_ready) açar
 * DELIVERED olduğunda kapatır ve masa rengini normale çeker
 */
export async function updateKitchenStatus(req, res) {
  try {
    const { orderId } = req.params;
    const { status } = req.body || {};

    // ❗ Güvenli durumlar
    const allowed = ["new", "preparing", "ready", "delivered"];
    if (!mongoose.Types.ObjectId.isValid(orderId) || !allowed.includes(status)) {
      return res.status(400).json({ message: "Geçersiz parametre." });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Sipariş bulunamadı." });

    order.kitchenStatus = status;
    await order.save();

    const rid = String(order.restaurantId);
    const tableId = String(order.tableId);
    const sessionId = String(order.sessionId);

    /* -------------------- READY OLDUĞUNDA -------------------- */
    if (status === "ready") {
      const existing = await TableServiceRequest.findOne({
        restaurantId: rid,
        tableId,
        sessionId,
        type: "order_ready",
        status: "open",
      });

      // ❗ Zaten açık değilse oluştur
      if (!existing) {
        await TableServiceRequest.create({
          restaurantId: rid,
          tableId,
          sessionId,
          type: "order_ready",
          status: "open",
        });

        // 🔥 Masa UI rengini waiter_call yap
        await Restaurant.updateOne(
          { _id: rid, "tables._id": tableId },
          { $set: { "tables.$.status": "waiter_call" } }
        );
      }
    }

    /* -------------------- TESLİM EDİLDİĞİNDE -------------------- */
    if (status === "delivered") {
      // order_ready isteklerini kapat
      await TableServiceRequest.updateMany(
        {
          restaurantId: rid,
          tableId,
          sessionId,
          type: "order_ready",
          status: "open",
        },
        { $set: { status: "handled" } }
      );

      // hâlâ açık başka istek var mı kontrol et
      const stillWaiting = await TableServiceRequest.exists({
        restaurantId: rid,
        tableId,
        status: "open",
      });

      // 🟢 yoksa masa normale dönsün
      if (!stillWaiting) {
        await Restaurant.updateOne(
          { _id: rid, "tables._id": tableId },
          { $set: { "tables.$.status": "order_active" } }
        );
      }
    }

    return res.json({ ok: true, status });
  } catch (e) {
    console.error("[updateKitchenStatus] err", e);
    return res.status(500).json({ message: "Durum güncellenemedi." });
  }
}