// controllers/admin.controller.js
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";
import Review from "../models/Review.js";
import Complaint from "../models/Complaint.js";
import { ensureRestaurantForOwner } from "../services/restaurantOwner.service.js";

function toObjectId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}
function parseDateRange(q) {
  const start = q.start ? new Date(q.start + "T00:00:00.000Z") : null;
  const end   = q.end   ? new Date(q.end   + "T23:59:59.999Z") : null;
  const dt = {};
  if (start) dt.$gte = start;
  if (end)   dt.$lte = end;
  return { start, end, dt };
}
function pageParams(q) {
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));
  const cursor = q.cursor ? toObjectId(q.cursor) : null;
  return { limit, cursor };
}
function nextCursor(items, limit) {
  return items.length > limit ? String(items[limit - 1]?._id || "") : undefined;
}
function cut(items, limit) { return items.slice(0, limit); }

async function kpiAggregate(match) {
  const rows = await Reservation.aggregate([
    { $match: match },
    { $group: {
        _id: "$status",
        c: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        deposits:{ $sum: { $ifNull: ["$depositAmount", 0] } },
      }
    }
  ]);
  const by = new Map(rows.map(r => [r._id, r]));
  const total = rows.reduce((a,r)=>a + (r.c||0), 0);
  const revenue = rows.reduce((a,r)=>a + (r.revenue||0), 0);
  const deposits= rows.reduce((a,r)=>a + (r.deposits||0), 0);
  const confirmed = by.get("confirmed")?.c || 0;
  const arrived   = by.get("arrived")?.c || 0;
  const cancelled = by.get("cancelled")?.c || 0;
  return {
    reservations: {
      total,
      pending:  by.get("pending")?.c   || 0,
      confirmed,
      arrived,
      cancelled,
      no_show:  by.get("no_show")?.c   || 0,
    },
    revenue,
    deposits,
    rates: {
      confirm: total ? Number((confirmed / total).toFixed(3)) : 0,
      checkin: confirmed ? Number((arrived / confirmed).toFixed(3)) : 0,
      cancel:  total ? Number((cancelled / total).toFixed(3)) : 0,
    }
  };
}

async function kpiSeries(match, groupBy="day") {
  let dateFmt = "%Y-%m-%d";
  if (groupBy === "month") dateFmt = "%Y-%m";
  if (groupBy === "week")  dateFmt = "%G-W%V";
  const rows = await Reservation.aggregate([
    { $match: match },
    { $group: {
        _id: { $dateToString: { format: dateFmt, date: "$dateTimeUTC" } },
        c: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        arrived: { $sum: { $cond:[{ $eq:["$status","arrived"] }, 1, 0] } },
      }
    },
    { $sort: { _id: 1 } }
  ]);
  const labels = rows.map(r => r._id);
  return {
    labels,
    reservations: rows.map(r => r.c),
    revenue: rows.map(r => r.revenue),
    arrived: rows.map(r => r.arrived),
  };
}

// --- Komisyon yardımcıları (EXTRA RULE: underattendance) ---
/**
 * Commission base:
 *  if underattended == true => minPrice(selections.price) * arrivedCount
 *  else                      => totalPrice
 * Then multiply by commissionRate (restaurant).
 */
function commissionBaseExpr() {
  return {
    $cond: [
      { $eq: ["$underattended", true] },
      { $multiply: [
          { $ifNull: ["$arrivedCount", 0] },
          {
            $let: {
              vars: {
                prices: {
                  $map: {
                    input: { $ifNull: ["$selections", []] },
                    as: "s",
                    in: { $ifNull: ["$$s.price", 0] }
                  }
                }
              },
              in: { $cond: [
                { $gt: [ { $size: "$$prices" }, 0 ] },
                { $min: "$$prices" },
                0
              ] }
            }
          }
        ] },
      { $ifNull: ["$totalPrice", 0] }
    ]
  };
}

