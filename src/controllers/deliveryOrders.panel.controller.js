import mongoose from "mongoose";
import DeliveryOrder from "../models/DeliveryOrder.js";
import Restaurant from "../models/Restaurant.js";

function mustObjectId(v, code, message) {
  if (!mongoose.Types.ObjectId.isValid(String(v))) throw { status: 400, code, message };
  return String(v);
}

async function loadOrderOrThrow(rid, orderId) {
  const o = await DeliveryOrder.findById(orderId).lean();
  if (!o) throw { status: 404, code: "ORDER_NOT_FOUND", message: "Sipariş bulunamadı." };
  if (String(o.restaurantId) !== String(rid)) throw { status: 403, code: "FORBIDDEN", message: "Forbidden" };
  return o;
}

// list
export async function panelListDeliveryOrders(req, res, next) {
  try {
    const rid = mustObjectId(req.params.rid, "RESTAURANT_ID_INVALID", "rid geçersiz.");

    const rows = await DeliveryOrder.find({ restaurantId: rid })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const r = await Restaurant.findById(rid).select("name").lean();

    const items = rows.map((o) => ({
      _id: String(o._id),
      status: o.status,
      createdAt: o.createdAt,
      restaurantName: r?.name || null,
      shortCode: o.shortCode || null,
      subtotal: o.subtotal,
      deliveryFee: o.deliveryFee,
      total: o.total,
      addressText: o.addressText || null,
      customerNote: o.customerNote || null,
      items: o.items || [],
    }));

    return res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
}

function ensureNotDelivered(o) {
  if (String(o.status) === "delivered") {
    throw { status: 400, code: "ORDER_ALREADY_DELIVERED", message: "Teslim edilmiş sipariş güncellenemez." };
  }
  if (String(o.status) === "cancelled") {
    throw { status: 400, code: "ORDER_CANCELLED", message: "İptal edilmiş sipariş güncellenemez." };
  }
}

export async function panelAcceptDeliveryOrder(req, res, next) {
  try {
    const rid = mustObjectId(req.params.rid, "RESTAURANT_ID_INVALID", "rid geçersiz.");
    const orderId = mustObjectId(req.params.orderId, "ORDER_ID_INVALID", "orderId geçersiz.");

    const o = await loadOrderOrThrow(rid, orderId);
    ensureNotDelivered(o);

    if (o.status !== "new") {
      throw { status: 400, code: "INVALID_TRANSITION", message: "Bu sipariş onaylanamaz." };
    }

    await DeliveryOrder.updateOne(
      { _id: orderId, restaurantId: rid },
      { $set: { status: "accepted", acceptedAt: new Date() } }
    );

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function panelSetOnTheWay(req, res, next) {
  try {
    const rid = mustObjectId(req.params.rid, "RESTAURANT_ID_INVALID", "rid geçersiz.");
    const orderId = mustObjectId(req.params.orderId, "ORDER_ID_INVALID", "orderId geçersiz.");

    const o = await loadOrderOrThrow(rid, orderId);
    ensureNotDelivered(o);

    if (o.status !== "accepted") {
      throw { status: 400, code: "INVALID_TRANSITION", message: "Bu sipariş yola çıktı yapılamaz." };
    }

    await DeliveryOrder.updateOne(
      { _id: orderId, restaurantId: rid },
      { $set: { status: "on_the_way", onTheWayAt: new Date() } }
    );

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function panelSetDelivered(req, res, next) {
  try {
    const rid = mustObjectId(req.params.rid, "RESTAURANT_ID_INVALID", "rid geçersiz.");
    const orderId = mustObjectId(req.params.orderId, "ORDER_ID_INVALID", "orderId geçersiz.");

    const o = await loadOrderOrThrow(rid, orderId);
    ensureNotDelivered(o);

    if (o.status !== "on_the_way") {
      throw { status: 400, code: "INVALID_TRANSITION", message: "Bu sipariş teslim edildi yapılamaz." };
    }

    await DeliveryOrder.updateOne(
      { _id: orderId, restaurantId: rid },
      { $set: { status: "delivered", deliveredAt: new Date() } }
    );

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function panelCancelDeliveryOrder(req, res, next) {
  try {
    const rid = mustObjectId(req.params.rid, "RESTAURANT_ID_INVALID", "rid geçersiz.");
    const orderId = mustObjectId(req.params.orderId, "ORDER_ID_INVALID", "orderId geçersiz.");

    const o = await loadOrderOrThrow(rid, orderId);
    ensureNotDelivered(o); // delivered/cancelled değilse iptal serbest

    await DeliveryOrder.updateOne(
      { _id: orderId, restaurantId: rid },
      { $set: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "restaurant" } }
    );

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}