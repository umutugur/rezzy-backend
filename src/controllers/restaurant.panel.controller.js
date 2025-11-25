// src/controllers/restaurant.panel.controller.js
import mongoose from "mongoose";
import dayjs from "dayjs";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import Order from "../models/Order.js";
import OrderSession from "../models/OrderSession.js";
import TableServiceRequest from "../models/TableServiceRequest.js";

/** Yardımcı: param string’ini ObjectId yap */
const toObjectId = (id) => new mongoose.Types.ObjectId(id);

/** Masaya ait session’ı bulmak için helper */
const findSessionForTable = (sessions, table) => {
  const key1 = table?.name;
  const key2 = table?._id ? String(table._id) : null;

  return sessions.find(
    (s) =>
      String(s.tableId) === String(key1) ||
      (key2 && String(s.tableId) === key2)
  );
};

/** Masaya ait service request’leri bul */
const findRequestsForTable = (requests, table) => {
  const key1 = table?.name;
  const key2 = table?._id ? String(table._id) : null;

  return requests.filter(
    (r) =>
      String(r.tableId || "") === String(key1) ||
      (key2 && String(r.tableId || "") === key2)
  );
};

/** Status hesapla (session + request’lere göre, DB’ye yazmadan) */
const deriveTableStatus = (table, session, requests = []) => {
  let status = table?.status || "empty";

  if (!session) {
    status = "empty";
  } else {
    const grand = Number(session?.totals?.grandTotal || 0);
    status = grand > 0 ? "order_active" : "occupied";
  }

  if (requests.length > 0) {
    const hasBill = requests.some((r) => r.type === "bill");
    const hasWaiter = requests.some((r) => r.type === "waiter");
    if (hasBill) status = "bill_request";
    else if (hasWaiter) status = "waiter_call";
  }

  return status;
};