async function commissionTotals(match) {
  const rows = await Reservation.aggregate([
    { $match: match },
    { $lookup: {
        from: "restaurants",
        localField: "restaurantId",
        foreignField: "_id",
        as: "rest"
    }},
    { $addFields: {
        _rate: { $ifNull: [ { $arrayElemAt: ["$rest.commissionRate", 0] }, 0.05 ] },
        _base: commissionBaseExpr()
    }},
    { $group: {
        _id: null,
        commission: { $sum: { $multiply: ["$_base", "$_rate"] } },
        revenue:    { $sum: { $ifNull: ["$totalPrice", 0] } },
        count:      { $sum: 1 }
    }}
  ]);
  const r = rows[0] || { commission: 0, revenue: 0, count: 0 };
  return { total: r.commission || 0, revenue: r.revenue || 0, count: r.count || 0 };
}

async function commissionByRestaurant(match) {
  const rows = await Reservation.aggregate([
    { $match: match },
    { $lookup: {
        from: "restaurants",
        localField: "restaurantId",
        foreignField: "_id",
        as: "rest"
    }},
    { $addFields: {
        _rate: { $ifNull: [ { $arrayElemAt: ["$rest.commissionRate", 0] }, 0.05 ] },
        _name: { $ifNull: [ { $arrayElemAt: ["$rest.name", 0] }, "(Restoran)" ] },
        _base: commissionBaseExpr()
    }},
    { $group: {
        _id: "$restaurantId",
        name: { $first: "$_name" },
        commission: { $sum: { $multiply: ["$_base", "$_rate"] } },
        revenue:    { $sum: { $ifNull: ["$totalPrice", 0] } },
        count:      { $sum: 1 }
    }},
    { $sort: { commission: -1 } }
  ]);
  return rows.map(r => ({
    restaurantId: r._id,
    name: r.name,
    commission: r.commission || 0,
    revenue: r.revenue || 0,
    count: r.count || 0,
  }));
}

// ---------- KPI ----------
export const kpiGlobal = async (req,res,next)=>{
  try{
    const { start, end, dt } = parseDateRange(req.query);
    const groupBy = req.query.groupBy || "day";
    const match = {};
    if (start || end) match.dateTimeUTC = dt;
    const totals = await kpiAggregate(match);
    const series = await kpiSeries(match, groupBy);

    // ✅ komisyonlar
    const commissionsTotal = await commissionTotals(match);
    const commissionsBreakdown = await commissionByRestaurant(match);

    res.json({
      range:{start:req.query.start||null,end:req.query.end||null,groupBy},
      totals: { ...totals, commission: commissionsTotal.total },
      series,
      commissions: {
        total: commissionsTotal.total,
        byRestaurant: commissionsBreakdown
      }
    });
  }catch(e){ next(e); }
};

export const kpiByRestaurant = async (req,res,next)=>{
  try{
    const rid = toObjectId(req.params.rid);
    if (!rid) return res.status(400).json({message:"Invalid restaurant id"});
    const { start, end, dt } = parseDateRange(req.query);
    const groupBy = req.query.groupBy || "day";
    const match = { restaurantId: rid };
    if (start || end) match.dateTimeUTC = dt;
    const totals = await kpiAggregate(match);
    const series = await kpiSeries(match, groupBy);
    const commissionsTotal = await commissionTotals(match);

    res.json({
      range:{start:req.query.start||null,end:req.query.end||null,groupBy},
      totals: { ...totals, commission: commissionsTotal.total },
      series,
      commissions: { total: commissionsTotal.total }
    });
  }catch(e){ next(e); }
};

export const kpiByUser = async (req,res,next)=>{
  try{
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({message:"Invalid user id"});
    const { start, end, dt } = parseDateRange(req.query);
    const groupBy = req.query.groupBy || "day";
    const match = { userId: uid };
    if (start || end) match.dateTimeUTC = dt;
    const totals = await kpiAggregate(match);
    const series = await kpiSeries(match, groupBy);
    res.json({ range:{start:req.query.start||null,end:req.query.end||null,groupBy}, totals, series });
  }catch(e){ next(e); }
};

