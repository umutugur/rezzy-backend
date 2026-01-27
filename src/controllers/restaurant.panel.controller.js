// src/controllers/restaurant.panel.controller.js
import mongoose from "mongoose";
import dayjs from "dayjs";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import Order from "../models/Order.js";
import OrderSession from "../models/OrderSession.js";
import TableServiceRequest from "../models/TableServiceRequest.js";
import { notifyUser } from "../services/notification.service.js";

/** Yardımcı: param string’ini güvenli ObjectId yap (invalid ise null) */
const toObjectId = (id) => {
  try {
    const v = String(id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(v)) return null;
    return new mongoose.Types.ObjectId(v);
  } catch {
    return null;
  }
};

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

  // 🔹 Önce temel state: boş / dolu / sipariş var
  if (!session) {
    status = "empty";
  } else {
    const grand = Number(session?.totals?.grandTotal || 0);
    status = grand > 0 ? "order_active" : "occupied";
  }

  // 🔹 Servis istekleri varsa override et
  if (requests.length > 0) {
    const hasBill = requests.some((r) => r.type === "bill");
    const hasWaiter = requests.some((r) => r.type === "waiter");
    const hasOrderReady = requests.some((r) => r.type === "order_ready");

    if (hasBill) {
      // 🧾 Hesap istendi → en yüksek öncelik
      status = "bill_request";
    } else if (hasWaiter) {
      // 🧑‍🍳 Garson çağrısı
      status = "waiter_call";
    } else if (hasOrderReady) {
      // 🟡 Sadece sipariş hazır ise ayrı state
      status = "order_ready";
    }
  }

  return status;
};
const resolveDisplayNameForRestaurantPanel = (r, user) => {
  // 1) Rezervasyon dokümanındaki doğrudan isim alanları
  const directName =
    (r.displayName && String(r.displayName).trim()) ||
    (r.guestName && String(r.guestName).trim()) ||
    (r.customerName && String(r.customerName).trim()) ||
    (r.contactName && String(r.contactName).trim()) ||
    (r.name && String(r.name).trim());

  if (directName) return directName;

  // 2) user objesinden gelen isim / e-posta
  if (user?.name && String(user.name).trim()) return String(user.name).trim();
  if (user?.email && String(user.email).trim()) return String(user.email).trim();

  // 3) Son çare
  return "İsimsiz misafir";
};