/** GET /api/panel/restaurants/:rid/reservations */
export const listReservationsForRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { from, to, status, page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const q = { restaurantId: toObjectId(rid) };
    if (status) q.status = status;

    if (from || to) {
      q.dateTimeUTC = {};
      if (from) q.dateTimeUTC.$gte = dayjs(from).startOf("day").toDate();
      if (to) q.dateTimeUTC.$lte = dayjs(to).endOf("day").toDate();
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [docs, total] = await Promise.all([
      Reservation.find(q)
        .sort({ dateTimeUTC: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate({ path: "userId", select: "name email" })
        .lean(),
      Reservation.countDocuments(q),
    ]);

    const pickUser = (r) => {
      if (r.userId) return { name: r.userId.name, email: r.userId.email };
      if (r.user && (r.user.name || r.user.email)) return r.user;
      if (r.customer && (r.customer.name || r.customer.email)) return r.customer;
      if (r.customerName || r.guestName || r.contactName || r.name) {
        return {
          name:
            r.customerName ||
            r.guestName ||
            r.contactName ||
            r.name ||
            null,
          email:
            r.customerEmail ||
            r.guestEmail ||
            r.contactEmail ||
            r.email ||
            null,
        };
      }
      return null;
    };

    const items = docs.map((r) => ({
      _id: r._id,
      dateTimeUTC: r.dateTimeUTC,
      partySize: r.partySize,
      totalPrice: r.totalPrice,
      depositAmount: r.depositAmount,
      status: r.status,
      receiptUrl: r.receiptUrl || null,
      userId: r.userId?._id?.toString() ?? null,
      user: pickUser(r) || undefined,
    }));

    res.json({
      items,
      total: Number(total),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    next(e);
  }
};

/** GET /api/panel/restaurants/:rid/insights
 *  Tarih aralığına göre sayılar/toplamlar
 */
export const getInsightsForRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { from, to } = req.query;

    const start = from ? dayjs(from).startOf("day") : dayjs().startOf("month");
    const end = to ? dayjs(to).endOf("day") : dayjs().endOf("month");

    const match = {
      restaurantId: toObjectId(rid),
      dateTimeUTC: { $gte: start.toDate(), $lte: end.toDate() },
    };

    const agg = await Reservation.aggregate([
      { $match: match },
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: "$status",
                c: { $sum: 1 },
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                gross: { $sum: "$totalPrice" },
                deposit: { $sum: "$depositAmount" },
              },
            },
          ],
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    date: "$dateTimeUTC",
                    format: "%Y-%m-%d",
                  },
                },
                count: { $sum: 1 },
                amount: { $sum: "$totalPrice" },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const countsObj = (agg[0]?.counts || []).reduce(
      (a, x) => ({ ...a, [x._id]: x.c }),
      {}
    );
    const totals = agg[0]?.totals?.[0] || { gross: 0, deposit: 0 };
    const byDay = (agg[0]?.byDay || []).map((x) => ({
      date: x._id,
      count: x.count,
      amount: x.amount,
    }));

    res.json({
      range: {
        from: start.format("YYYY-MM-DD"),
        to: end.format("YYYY-MM-DD"),
      },
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
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/panel/restaurants/:rid/tables/live
 * - Masaları, kat/pozisyon + anlık status ile döner
 * - status: empty / occupied / order_active / waiter_call / bill_request
 */
export const getTablesLive = async (req, res, next) => {
  try {
    const { rid } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) {
      return next({ status: 404, message: "Restoran bulunamadı" });
    }

    const [sessions, requests] = await Promise.all([
      OrderSession.find({
        restaurantId: toObjectId(rid),
        status: "open",
      }).lean(),
      TableServiceRequest.find({
        restaurantId: toObjectId(rid),
        status: "open",
      }).lean(),
    ]);

    const tables = (restaurant.tables || []).map((t) => {
      const session = findSessionForTable(sessions, t);
      const reqs = findRequestsForTable(requests, t);
      const status = deriveTableStatus(t, session, reqs);

      return {
        id: t._id,
        name: t.name,
        capacity: t.capacity ?? 2,
        isActive: t.isActive ?? true,
        floor: t.floor ?? 1,
        posX: t.posX ?? 0,
        posY: t.posY ?? 0,

        hasActiveSession: !!session,
        sessionId: session?._id ?? null,
        status,
        openServiceRequests: reqs.length,
        lastOrderAt: session?.lastOrderAt ?? null,
        totals: session?.totals || {
          cardTotal: 0,
          payAtVenueTotal: 0,
          grandTotal: 0,
        },
      };
    });

    res.json({ tables });
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/panel/restaurants/:rid/tables/layout
 * Body: { tables: [{ id, floor, posX, posY }] }
 * - Drag & drop sonrası layout güncellemek için
 */
export const updateTablesLayout = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { tables } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }
    if (!Array.isArray(tables)) {
      return next({ status: 400, message: "tables alanı zorunlu (array olmalı)" });
    }

    const restaurant = await Restaurant.findById(rid);
    if (!restaurant) {
      return next({ status: 404, message: "Restoran bulunamadı" });
    }

    const updatesById = new Map();
    for (const t of tables) {
      if (!t?.id) continue;
      updatesById.set(String(t.id), {
        floor: typeof t.floor === "number" ? t.floor : undefined,
        posX: typeof t.posX === "number" ? t.posX : undefined,
        posY: typeof t.posY === "number" ? t.posY : undefined,
      });
    }

    let changed = false;
    (restaurant.tables || []).forEach((tbl) => {
      const u = updatesById.get(String(tbl._id));
      if (!u) return;

      if (typeof u.floor === "number") {
        tbl.floor = u.floor;
        changed = true;
      }
      if (typeof u.posX === "number") {
        tbl.posX = u.posX;
        changed = true;
      }
      if (typeof u.posY === "number") {
        tbl.posY = u.posY;
        changed = true;
      }
    });

    if (changed) {
      await restaurant.save();
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/panel/restaurants/:rid/live-orders
 * - Açık adisyonlara bağlı tüm siparişleri listeler
 */
export const listLiveOrdersForRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const sessions = await OrderSession.find({
      restaurantId: toObjectId(rid),
      status: "open",
    }).lean();

    if (!sessions.length) {
      return res.json({ items: [] });
    }

    const sessionIds = sessions.map((s) => s._id);
    const sessionById = new Map(
      sessions.map((s) => [String(s._id), s])
    );

    const orders = await Order.find({
      sessionId: { $in: sessionIds },
    })
      .sort({ createdAt: -1 })
      .lean();

    const items = orders.map((o) => {
      const session = sessionById.get(String(o.sessionId));
      return {
        _id: o._id,
        sessionId: o.sessionId,
        tableId: o.tableId,
        restaurantId: o.restaurantId,
        createdAt: o.createdAt,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        total: o.total,
        currency: o.currency,
        items: o.items,
        sessionOpenedAt: session?.openedAt ?? null,
        sessionLastOrderAt: session?.lastOrderAt ?? null,
      };
    });

    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/panel/restaurants/:rid/tables/:tableKey/detail
 * - Masa detay + aktif adisyon + siparişler + açık servis istekleri
 */
export const getTableDetailForRestaurant = async (req, res, next) => {
  try {
    const { rid, tableKey } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) {
      return next({ status: 404, message: "Restoran bulunamadı" });
    }

    const tables = restaurant.tables || [];
    const table = tables.find(
      (t) => String(t._id) === String(tableKey) || t.name === tableKey
    );

    if (!table) {
      return next({ status: 404, message: "Masa bulunamadı" });
    }

    const tableNames = [table.name];
    if (table._id) tableNames.push(String(table._id));

    const [session, requests] = await Promise.all([
      OrderSession.findOne({
        restaurantId: toObjectId(rid),
        status: "open",
        tableId: { $in: tableNames },
      }).lean(),
      TableServiceRequest.find({
        restaurantId: toObjectId(rid),
        status: "open",
        tableId: { $in: tableNames },
      })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const orders = session
      ? await Order.find({ sessionId: session._id })
          .sort({ createdAt: 1 })
          .lean()
      : [];

    const status = deriveTableStatus(table, session, requests);

    res.json({
      table: {
        id: table._id,
        name: table.name,
        capacity: table.capacity ?? 2,
        floor: table.floor ?? 1,
        posX: table.posX ?? 0,
        posY: table.posY ?? 0,
        isActive: table.isActive ?? true,
        status,
        hasActiveSession: !!session,
      },
      session: session || null,
      totals: session?.totals || null,
      orders,
      serviceRequests: requests,
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/panel/restaurants/:rid/tables/:tableKey/close-session
 * - Masanın aktif adisyonunu kapatır, ilgili servis isteklerini handled yapar
 */
export const closeTableSessionForRestaurant = async (req, res, next) => {
  try {
    const { rid, tableKey } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) {
      return next({ status: 404, message: "Restoran bulunamadı" });
    }

    const tables = restaurant.tables || [];
    const table = tables.find(
      (t) => String(t._id) === String(tableKey) || t.name === tableKey
    );
    if (!table) {
      return next({ status: 404, message: "Masa bulunamadı" });
    }

    const tableNames = [table.name];
    if (table._id) tableNames.push(String(table._id));

    const session = await OrderSession.findOne({
      restaurantId: toObjectId(rid),
      status: "open",
      tableId: { $in: tableNames },
    });
    if (!session) {
      return next({ status: 404, message: "Açık adisyon bulunamadı" });
    }

    session.status = "closed";
    session.closedAt = new Date();
    await session.save();

    await TableServiceRequest.updateMany(
      {
        restaurantId: toObjectId(rid),
        tableId: { $in: tableNames },
        status: "open",
      },
      { $set: { status: "handled" } }
    );

    res.json({ ok: true, sessionId: session._id });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/panel/restaurants/:rid/tables/:tableKey/service/resolve
 * Body: { requestId?: string }
 * - Garson çağır / hesap iste servis isteklerini handled yapar
 */
export const resolveTableServiceRequests = async (req, res, next) => {
  try {
    const { rid, tableKey } = req.params;
    const { requestId } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) {
      return next({ status: 404, message: "Restoran bulunamadı" });
    }

    const tables = restaurant.tables || [];
    const table = tables.find(
      (t) => String(t._id) === String(tableKey) || t.name === tableKey
    );
    if (!table) {
      return next({ status: 404, message: "Masa bulunamadı" });
    }

    const tableNames = [table.name];
    if (table._id) tableNames.push(String(table._id));

    if (requestId && mongoose.Types.ObjectId.isValid(requestId)) {
      await TableServiceRequest.findOneAndUpdate(
        {
          _id: requestId,
          restaurantId: toObjectId(rid),
        },
        { $set: { status: "handled" } }
      );
    } else {
      await TableServiceRequest.updateMany(
        {
          restaurantId: toObjectId(rid),
          tableId: { $in: tableNames },
          status: "open",
        },
        { $set: { status: "handled" } }
      );
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};