// ---------- Restaurants ----------
export const listRestaurants = async (req,res,next)=>{
  try{
    const { query, city } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const q = {};
    if (query) q.name = { $regex: String(query), $options: "i" };
    if (city) q.city = { $regex: String(city), $options: "i" };
    if (cursor) q._id = { $lt: cursor };

    const rows = await Restaurant.find(q).sort({_id:-1}).limit(limit+1)
      .select("_id name city owner commissionRate")
      .lean();

    res.json({
      items: cut(rows, limit),
      nextCursor: nextCursor(rows, limit),
    });
  }catch(e){ next(e); }
};

export const getRestaurantDetail = async (req,res,next)=>{
  try{
    const r = await Restaurant.findById(req.params.rid)
      .select("_id name city address owner settings depositAmount depositRate depositType commissionRate")
      .lean();
    if (!r) return res.status(404).json({message:"Restaurant not found"});
    res.json(r);
  }catch(e){ next(e); }
};

export const listReservationsByRestaurantAdmin = async (req, res, next) => {
  try {
    const { status, start, end } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const rid = toObjectId(req.params.rid);
    if (!rid) return res.status(400).json({ message: "Invalid restaurant id" });

    const { dt } = parseDateRange({ start, end });

    const q = { restaurantId: rid };
    if (status) q.status = status;
    if (cursor) q._id = { $lt: cursor };
    if (start || end) q.dateTimeUTC = dt;

    const rows = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({ path: "userId", select: "name email" })
      .lean();

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

    const sliced = cut(rows, limit);
    const items = sliced.map((r) => ({
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
      nextCursor: nextCursor(rows, limit),
    });
  } catch (e) {
    next(e);
  }
};


// ✅ Komisyon oranı güncelle
export const updateRestaurantCommission = async (req,res,next)=>{
  try{
    const rid = toObjectId(req.params.rid);
    if (!rid) return res.status(400).json({message:"Invalid restaurant id"});
    let { commissionRate } = req.body || {};
    if (commissionRate == null) return res.status(400).json({message:"commissionRate is required"});

    // Yüzde veya oran kabul et: 5 -> 0.05 ; 0.05 -> 0.05
    commissionRate = Number(commissionRate);
    if (Number.isNaN(commissionRate)) return res.status(400).json({message:"Invalid commissionRate"});
    if (commissionRate > 1) commissionRate = commissionRate / 100;
    commissionRate = Math.max(0, Math.min(1, commissionRate));

    const r = await Restaurant.findByIdAndUpdate(rid, { $set: { commissionRate } }, { new: true })
      .select("_id name commissionRate").lean();
    if (!r) return res.status(404).json({message:"Restaurant not found"});
    res.json({ ok:true, restaurant:r });
  }catch(e){ next(e); }
};

// ---------- Users ----------
export const listUsers = async (req,res,next)=>{
  try{
    const { query, role, banned } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const q = {};
    if (query) {
      q.$or = [
        { name: { $regex: String(query), $options:"i" } },
        { email:{ $regex: String(query), $options:"i" } },
      ];
    }
    if (role) q.role = role;
    if (banned === "true") q.banned = true;
    if (banned === "false") q.banned = { $ne: true };
    if (cursor) q._id = { $lt: cursor };

    const rows = await User.find(q)
  .sort({ _id: -1 })
  .limit(limit + 1)
  .select("_id name email role restaurantId banned banReason bannedUntil createdAt")
  .lean();

    res.json({
      items: cut(rows, limit),
      nextCursor: nextCursor(rows, limit),
    });
  }catch(e){ next(e); }
};

export const getUserDetail = async (req,res,next)=>{
  try{
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({message:"Invalid user id"});

const user = await User.findById(uid)
  .select("_id name email role restaurantId banned banReason bannedUntil createdAt")
  .lean();    
  if (!user) return res.status(404).json({message:"User not found"});

    // quick KPI
    const agg = await Reservation.aggregate([
      { $match: { userId: uid } },
      { $group: {
          _id: "$status",
          c: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$totalPrice",0] } },
          deposits:{ $sum: { $ifNull: ["$depositAmount",0] } },
      } }
    ]);
    const by = new Map(agg.map(r=>[r._id,r]));
    const total = agg.reduce((a,r)=>a + (r.c||0), 0);
    const revenue = agg.reduce((a,r)=>a + (r.revenue||0), 0);

    res.json({
      user,
      kpi: {
        total,
        pending:  by.get("pending")?.c   || 0,
        confirmed:by.get("confirmed")?.c || 0,
        arrived:  by.get("arrived")?.c   || 0,
        cancelled:by.get("cancelled")?.c || 0,
        no_show:  by.get("no_show")?.c   || 0,
        revenue,
        deposits: agg.reduce((a,r)=>a+(r.deposits||0),0),
      }
    });
  }catch(e){ next(e); }
};

export const banUser = async (req,res,next)=>{
  try{
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({message:"Invalid user id"});
    const { reason, bannedUntil } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({message:"Reason is required"});

    const patch = {
      banned: true,
      banReason: String(reason).trim(),
      bannedAt: new Date(),
      bannedBy: req.user.id,
    };
    if (bannedUntil) patch.bannedUntil = new Date(bannedUntil);

    const u = await User.findByIdAndUpdate(uid, { $set: patch }, { new: true }).lean();
    if (!u) return res.status(404).json({message:"User not found"});
    res.json({ ok:true, user: { _id:u._id, banned:u.banned, banReason:u.banReason, bannedUntil:u.bannedUntil } });
  }catch(e){ next(e); }
};

export const unbanUser = async (req,res,next)=>{
  try{
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({message:"Invalid user id"});
    const u = await User.findByIdAndUpdate(uid, {
      $set: { banned:false, banReason:null, bannedUntil:null },
      $unset: { bannedAt:"", bannedBy:"" }
    }, { new:true }).lean();
    if (!u) return res.status(404).json({message:"User not found"});
    res.json({ ok:true, user: { _id:u._id, banned:u.banned } });
  }catch(e){ next(e); }
};

// ✅ Rol güncelle
export const updateUserRole = async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({ message: "Invalid user id" });

    const { role } = req.body || {};
    const allowed = ["customer", "restaurant", "admin"];
    if (!allowed.includes(role)) return res.status(400).json({ message: "Invalid role" });

    // önce rolü set et
    const u0 = await User.findByIdAndUpdate(uid, { $set: { role } }, { new: true });
    if (!u0) return res.status(404).json({ message: "User not found" });

    // 🔴 restaurant ise restoran kaydını garanti et
    if (u0.role === "restaurant") {
      await ensureRestaurantForOwner(u0._id);
      await u0.populate({ path: "restaurantId", select: "_id name" });
    }

    // client’a dönerken restaurantId’yi de gösterelim
    return res.json({
      ok: true,
      user: {
        _id: u0._id,
        name: u0.name,
        email: u0.email,
        role: u0.role,
        restaurantId: u0.restaurantId ? u0.restaurantId.toString() : null,
      },
    });
  } catch (e) {
    next(e);
  }
};