/** GET /api/panel/restaurants/:rid/reservations */
export const listReservationsForRestaurant = async (req, res, next) => {
  try {
    const { rid } = req.params;
    const { from, to, status, page = 1, limit = 50 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const ridObj = toObjectId(rid);
    if (!ridObj) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const q = { restaurantId: ridObj };
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
        // İstersen burada "phone" da ekleyebiliriz, şimdilik gerek yok:
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

    const items = docs.map((r) => {
      const user = pickUser(r);

      // displayName ve guestName'i burada normalleştiriyoruz
      const displayName = resolveDisplayNameForRestaurantPanel(r, user);
      const guestName =
        (r.guestName && String(r.guestName).trim()) ||
        (r.customerName && String(r.customerName).trim()) ||
        (r.contactName && String(r.contactName).trim()) ||
        null;

      return {
        _id: r._id,
        dateTimeUTC: r.dateTimeUTC,
        partySize: r.partySize,
        totalPrice: r.totalPrice,
        depositAmount: r.depositAmount,
        status: r.status,
        receiptUrl: r.receiptUrl || null,

        userId: r.userId?._id?.toString() ?? null,
        user: user || undefined,

        // 🔑 RezvixOrdersPage Row tipiyle uyumlu yeni alanlar:
        displayName,
        guestName,
      };
    });

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

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const ridObj = toObjectId(rid);
    if (!ridObj) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const start = from ? dayjs(from).startOf("day") : dayjs().startOf("month");
    const end = to ? dayjs(to).endOf("day") : dayjs().endOf("month");

    const match = {
      restaurantId: ridObj,
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
 * - status: empty / occupied / order_active / waiter_call / bill_request / order_ready
 */
export const getTablesLive = async (req, res, next) => {
  try {
    const { rid } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const ridObj = toObjectId(rid);
    if (!ridObj) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const restaurant = await Restaurant.findById(rid).lean();
    if (!restaurant) {
      return next({ status: 404, message: "Restoran bulunamadı" });
    }

    const [sessions, requests] = await Promise.all([
      OrderSession.find({
        restaurantId: ridObj,
        status: "open",
      }).lean(),
      TableServiceRequest.find({
        restaurantId: ridObj,
        status: "open",
      }).lean(),
    ]);

    // 🔎 sessionId -> "WALK_IN" | "REZVIX" | "QR"
    const sessionChannelMap = new Map();

    if (sessions.length > 0) {
      const sessionIds = sessions.map((s) => s._id);

      const orders = await Order.find({
        sessionId: { $in: sessionIds },
      })
        .select("sessionId source")
        .lean();

      // 1) Rezervasyon bağlı session → REZVIX (en yüksek öncelik)
      for (const s of sessions) {
        if (s.reservationId) {
          sessionChannelMap.set(String(s._id), "REZVIX");
        }
      }

      // 2) Sipariş kaynağına göre kanal:
      // ÖNCELİK: REZVIX > QR > WALK_IN
      for (const o of orders) {
        const sid = String(o.sessionId || "");
        if (!sid) continue;

        const current = sessionChannelMap.get(sid); // "REZVIX" | "QR" | "WALK_IN" | undefined

        // REZVIX hiçbir durumda override edilmez
        if (current === "REZVIX") continue;

        if (o.source === "walk_in") {
          // WALK_IN sadece henüz kanal atanmadıysa yazılsın
          if (!current) {
            sessionChannelMap.set(sid, "WALK_IN");
          }
          continue;
        }

        if (o.source === "rezvix") {
          // İleride ayrı sipariş kaynağı olarak kullanırsan:
          // REZVIX her zaman en yüksek öncelik
          sessionChannelMap.set(sid, "REZVIX");
          continue;
        }

        // Geri kalan her şey (undefined, "qr" vs.) → QR kabul et
        // QR, WALK_IN'i override edebilir ama REZVIX'i edemez
        if (!current || current === "WALK_IN") {
          sessionChannelMap.set(sid, "QR");
        }
      }
    }

    const tables = (restaurant.tables || []).map((t) => {
      const session = findSessionForTable(sessions, t);
      const reqs = findRequestsForTable(requests, t);
      const status = deriveTableStatus(t, session, reqs);

      // 🔐 Bu masaya ait session varsa, önceden hesaplanan kanalı çek
      let channel = null;
      if (session) {
        const ch = sessionChannelMap.get(String(session._id));
        if (ch === "WALK_IN" || ch === "REZVIX" || ch === "QR") {
          channel = ch;
        }
      }

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
        // 💜 canlı masalar için kaynak bilgisi
        channel, // null | "WALK_IN" | "REZVIX" | "QR"
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

    const ridObj = toObjectId(rid);
    if (!ridObj) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const sessions = await OrderSession.find({
      restaurantId: ridObj,
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
 * - Masa detay + aktif adisyon + siparişler + açık servis istekleri (+ varsa Rezvix rezervasyonu)
 */
export const getTableDetailForRestaurant = async (req, res, next) => {
  try {
    const { rid, tableKey } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const ridObj = toObjectId(rid);
    if (!ridObj) {
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
        restaurantId: ridObj,
        status: "open",
        tableId: { $in: tableNames },
      }).lean(),
      TableServiceRequest.find({
        restaurantId: ridObj,
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

    // 🟣 Varsa, bu session'a bağlı Rezvix rezervasyonunu da çek
    let reservationPayload = null;

    if (session?.reservationId) {
      const reservation = await Reservation.findById(session.reservationId)
        .populate({ path: "userId", select: "name email" })
        .lean();

      if (reservation) {
        // listReservationsForRestaurant'taki mantıkla aynı şekilde displayName türet
        const user =
          reservation.userId &&
          (reservation.userId.name || reservation.userId.email)
            ? {
                name: reservation.userId.name,
                email: reservation.userId.email,
              }
            : null;

        const displayName = resolveDisplayNameForRestaurantPanel(
          reservation,
          user
        );

        const guestName =
          (reservation.guestName &&
            String(reservation.guestName).trim()) ||
          (reservation.customerName &&
            String(reservation.customerName).trim()) ||
          (reservation.contactName &&
            String(reservation.contactName).trim()) ||
          null;

        reservationPayload = {
          _id: reservation._id,
          dateTimeUTC: reservation.dateTimeUTC,
          partySize: reservation.partySize,
          depositAmount: reservation.depositAmount,
          status: reservation.status,
          displayName,
          guestName,
        };
      }
    }

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
      // 🆕 Rezvix şeridi için
      reservation: reservationPayload,
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

    const ridObj = toObjectId(rid);
    if (!ridObj) {
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
      restaurantId: ridObj,
      status: "open",
      tableId: { $in: tableNames },
    });
    if (!session) {
      return next({ status: 404, message: "Açık adisyon bulunamadı" });
    }

    session.status = "closed";
    session.closedAt = new Date();
    await session.save();

    // 🔁 Bu adisyona ait mutfak siparişlerini SERVED (delivered) yap
    await Order.updateMany(
      {
        restaurantId: ridObj,
        sessionId: session._id,
        kitchenStatus: { $ne: "delivered" },
      },
      { $set: { kitchenStatus: "delivered" } }
    );

    await TableServiceRequest.updateMany(
      {
        restaurantId: ridObj,
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

    const ridObj = toObjectId(rid);
    if (!ridObj) {
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
          restaurantId: ridObj,
        },
        { $set: { status: "handled" } }
      );
    } else {
      await TableServiceRequest.updateMany(
        {
          restaurantId: ridObj,
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

/**
 * POST /api/panel/restaurants/:rid/tables/:tableKey/order-ready
 * - Self servis için "sipariş hazır" bildirimi gönderir
 */
export const notifyOrderReadyForTable = async (req, res, next) => {
  try {
    const { rid, tableKey } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rid)) {
      return next({ status: 400, message: "Geçersiz restoran id" });
    }

    const ridObj = toObjectId(rid);
    if (!ridObj) {
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
      restaurantId: ridObj,
      status: "open",
      tableId: { $in: tableNames },
    }).lean();

    if (!session) {
      return next({ status: 404, message: "Açık adisyon bulunamadı" });
    }

    const orders = await Order.find({
      sessionId: session._id,
      status: { $ne: "cancelled" },
      paymentStatus: { $in: ["paid", "not_required"] },
    }).lean();

    if (!orders.length) {
      return next({ status: 400, message: "Bu masa için aktif sipariş bulunamadı." });
    }

    // ✅ Aynı session için açık "order_ready" yoksa oluştur
    const existingReady = await TableServiceRequest.findOne({
      restaurantId: ridObj,
      tableId: { $in: tableNames },
      sessionId: session._id,
      type: "order_ready",
      status: "open",
    });

    if (!existingReady) {
      await TableServiceRequest.create({
        restaurantId: ridObj,
        tableId: String(session.tableId || table.name),
        sessionId: session._id,
        type: "order_ready",
        status: "open",
      });
    }

    const userIds = [
      ...new Set(
        orders
          .map((o) => o.userId)
          .filter(Boolean)
          .map((id) => String(id))
      ),
    ];

    if (!userIds.length) {
      return res.json({ ok: true, notifiedUsers: 0, reason: "no_users" });
    }

    const title = "Siparişin hazır";
    const body = `Masa ${table.name} için siparişin hazırlandı. Teslim almak için gel.`;
    const keyBase = Date.now();

    const results = await Promise.all(
      userIds.map(async (uid) => {
        try {
          await notifyUser(uid, {
            title,
            body,
            data: {
              type: "order_ready",
              restaurantId: String(restaurant._id),
              tableId: String(table._id || table.name),
              tableName: table.name,
              sessionId: String(session._id),
            },
            key: `order-ready:${session._id}:${uid}:${keyBase}`,
            type: "order_ready",
          });
          return true;
        } catch (err) {
          console.warn("[notifyOrderReadyForTable] notifyUser warn:", err?.message || err);
          return false;
        }
      })
    );

    const notifiedUsers = results.filter(Boolean).length;
    return res.json({ ok: true, notifiedUsers });
  } catch (e) {
    next(e);
  }
};
