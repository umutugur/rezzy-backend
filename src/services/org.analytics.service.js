// src/services/org.analytics.service.js
import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import Order from "../models/Order.js";
import Reservation from "../models/Reservation.js";

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

export function resolveRange({ preset, from, to }) {
  const now = new Date();

  if (from || to) {
    const start = from ? new Date(from) : new Date("1970-01-01T00:00:00.000Z");
    const end = to ? new Date(to) : now;
    return { start, end };
  }

  const d = new Date(now);
  if (preset === "day") d.setDate(d.getDate() - 1);
  else if (preset === "week") d.setDate(d.getDate() - 7);
  else if (preset === "month") d.setMonth(d.getMonth() - 1);
  else if (preset === "year") d.setFullYear(d.getFullYear() - 1);
  else d.setDate(d.getDate() - 30);

  return { start: d, end: now };
}

/**
 * ORDER revenue rules (sende):
 * - card: paymentStatus must be "paid"
 * - venue: paymentStatus typically "not_required" (nakit/venue)
 * - cancelled status excluded
 */
function orderRevenueMatch() {
  return {
    status: { $ne: "cancelled" },
    $or: [
      { paymentMethod: "card", paymentStatus: "paid" },
      { paymentMethod: "venue", paymentStatus: "not_required" },
    ],
  };
}

function reservationActiveMatch() {
  // "başarılı" dediğin: confirmed + arrived
  return { status: { $in: ["confirmed", "arrived"] } };
}

function reservationNoShowMatch() {
  return { status: "no_show" };
}

function reservationCancelledMatch() {
  return { status: "cancelled" };
}

async function getOrgRestaurantIds(organizationId) {
  const oid = toObjectId(organizationId);
  if (!oid) throw Object.assign(new Error("Invalid organizationId"), { status: 400 });

  const rows = await Restaurant.find({ organizationId: oid }, { _id: 1 }).lean();
  return rows.map((r) => r._id);
}