// ---------- Reservations (global read-only)
export const listReservationsAdmin = async (req, res, next) => {
  try {
    const { status, restaurantId, userId, start, end } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const { dt } = parseDateRange({ start, end });

    const q = {};
    if (status) q.status = status;

    if (restaurantId) {
      const rid = toObjectId(restaurantId);
      if (!rid) return res.status(400).json({ message: "Invalid restaurantId" });
      q.restaurantId = rid;
    }
    if (userId) {
      const uid = toObjectId(userId);
      if (!uid) return res.status(400).json({ message: "Invalid userId" });
      q.userId = uid;
    }

    if (cursor) q._id = { $lt: cursor };
    if (start || end) q.dateTimeUTC = dt;

    const rows = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({ path: "userId", select: "name email" })
      .populate({ path: "restaurantId", select: "name" })
      .lean();

    // Fallback kullanıcı üretici
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

    const sliced = cut(rows, limit);
    const items = sliced.map((r) => ({
      _id: r._id,
      dateTimeUTC: r.dateTimeUTC,
      partySize: r.partySize,
      totalPrice: r.totalPrice,
      depositAmount: r.depositAmount,
      status: r.status,
      receiptUrl: r.receiptUrl || null,
      restaurant: r.restaurantId
        ? { id: r.restaurantId._id?.toString?.() ?? null, name: r.restaurantId.name }
        : null,
      userId: r.userId?._id?.toString() ?? null,
      user: pickUser(r) || undefined,
    }));

    res.json({
      items,
      nextCursor: nextCursor(rows, limit),
    });
  } catch (e) {
    next(e);
  }
};

