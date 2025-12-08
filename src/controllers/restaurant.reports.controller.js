// src/controllers/restaurant.reports.controller.js
import mongoose from "mongoose";
import dayjs from "dayjs";
import Reservation from "../models/Reservation.js";
import Order from "../models/Order.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/**
 * GET /api/panel/restaurants/:rid/reports/overview
 *
 * - Tarih aralığına göre:
 *   • Rezervasyon status dağılımı (pending/confirmed/arrived/cancelled/no_show)
 *   • Rezervasyonlardan gelen toplam ciro + depozito
 *   • Gün bazlı rezervasyon & depozito serisi (grafik için)
 *   • QR / WALK_IN / REZVIX sipariş ciroları + adet
 *   • Gün bazlı sipariş cirosu (grafik için)
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
          depositTotal: { $sum: "$depositAmount" },
          revenueTotal: { $sum: "$totalPrice" },
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
          deposits: { $sum: "$depositAmount" },
          revenue: { $sum: "$totalPrice" },
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
          _id: "$source", // "walk_in" | "qr" | "rezvix" vs.
          orderCount: { $sum: 1 },
          revenueTotal: { $sum: "$total" },
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
          revenue: { $sum: "$total" },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const [
      reservationsByStatus,
      reservationsByDay,
      ordersBySource,
      ordersByDay,
    ] = await Promise.all([
      Reservation.aggregate(reservationsByStatusPipeline),
      Reservation.aggregate(reservationsByDayPipeline),
      Order.aggregate(ordersBySourcePipeline),
      Order.aggregate(ordersByDayPipeline),
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
      const key = (row._id || "unknown").toUpperCase();
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
      },
    });
  } catch (e) {
    next(e);
  }
};