export async function orgSummary({ organizationId, start, end }) {
  const restaurantIds = await getOrgRestaurantIds(organizationId);

  const orderMatch = {
    restaurantId: { $in: restaurantIds },
    createdAt: { $gte: start, $lte: end },
    ...orderRevenueMatch(),
  };

  const resBase = {
    restaurantId: { $in: restaurantIds },
    createdAt: { $gte: start, $lte: end },
  };

  const [ordersAgg, resActiveAgg, resNoShowAgg, resCancelledAgg, depositAgg] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: null,
          ordersCount: { $sum: 1 },
          salesTotal: { $sum: { $ifNull: ["$total", 0] } },
        },
      },
    ]),
    Reservation.aggregate([
      { $match: { ...resBase, ...reservationActiveMatch() } },
      { $group: { _id: null, reservationsCount: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: { ...resBase, ...reservationNoShowMatch() } },
      { $group: { _id: null, noShowCount: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: { ...resBase, ...reservationCancelledMatch() } },
      { $group: { _id: null, cancelledCount: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      {
        $match: {
          ...resBase,
          $or: [{ depositPaid: true }, { depositStatus: "paid" }],
        },
      },
      {
        $group: {
          _id: null,
          // paidAmount varsa onu, yoksa depositAmount
          depositPaidTotal: {
            $sum: {
              $ifNull: ["$paidAmount", "$depositAmount"],
            },
          },
          depositPaidCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    range: { start, end },
    totals: {
      salesTotal: ordersAgg?.[0]?.salesTotal ?? 0,
      ordersCount: ordersAgg?.[0]?.ordersCount ?? 0,

      reservationsCount: resActiveAgg?.[0]?.reservationsCount ?? 0,
      noShowCount: resNoShowAgg?.[0]?.noShowCount ?? 0,
      cancelledCount: resCancelledAgg?.[0]?.cancelledCount ?? 0,

      depositPaidTotal: depositAgg?.[0]?.depositPaidTotal ?? 0,
      depositPaidCount: depositAgg?.[0]?.depositPaidCount ?? 0,
    },
  };
}

export async function orgTimeseries({
  organizationId,
  start,
  end,
  tz = "Europe/Istanbul",
  bucket = "day",
  metric = "sales", // sales | orders | reservations | no_show | cancelled | deposits
}) {
  const restaurantIds = await getOrgRestaurantIds(organizationId);

  const unit = ({ hour: "hour", day: "day", week: "week", month: "month" }[bucket] || "day");

  // ORDER metrics
  if (metric === "sales" || metric === "orders") {
    const match = {
      restaurantId: { $in: restaurantIds },
      createdAt: { $gte: start, $lte: end },
      ...orderRevenueMatch(),
    };

    const valueExpr = metric === "sales"
      ? { $sum: { $ifNull: ["$total", 0] } }
      : { $sum: 1 };

    const points = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateTrunc: { date: "$createdAt", unit, timezone: tz },
          },
          value: valueExpr,
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, t: "$_id", value: 1 } },
    ]);

    return { range: { start, end, tz }, bucket: unit, metric, points };
  }

  // RESERVATION metrics
  const resMatchBase = {
    restaurantId: { $in: restaurantIds },
    createdAt: { $gte: start, $lte: end },
  };

  let resMatch = resMatchBase;
  let valueExpr = { $sum: 1 };

  if (metric === "reservations") resMatch = { ...resMatchBase, ...reservationActiveMatch() };
  else if (metric === "no_show") resMatch = { ...resMatchBase, ...reservationNoShowMatch() };
  else if (metric === "cancelled") resMatch = { ...resMatchBase, ...reservationCancelledMatch() };
  else if (metric === "deposits") {
    resMatch = {
      ...resMatchBase,
      $or: [{ depositPaid: true }, { depositStatus: "paid" }],
    };
    valueExpr = {
      $sum: { $ifNull: ["$paidAmount", "$depositAmount"] },
    };
  } else {
    // default: reservations(active)
    resMatch = { ...resMatchBase, ...reservationActiveMatch() };
  }

  const points = await Reservation.aggregate([
    { $match: resMatch },
    {
      $group: {
        _id: { $dateTrunc: { date: "$createdAt", unit, timezone: tz } },
        value: valueExpr,
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, t: "$_id", value: 1 } },
  ]);

  return { range: { start, end, tz }, bucket: unit, metric, points };
}

export async function orgTopRestaurants({
  organizationId,
  start,
  end,
  metric = "sales", // sales | orders | reservations
  limit = 10,
}) {
  const oid = toObjectId(organizationId);
  if (!oid) throw Object.assign(new Error("Invalid organizationId"), { status: 400 });

  const restaurants = await Restaurant.find(
    { organizationId: oid },
    { _id: 1, name: 1 }
  ).lean();

  const ids = restaurants.map((r) => r._id);
  const nameMap = new Map(restaurants.map((r) => [String(r._id), r.name]));

  if (ids.length === 0) return { range: { start, end }, metric, rows: [] };

  if (metric === "sales" || metric === "orders") {
    const match = {
      restaurantId: { $in: ids },
      createdAt: { $gte: start, $lte: end },
      ...orderRevenueMatch(),
    };

    const valueExpr = metric === "sales"
      ? { $sum: { $ifNull: ["$total", 0] } }
      : { $sum: 1 };

    const rows = await Order.aggregate([
      { $match: match },
      { $group: { _id: "$restaurantId", value: valueExpr } },
      { $sort: { value: -1 } },
      { $limit: Math.max(1, Math.min(100, Number(limit) || 10)) },
    ]);

    return {
      range: { start, end },
      metric,
      rows: rows.map((x) => ({
        restaurantId: x._id,
        restaurantName: nameMap.get(String(x._id)) || "",
        value: x.value,
      })),
    };
  }

  // reservations
  const rows = await Reservation.aggregate([
    {
      $match: {
        restaurantId: { $in: ids },
        createdAt: { $gte: start, $lte: end },
        ...reservationActiveMatch(),
      },
    },
    { $group: { _id: "$restaurantId", value: { $sum: 1 } } },
    { $sort: { value: -1 } },
    { $limit: Math.max(1, Math.min(100, Number(limit) || 10)) },
  ]);

  return {
    range: { start, end },
    metric,
    rows: rows.map((x) => ({
      restaurantId: x._id,
      restaurantName: nameMap.get(String(x._id)) || "",
      value: x.value,
    })),
  };
}

export async function restaurantSummary({ restaurantId, start, end }) {
  const rid = toObjectId(restaurantId);
  if (!rid) throw Object.assign(new Error("Invalid restaurantId"), { status: 400 });

  const orderMatch = {
    restaurantId: rid,
    createdAt: { $gte: start, $lte: end },
    ...orderRevenueMatch(),
  };

  const resBase = { restaurantId: rid, createdAt: { $gte: start, $lte: end } };

  const [ordersAgg, resActiveAgg, resNoShowAgg, resCancelledAgg, depositAgg] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      { $group: { _id: null, ordersCount: { $sum: 1 }, salesTotal: { $sum: { $ifNull: ["$total", 0] } } } },
    ]),
    Reservation.aggregate([
      { $match: { ...resBase, ...reservationActiveMatch() } },
      { $group: { _id: null, reservationsCount: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: { ...resBase, ...reservationNoShowMatch() } },
      { $group: { _id: null, noShowCount: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: { ...resBase, ...reservationCancelledMatch() } },
      { $group: { _id: null, cancelledCount: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: { ...resBase, $or: [{ depositPaid: true }, { depositStatus: "paid" }] } },
      {
        $group: {
          _id: null,
          depositPaidTotal: { $sum: { $ifNull: ["$paidAmount", "$depositAmount"] } },
          depositPaidCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  return {
    range: { start, end },
    totals: {
      salesTotal: ordersAgg?.[0]?.salesTotal ?? 0,
      ordersCount: ordersAgg?.[0]?.ordersCount ?? 0,

      reservationsCount: resActiveAgg?.[0]?.reservationsCount ?? 0,
      noShowCount: resNoShowAgg?.[0]?.noShowCount ?? 0,
      cancelledCount: resCancelledAgg?.[0]?.cancelledCount ?? 0,

      depositPaidTotal: depositAgg?.[0]?.depositPaidTotal ?? 0,
      depositPaidCount: depositAgg?.[0]?.depositPaidCount ?? 0,
    },
  };
}