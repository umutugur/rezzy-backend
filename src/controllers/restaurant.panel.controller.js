// src/controllers/restaurant.panel.controller.js
import mongoose from "mongoose";
import dayjs from "dayjs";
import Reservation from "../models/Reservation.js";

/** GET /api/restaurants/:rid/reservations
 *  Panel listesi (sayfalı, filtreli)
 */
export const listReservationsForRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { from, to, status, page = 1, limit = 50 } = req.query;

    const q = { restaurantId: new mongoose.Types.ObjectId(rid) };
    if (status) q.status = status;

    if (from || to) {
      q.dateTimeUTC = {};
      if (from) q.dateTimeUTC.$gte = dayjs(from).startOf("day").toDate();
      if (to)   q.dateTimeUTC.$lte = dayjs(to).endOf("day").toDate();
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Reservation.find(q)
        .sort({ dateTimeUTC: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("userId", "name email")
        .lean(),
      Reservation.countDocuments(q),
    ]);

    res.json({
      items: items.map(r => ({
        _id: r._id,
        dateTimeUTC: r.dateTimeUTC,
        partySize: r.partySize,
        totalPrice: r.totalPrice,
        depositAmount: r.depositAmount,
        status: r.status,
        receiptUrl: r.receiptUrl,
        user: r.userId ? { name: r.userId.name, email: r.userId.email } : undefined,
      })),
      total: Number(total),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) { next(e); }
};

/** GET /api/restaurants/:rid/insights
 *  Tarih aralığına göre sayılar/toplamlar
 */
export const getInsightsForRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { from, to } = req.query;

    const start = from ? dayjs(from).startOf("day") : dayjs().startOf("month");
    const end   = to   ? dayjs(to).endOf("day")   : dayjs().endOf("month");

    const match = {
      restaurantId: new mongoose.Types.ObjectId(rid),
      dateTimeUTC: { $gte: start.toDate(), $lte: end.toDate() },
    };

    const agg = await Reservation.aggregate([
      { $match: match },
      {
        $facet: {
          counts: [{ $group: { _id: "$status", c: { $sum: 1 } } }],
          totals: [{ $group: { _id: null, gross: { $sum: "$totalPrice" }, deposit: { $sum: "$depositAmount" } } }],
          byDay: [
            { $group: { _id: { $dateToString: { date: "$dateTimeUTC", format: "%Y-%m-%d" } }, count: { $sum: 1 }, amount: { $sum: "$totalPrice" } } },
            { $sort: { _id: 1 } }
          ],
        }
      }
    ]);

    const countsObj = (agg[0]?.counts || []).reduce((a, x) => ({ ...a, [x._id]: x.c }), {});
    const totals = agg[0]?.totals?.[0] || { gross: 0, deposit: 0 };
    const byDay = (agg[0]?.byDay || []).map(x => ({ date: x._id, count: x.count, amount: x.amount }));

    res.json({
      range: { from: start.format("YYYY-MM-DD"), to: end.format("YYYY-MM-DD") },
      counts: {
        total: byDay.reduce((a, b) => a + b.count, 0),
        pending: countsObj.pending || 0,
        confirmed: countsObj.confirmed || 0,
        arrived: countsObj.arrived || 0,
        cancelled: countsObj.cancelled || 0,
      },
      totals: { gross: totals.gross || 0, deposit: totals.deposit || 0 },
      byDay,
    });
  } catch (e) { next(e); }
};