// ---------- Reviews ----------
export const listReviews = async (req,res,next)=>{
  try{
    const { restaurantId, userId, status } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const q = {};
    if (restaurantId) q.restaurantId = toObjectId(restaurantId);
    if (userId) q.userId = toObjectId(userId);
    if (status) q.status = status;
    if (cursor) q._id = { $lt: cursor };

    const rows = await Review.find(q).sort({_id:-1}).limit(limit+1).lean();
    res.json({ items: cut(rows, limit), nextCursor: nextCursor(rows, limit) });
  }catch(e){ next(e); }
};
export const hideReview = async (req,res,next)=>{
  try{
    const r = await Review.findByIdAndUpdate(req.params.id, { $set:{ status:"hidden" } }, { new:true }).lean();
    if (!r) return res.status(404).json({message:"Review not found"});
    res.json({ ok:true, status:r.status });
  }catch(e){ next(e); }
};
export const unhideReview = async (req,res,next)=>{
  try{
    const r = await Review.findByIdAndUpdate(req.params.id, { $set:{ status:"visible" } }, { new:true }).lean();
    if (!r) return res.status(404).json({message:"Review not found"});
    res.json({ ok:true, status:r.status });
  }catch(e){ next(e); }
};
export const removeReview = async (req,res,next)=>{
  try{
    const r = await Review.findByIdAndUpdate(req.params.id, { $set:{ status:"removed" } }, { new:true }).lean();
    if (!r) return res.status(404).json({message:"Review not found"});
    res.json({ ok:true, status:r.status });
  }catch(e){ next(e); }
};

// ---------- Complaints ----------
export const listComplaints = async (req,res,next)=>{
  try{
    const { restaurantId, userId, status } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const q = {};
    if (restaurantId) q.restaurantId = toObjectId(restaurantId);
    if (userId) q.userId = toObjectId(userId);
    if (status) q.status = status;
    if (cursor) q._id = { $lt: cursor };

    const rows = await Complaint.find(q).sort({_id:-1}).limit(limit+1).lean();
    res.json({ items: cut(rows, limit), nextCursor: nextCursor(rows, limit) });
  }catch(e){ next(e); }
};
export const resolveComplaint = async (req,res,next)=>{
  try{
    const c = await Complaint.findByIdAndUpdate(req.params.id, { $set:{ status:"resolved" } }, { new:true }).lean();
    if (!c) return res.status(404).json({message:"Complaint not found"});
    res.json({ ok:true, status:c.status });
  }catch(e){ next(e); }
};
export const dismissComplaint = async (req,res,next)=>{
  try{
    const c = await Complaint.findByIdAndUpdate(req.params.id, { $set:{ status:"dismissed" } }, { new:true }).lean();
    if (!c) return res.status(404).json({message:"Complaint not found"});
    res.json({ ok:true, status:c.status });
  }catch(e){ next(e); }
};

// ======================================================
// ✅ NEW: Commissions (ARRIVED only) — preview + export
// ======================================================

// Ay parametresi (YYYY-MM) varsa onu, yoksa start/end’i kullan
function resolveRange(q) {
  if (q.month) {
    const [y,m] = String(q.month).split("-").map(Number);
    if (y >= 1970 && m >= 1 && m <= 12) {
      const start = new Date(Date.UTC(y, m-1, 1, 0, 0, 0, 0));
      const end   = new Date(Date.UTC(y, m,   0, 23, 59, 59, 999)); // ayın son günü
      return { start, end, dt: { $gte: start, $lte: end } };
    }
  }
  return parseDateRange(q);
}

/**
 * GET /api/admin/commissions/preview?month=YYYY-MM
 * YALNIZCA status="arrived" rezervasyonlar:
 *  - base: underattended ise min(price)*arrivedCount, değilse totalPrice
 *  - commission = base * restaurant.commissionRate (varsayılan 0.05)
 * Dönen: restoran bazlı özet + grand totals
 */
