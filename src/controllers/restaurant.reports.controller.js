// src/controllers/restaurant.reports.controller.js
import mongoose from "mongoose";
import dayjs from "dayjs";
import Reservation from "../models/Reservation.js";
import Order from "../models/Order.js";
import OrderSession from "../models/OrderSession.js";
import DeliveryOrder from "../models/DeliveryOrder.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/**
 * GET /api/panel/restaurants/:rid/reports/overview
 *
 * Query:
 *   from?: YYYY-MM-DD
 *   to?:   YYYY-MM-DD
 *
 * Dönenler:
 *   - Rezervasyon özetleri (status dağılımı, byDay vs.)
 *   - Sipariş özetleri (kanal dağılımı, byDay)
 *   - Saatlik sipariş & ciro (byHour)
 *   - En çok satan ürünler (topItems)
 *   - Adisyon / masa kullanımı (sessions + topTables)
 */
export const getRestaurantReportsOverview = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { from, to } = req.query;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const start = from
      ? dayjs(from).startOf("day")
      : dayjs().subtract(30, "day").startOf("day");
    const end = to ? dayjs(to).endOf("day") : dayjs().endOf("day");

    const restaurantId = toObjectId(rid);

    /* ---------------- Rezervasyon tarafı ---------------- */

    const reservationsMatch = {
      restaurantId,
      dateTimeUTC: { $gte: start.toDate(), $lte: end.toDate() },
    };

    const reservationsByStatusPipeline = [
      { $match: reservationsMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          depositTotal: { $sum: { $ifNull: ["$depositAmount", 0] } },
          revenueTotal: { $sum: { $ifNull: ["$totalPrice", 0] } },
        },
      },
    ];

    const reservationsByDayPipeline = [
      { $match: reservationsMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              date: "$dateTimeUTC",
              format: "%Y-%m-%d",
            },
          },
          reservations: { $sum: 1 },
          deposits: { $sum: { $ifNull: ["$depositAmount", 0] } },
          revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ];

    /* ---------------- Sipariş (Order) tarafı ---------------- */

    const ordersMatch = {
      restaurantId,
      createdAt: { $gte: start.toDate(), $lte: end.toDate() },
    };

    const ordersBySourcePipeline = [
      { $match: ordersMatch },
      {
        $group: {
          _id: "$source", // "walk_in" | "QR" | "REZVIX" vs.
          orderCount: { $sum: 1 },
          revenueTotal: { $sum: { $ifNull: ["$total", 0] } },
        },
      },
    ];

    const ordersByDayPipeline = [
      { $match: ordersMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              date: "$createdAt",
              format: "%Y-%m-%d",
            },
          },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$total", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ];

    // Saatlik satış (0–23)
    const ordersByHourPipeline = [
      { $match: ordersMatch },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$total", 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ];

    // En çok satan ürünler (top N)
    const topItemsPipeline = [
      { $match: ordersMatch },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            itemId: "$items.itemId",
            title: "$items.title",
          },
          qty: { $sum: { $ifNull: ["$items.qty", 0] } },
          revenue: {
            $sum: {
              $multiply: [
                { $ifNull: ["$items.qty", 0] },
                { $ifNull: ["$items.price", 0] },
              ],
            },
          },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 20 },
    ];

    /* ---------------- Masa / adisyon (OrderSession) tarafı ---------------- */

    const sessionsMatch = {
      restaurantId,
      openedAt: { $gte: start.toDate(), $lte: end.toDate() },
    };

    /* ---------------- Delivery Orders (DeliveryOrder) tarafı ---------------- */

    const deliveryMatch = {
      restaurantId,
      createdAt: { $gte: start.toDate(), $lte: end.toDate() },
    };

    // Status bazlı dağılım (pending / delivered / cancelled / ...)
    const deliveryByStatusPipeline = [
      { $match: deliveryMatch },
      {
        $group: {
          _id: "$status",
          orderCount: { $sum: 1 },
          grossRevenueTotal: { $sum: { $ifNull: ["$total", 0] } },
          // Net ciro: cancelled olmayan ve paymentStatus 'failed'/'cancelled' olmayanlar
          netRevenueTotal: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "cancelled"] },
                    { $ne: ["$paymentStatus", "failed"] },
                    { $ne: ["$paymentStatus", "cancelled"] },
                  ],
                },
                { $ifNull: ["$total", 0] },
                0,
              ],
            },
          },
        },
      },
    ];

    // Günlük dağılım (iptaller dahil görünsün)
    const deliveryByDayPipeline = [
      { $match: deliveryMatch },
      {
        $group: {
          _id: {
            $dateToString: {
              date: "$createdAt",
              format: "%Y-%m-%d",
            },
          },
          orders: { $sum: 1 },
          grossRevenue: { $sum: { $ifNull: ["$total", 0] } },
          netRevenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "cancelled"] },
                    { $ne: ["$paymentStatus", "failed"] },
                    { $ne: ["$paymentStatus", "cancelled"] },
                  ],
                },
                { $ifNull: ["$total", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ];

    // En çok satan ürünler (delivery) — iptal siparişleri hariç tut (satış datası net kalsın)
    const deliveryTopItemsPipeline = [
      {
        $match: {
          ...deliveryMatch,
          status: { $ne: "cancelled" },
          paymentStatus: { $nin: ["failed", "cancelled"] },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: {
            itemId: "$items.itemId",
            title: "$items.itemTitle",
          },
          qty: { $sum: { $ifNull: ["$items.qty", 0] } },
          revenue: { $sum: { $ifNull: ["$items.lineTotal", 0] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 20 },
    ];

    const [
      reservationsByStatus,
      reservationsByDay,
      ordersBySource,
      ordersByDay,
      ordersByHourRaw,
      topItemsRaw,
      sessions,
      deliveryByStatus,
      deliveryByDay,
      deliveryTopItemsRaw,
    ] = await Promise.all([
      Reservation.aggregate(reservationsByStatusPipeline),
      Reservation.aggregate(reservationsByDayPipeline),
      Order.aggregate(ordersBySourcePipeline),
      Order.aggregate(ordersByDayPipeline),
      Order.aggregate(ordersByHourPipeline),
      Order.aggregate(topItemsPipeline),
      OrderSession.find(sessionsMatch).lean(),
      DeliveryOrder.aggregate(deliveryByStatusPipeline),
      DeliveryOrder.aggregate(deliveryByDayPipeline),
      DeliveryOrder.aggregate(deliveryTopItemsPipeline),
    ]);

    /* ---------------- Rezervasyon özetleri ---------------- */

    const statusMap = reservationsByStatus.reduce((acc, row) => {
      acc[row._id || "unknown"] = row;
      return acc;
    }, {});

    const resTotalCount = reservationsByStatus.reduce(
      (a, r) => a + (r.count || 0),
      0
    );
    const resTotalDeposit = reservationsByStatus.reduce(
      (a, r) => a + (r.depositTotal || 0),
      0
    );
    const resTotalRevenue = reservationsByStatus.reduce(
      (a, r) => a + (r.revenueTotal || 0),
      0
    );

    /* ---------------- Sipariş özetleri ---------------- */

    const ordersSourceMap = ordersBySource.reduce((acc, row) => {
      const key = (row._id || "UNKNOWN").toString().toUpperCase();
      acc[key] = row;
      return acc;
    }, {});

    const ordersTotalCount = ordersBySource.reduce(
      (a, r) => a + (r.orderCount || 0),
      0
    );
    const ordersTotalRevenue = ordersBySource.reduce(
      (a, r) => a + (r.revenueTotal || 0),
      0
    );

    const ordersByHour = ordersByHourRaw.map((h) => ({
      hour: h._id, // 0–23
      orders: h.orders,
      revenue: h.revenue,
    }));

    const topItems = topItemsRaw.map((r) => ({
      itemId: r._id.itemId || null,
      title: r._id.title || "",
      qty: r.qty || 0,
      revenue: r.revenue || 0,
    }));

    /* ---------------- Delivery sipariş özetleri ---------------- */

    const deliveryStatusMap = (deliveryByStatus || []).reduce((acc, row) => {
      const key = (row._id || "unknown").toString();
      acc[key] = row;
      return acc;
    }, {});

    const deliveryTotalCount = (deliveryByStatus || []).reduce(
      (a, r) => a + (r.orderCount || 0),
      0
    );

    const deliveryGrossRevenueTotal = (deliveryByStatus || []).reduce(
      (a, r) => a + (r.grossRevenueTotal || 0),
      0
    );

    const deliveryNetRevenueTotal = (deliveryByStatus || []).reduce(
      (a, r) => a + (r.netRevenueTotal || 0),
      0
    );

    const deliveryTopItems = (deliveryTopItemsRaw || []).map((r) => ({
      itemId: r._id?.itemId || null,
      title: r._id?.title || "",
      qty: r.qty || 0,
      revenue: r.revenue || 0,
    }));

    /* ---------------- Masa / adisyon özetleri ---------------- */

    let totalSessions = sessions.length;
    let closedSessions = 0;
    let totalDurationMs = 0;

    let cardTotal = 0;
    let payAtVenueTotal = 0;
    let grandTotal = 0;

    const tableMap = new Map(); // tableId -> { tableId, sessionCount, revenueTotal }

    for (const s of sessions) {
      const totals = s.totals || {};
      cardTotal += Number(totals.cardTotal || 0);
      payAtVenueTotal += Number(totals.payAtVenueTotal || 0);
      grandTotal += Number(totals.grandTotal || 0);

      if (s.closedAt && s.openedAt) {
        closedSessions += 1;
        totalDurationMs +=
          new Date(s.closedAt).getTime() -
          new Date(s.openedAt).getTime();
      }

      const key = String(s.tableId || "UNKNOWN");
      const entry = tableMap.get(key) || {
        tableId: key,
        sessionCount: 0,
        revenueTotal: 0,
      };
      entry.sessionCount += 1;
      entry.revenueTotal += Number(totals.grandTotal || 0);
      tableMap.set(key, entry);
    }

    const avgSessionDurationMinutes =
      closedSessions > 0
        ? Math.round(totalDurationMs / closedSessions / 60000)
        : 0;

    const topTables = Array.from(tableMap.values())
      .sort((a, b) => b.revenueTotal - a.revenueTotal)
      .slice(0, 20);

    /* ---------------- Response shape ---------------- */

    res.json({
      range: {
        from: start.format("YYYY-MM-DD"),
        to: end.format("YYYY-MM-DD"),
      },

      // Rezervasyonlar (Rezvix tarafı)
      reservations: {
        totalCount: resTotalCount,
        statusCounts: {
          pending: statusMap.pending?.count || 0,
          confirmed: statusMap.confirmed?.count || 0,
          arrived: statusMap.arrived?.count || 0,
          cancelled: statusMap.cancelled?.count || 0,
          no_show: statusMap.no_show?.count || 0,
        },
        depositTotal: resTotalDeposit,
        revenueTotal: resTotalRevenue,
        byDay: reservationsByDay.map((d) => ({
          date: d._id,
          reservations: d.reservations,
          deposits: d.deposits,
          revenue: d.revenue,
        })),
      },

      // QR + WALK_IN + REZVIX siparişleri (masa/menü tarafı)
      orders: {
        totalCount: ordersTotalCount,
        revenueTotal: ordersTotalRevenue,
        bySource: {
          WALK_IN: ordersSourceMap.WALK_IN?.revenueTotal || 0,
          QR: ordersSourceMap.QR?.revenueTotal || 0,
          REZVIX: ordersSourceMap.REZVIX?.revenueTotal || 0,
          UNKNOWN: ordersSourceMap.UNKNOWN?.revenueTotal || 0,
        },
        countsBySource: {
          WALK_IN: ordersSourceMap.WALK_IN?.orderCount || 0,
          QR: ordersSourceMap.QR?.orderCount || 0,
          REZVIX: ordersSourceMap.REZVIX?.orderCount || 0,
          UNKNOWN: ordersSourceMap.UNKNOWN?.orderCount || 0,
        },
        byDay: ordersByDay.map((d) => ({
          date: d._id,
          orders: d.orders,
          revenue: d.revenue,
        })),
        byHour: ordersByHour, // ⏰ saatlik sipariş & ciro (0–23)
        topItems,             // 🔝 en çok satan ürünler
      },

      // Delivery siparişleri (paket servis) — iptaller dahil görünür
      delivery: {
        totalCount: deliveryTotalCount,
        // Brüt ve net ayrımı: net ciro, iptal/failed hariç
        grossRevenueTotal: deliveryGrossRevenueTotal,
        revenueTotal: deliveryNetRevenueTotal,
        statusCounts: {
          new: deliveryStatusMap.new?.orderCount || 0,
          accepted: deliveryStatusMap.accepted?.orderCount || 0,
          on_the_way: deliveryStatusMap.on_the_way?.orderCount || 0,
          delivered: deliveryStatusMap.delivered?.orderCount || 0,
          cancelled: deliveryStatusMap.cancelled?.orderCount || 0,
        },
        byDay: (deliveryByDay || []).map((d) => ({
          date: d._id,
          orders: d.orders,
          grossRevenue: d.grossRevenue,
          revenue: d.netRevenue,
        })),
        topItems: deliveryTopItems,
      },

      // Masa / adisyon kullanımı
      tables: {
        totalSessions,
        closedSessions,
        avgSessionDurationMinutes, // Ortalama oturma süresi (dakika)
        payments: {
          cardTotal,
          payAtVenueTotal,
          grandTotal,
        },
        topTables, // { tableId, sessionCount, revenueTotal }[]
      },
    });
  } catch (e) {
    next(e);
  }
};