export const commissionsPreview = async (req, res, next) => {
  try {
    const { start, end, dt } = resolveRange(req.query);
    const match = { status: "arrived" };
    if (start || end) match.dateTimeUTC = dt;

    const rows = await Reservation.aggregate([
      { $match: match },
      { $lookup: {
          from: "restaurants",
          localField: "restaurantId",
          foreignField: "_id",
          as: "rest"
      }},
      { $addFields: {
          _rate: { $ifNull: [ { $arrayElemAt: ["$rest.commissionRate", 0] }, 0.05 ] },
          _name: { $ifNull: [ { $arrayElemAt: ["$rest.name", 0] }, "(Restoran)" ] },
          _base: commissionBaseExpr()
      }},
      { $group: {
          _id: "$restaurantId",
          name: { $first: "$_name" },
          rate: { $first: "$_rate" },
          count: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
          base: { $sum: "$_base" },
          commission: { $sum: { $multiply: ["$_base", "$_rate"] } }
      }},
      { $sort: { commission: -1 } }
    ]);

    const totals = rows.reduce((a,r)=>({
      count: a.count + (r.count||0),
      revenue: a.revenue + (r.revenue||0),
      base: a.base + (r.base||0),
      commission: a.commission + (r.commission||0),
    }), { count:0, revenue:0, base:0, commission:0 });

    res.json({
      range: {
        start: start ? start.toISOString().slice(0,10) : null,
        end: end ? end.toISOString().slice(0,10) : null,
        month: req.query.month || null
      },
      items: rows.map(r=>({
        restaurantId: r._id,
        name: r.name,
        rate: r.rate,
        arrivedCount: r.count,
        revenue: r.revenue,
        base: r.base,
        commission: r.commission
      })),
      totals
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/admin/commissions/export?month=YYYY-MM
 * CSV (attachment) — her rezervasyon satırı:
 * restaurantId,restaurantName,rate,reservationId,dateTimeUTC,partySize,arrivedCount,underattended,totalPrice,base,commission
 */
export const commissionsExport = async (req, res, next) => {
  try {
    const { start, end, dt } = resolveRange(req.query);
    const match = { status: "arrived" };
    if (start || end) match.dateTimeUTC = dt;

    const rows = await Reservation.aggregate([
      { $match: match },
      { $lookup: {
          from: "restaurants",
          localField: "restaurantId",
          foreignField: "_id",
          as: "rest"
      }},
      { $addFields: {
          _rate: { $ifNull: [ { $arrayElemAt: ["$rest.commissionRate", 0] }, 0.05 ] },
          _name: { $ifNull: [ { $arrayElemAt: ["$rest.name", 0] }, "(Restoran)" ] },
          _base: commissionBaseExpr()
      }},
      { $project: {
          _id: 1,
          restaurantId: 1,
          dateTimeUTC: 1,
          partySize: 1,
          arrivedCount: 1,
          underattended: 1,
          totalPrice: { $ifNull: ["$totalPrice", 0] },
          rate: "$_rate",
          name: "$_name",
          base: "$_base",
          commission: { $multiply: ["$_base", "$_rate"] }
      }},
      { $sort: { restaurantId: 1, dateTimeUTC: 1 } }
    ]);

    // CSV oluştur
    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = [
      "restaurantId","restaurantName","rate",
      "reservationId","dateTimeUTC","partySize","arrivedCount","underattended",
      "totalPrice","base","commission"
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        esc(r.restaurantId),
        esc(r.name),
        esc(r.rate),
        esc(r._id),
        esc(r.dateTimeUTC?.toISOString?.() || r.dateTimeUTC),
        esc(r.partySize ?? ""),
        esc(r.arrivedCount ?? ""),
        esc(r.underattended ? 1 : 0),
        esc(r.totalPrice ?? 0),
        esc(r.base ?? 0),
        esc(r.commission ?? 0),
      ].join(","));
    }
    const csv = lines.join("\n");

    const monthPart = req.query.month || (start && end
      ? `${start.toISOString().slice(0,10)}_${end.toISOString().slice(0,10)}`
      : "all-time");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="commissions-${monthPart}.csv"`);
    res.send(csv);
  } catch (e) {
    next(e);
  }
};