import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";
import Review from "../models/Review.js";
import Complaint from "../models/Complaint.js";
import Organization from "../models/Organization.js";
import BranchRequest from "../models/BranchRequest.js";
// EN ÜSTE EKLE (diğer importların yanına)
import { Parser } from "json2csv";

/* ------------ helpers ------------ */
function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}
function parseDateRange(q) {
  const start = q.start ? new Date(q.start + "T00:00:00.000Z") : null;
  const end = q.end ? new Date(q.end + "T23:59:59.999Z") : null;
  const dt = {};
  if (start) dt.$gte = start;
  if (end) dt.$lte = end;
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
function cut(items, limit) {
  return items.slice(0, limit);
}

/**
 * ✅ Tek noktadan membership güncelleme helper’ı
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {Object} options
 * @param {string|mongoose.Types.ObjectId} [options.organizationId]
 * @param {string} [options.orgRole] - "org_owner" | "org_admin" | "org_finance"
 * @param {string|mongoose.Types.ObjectId} [options.restaurantId]
 * @param {string} [options.restaurantRole] - "location_manager" | "staff"
 * @param {boolean} [options.setLegacyRestaurantId]
 */
async function assignMemberships(userId, options = {}) {
  const {
    organizationId,
    orgRole,
    restaurantId,
    restaurantRole,
    setLegacyRestaurantId,
  } = options;

  const uid = toObjectId(userId);
  if (!uid) return null;

  const update = {};
  const addToSet = {};

  if (organizationId && orgRole) {
    addToSet.organizations = {
      organization: toObjectId(organizationId),
      role: orgRole,
    };
  }

  if (restaurantId && restaurantRole) {
    addToSet.restaurantMemberships = {
      restaurant: toObjectId(restaurantId),
      role: restaurantRole,
    };
  }

  if (Object.keys(addToSet).length > 0) {
    update.$addToSet = addToSet;
  }

  if (setLegacyRestaurantId && restaurantId) {
    update.$set = {
      ...(update.$set || {}),
      restaurantId: toObjectId(restaurantId),
    };
  }

  if (Object.keys(update).length === 0) {
    // Hiçbir şey güncellenecek değilse dokunma
    return null;
  }

  try {
    return await User.findByIdAndUpdate(uid, update, { new: true }).lean();
  } catch (e) {
    // Sessiz fail – admin akışını bozmamak için
    if (process.env.AUTH_DEBUG === "1") {
      console.log("[assignMemberships] error:", e?.message);
    }
    return null;
  }
}

/* ------------ KPI core ------------ */
async function kpiAggregate(match) {
  const rows = await Reservation.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$status",
        c: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        deposits: { $sum: { $ifNull: ["$depositAmount", 0] } },
      },
    },
  ]);

  const by = new Map(rows.map((r) => [r._id, r]));
  const total = rows.reduce((a, r) => a + (r.c || 0), 0);
  const revenue = rows.reduce((a, r) => a + (r.revenue || 0), 0);
  const deposits = rows.reduce((a, r) => a + (r.deposits || 0), 0);
  const confirmed = by.get("confirmed")?.c || 0;
  const arrived = by.get("arrived")?.c || 0;
  const cancelled = by.get("cancelled")?.c || 0;

  const arrivedRevenue = by.get("arrived")?.revenue || 0;
  const depositFromConfirmedNoShow =
    (by.get("confirmed")?.deposits || 0) +
    (by.get("no_show")?.deposits || 0);

  return {
    reservations: {
      total,
      pending: by.get("pending")?.c || 0,
      confirmed,
      arrived,
      cancelled,
      no_show: by.get("no_show")?.c || 0,
    },
    revenue,
    deposits,
    breakdown: { arrivedRevenue, depositFromConfirmedNoShow },
    rates: {
      confirm: total ? Number((confirmed / total).toFixed(3)) : 0,
      checkin: confirmed
        ? Number((arrived / confirmed).toFixed(3))
        : 0,
      cancel: total ? Number((cancelled / total).toFixed(3)) : 0,
    },
  };
}

async function kpiSeries(match, groupBy = "day") {
  let dateFmt = "%Y-%m-%d";
  if (groupBy === "month") dateFmt = "%Y-%m";
  if (groupBy === "week") dateFmt = "%G-W%V";

  const rows = await Reservation.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: dateFmt, date: "$dateTimeUTC" },
        },
        c: { $sum: 1 },
        revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        arrived: {
          $sum: {
            $cond: [{ $eq: ["$status", "arrived"] }, 1, 0],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return {
    labels: rows.map((r) => r._id),
    reservations: rows.map((r) => r.c),
    revenue: rows.map((r) => r.revenue),
    arrived: rows.map((r) => r.arrived),
  };
}

/* ------------ Commission helpers (underattendance kuralı dahil) ------------ */
function commissionBaseExpr() {
  return {
    $cond: [
      { $eq: ["$underattended", true] },
      {
        $multiply: [
          { $ifNull: ["$arrivedCount", 0] },
          {
            $let: {
              vars: {
                prices: {
                  $map: {
                    input: { $ifNull: ["$selections", []] },
                    as: "s",
                    in: { $ifNull: ["$$s.price", 0] },
                  },
                },
              },
              in: {
                $cond: [
                  { $gt: [{ $size: "$$prices" }, 0] },
                  { $min: "$$prices" },
                  0,
                ],
              },
            },
          },
        ],
      },
      { $ifNull: ["$totalPrice", 0] },
    ],
  };
}

async function commissionTotals(match) {
  const rows = await Reservation.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "restaurants",
        localField: "restaurantId",
        foreignField: "_id",
        as: "rest",
      },
    },
    {
      $addFields: {
        _rate: {
          $ifNull: [{ $arrayElemAt: ["$rest.commissionRate", 0] }, 0.05],
        },
        _base: commissionBaseExpr(),
      },
    },
    {
      $group: {
        _id: null,
        commission: { $sum: { $multiply: ["$_base", "$_rate"] } },
        revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const r = rows[0] || { commission: 0, revenue: 0, count: 0 };
  return {
    total: r.commission || 0,
    revenue: r.revenue || 0,
    count: r.count || 0,
  };
}

async function commissionByRestaurant(match) {
  const rows = await Reservation.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "restaurants",
        localField: "restaurantId",
        foreignField: "_id",
        as: "rest",
      },
    },
    {
      $addFields: {
        _rate: {
          $ifNull: [{ $arrayElemAt: ["$rest.commissionRate", 0] }, 0.05],
        },
        _name: {
          $ifNull: [{ $arrayElemAt: ["$rest.name", 0] }, "(Restoran)"],
        },
        _base: commissionBaseExpr(),
      },
    },
    {
      $group: {
        _id: "$restaurantId",
        name: { $first: "$_name" },
        commission: { $sum: { $multiply: ["$_base", "$_rate"] } },
        revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { commission: -1 } },
  ]);

  return rows.map((r) => ({
    restaurantId: r._id,
    name: r.name,
    commission: r.commission || 0,
    revenue: r.revenue || 0,
    count: r.count || 0,
  }));
}

/* ------------ KPI endpoints ------------ */
export const kpiGlobal = async (req, res, next) => {
  try {
    const { start, end, dt } = parseDateRange(req.query);
    const groupBy = req.query.groupBy || "day";
    const match = {};
    if (start || end) match.dateTimeUTC = dt;

    const totals = await kpiAggregate(match);
    const series = await kpiSeries(match, groupBy);

    const commissionsTotal = await commissionTotals(match);
    const commissionsBreakdown = await commissionByRestaurant(match);

    res.json({
      range: {
        start: req.query.start || null,
        end: req.query.end || null,
        groupBy,
      },
      totals: { ...totals, commission: commissionsTotal.total },
      series,
      commissions: {
        total: commissionsTotal.total,
        byRestaurant: commissionsBreakdown,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const kpiByRestaurant = async (req, res, next) => {
  try {
    const rid = toObjectId(req.params.rid);
    if (!rid)
      return res.status(400).json({ message: "Invalid restaurant id" });

    const { start, end, dt } = parseDateRange(req.query);
    const groupBy = req.query.groupBy || "day";
    const match = { restaurantId: rid };
    if (start || end) match.dateTimeUTC = dt;

    const totals = await kpiAggregate(match);
    const series = await kpiSeries(match, groupBy);
    const commissionsTotal = await commissionTotals(match);

    res.json({
      range: {
        start: req.query.start || null,
        end: req.query.end || null,
        groupBy,
      },
      totals: { ...totals, commission: commissionsTotal.total },
      series,
      commissions: { total: commissionsTotal.total },
    });
  } catch (e) {
    next(e);
  }
};

export const kpiByUser = async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({ message: "Invalid user id" });

    const { start, end, dt } = parseDateRange(req.query);
    const groupBy = req.query.groupBy || "day";
    const match = { userId: uid };
    if (start || end) match.dateTimeUTC = dt;

    const totals = await kpiAggregate(match);
    const series = await kpiSeries(match, groupBy);

    res.json({
      range: {
        start: req.query.start || null,
        end: req.query.end || null,
        groupBy,
      },
      totals,
      series,
    });
  } catch (e) {
    next(e);
  }
};

/* ------------ Organizations (admin) ------------ */
export const listOrganizations = async (req, res, next) => {
  try {
    const { query, region } = req.query || {};
    const { limit, cursor } = pageParams(req.query || {});

    const q = {};

    if (query) {
      const re = new RegExp(String(query), "i");
      q.$or = [
        { name: re },
        { legalName: re },
        { taxNumber: re },
        { region: re },
      ];
    }

    if (region) {
      // Ayrı region filtresi geldiyse, net olarak bunu da zorla
      q.region = String(region).toUpperCase();
    }

    if (cursor) {
      q._id = { $lt: cursor };
    }

    const rows = await Organization.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select(
        "_id name legalName region defaultLanguage taxNumber taxOffice createdAt updatedAt"
      )
      .lean();

    const sliced = cut(rows, limit);
    const orgIds = sliced.map((o) => o._id).filter(Boolean);

    // 🔹 Her organizasyona bağlı restoran sayısını hesapla
    let countMap = new Map();
    if (orgIds.length > 0) {
      const counts = await Restaurant.aggregate([
        { $match: { organizationId: { $in: orgIds } } },
        {
          $group: {
            _id: "$organizationId",
            c: { $sum: 1 },
          },
        },
      ]);

      counts.forEach((r) => {
        countMap.set(String(r._id), r.c || 0);
      });
    }

    const items = sliced.map((o) => ({
      ...o,
      // Frontend tarafında restaurantsCount / restaurantCount / branchesCount
      // hepsi deneniyor, burada net bir isim veriyoruz:
      restaurantCount: countMap.get(String(o._id)) ?? 0,
    }));

    res.json({
      items,
      nextCursor: nextCursor(rows, limit),
    });
  } catch (e) {
    next(e);
  }
};

export const getOrganizationDetail = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }

    const org = await Organization.findById(oid)
      .select(
        "_id name legalName logoUrl region defaultLanguage description taxNumber taxOffice createdAt updatedAt"
      )
      .lean();

    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    // 🔹 Bu organizasyona bağlı restoranlar
    const restaurants = await Restaurant.find({ organizationId: oid })
      .select("_id name city region isActive")
      .sort({ name: 1 })
      .lean();

    // 🔹 Organizasyona bağlı kullanıcılar (organizations[] içinden)
    const userDocs = await User.find({
      "organizations.organization": oid,
    })
      .select("_id name email organizations")
      .lean();

    const members = userDocs.map((u) => {
      const rel = (u.organizations || []).find(
        (m) => String(m.organization) === String(oid)
      );

      return {
        userId: u._id,
        name: u.name,
        email: u.email,
        role: rel?.role || "org_staff",
      };
    });

    res.json({
      ...org,
      restaurants,
      members,
    });
  } catch (e) {
    next(e);
  }
};

export const createOrganization = async (req, res, next) => {
  try {
    let {
      name,
      legalName,
      logoUrl,
      region,
      defaultLanguage,
      description,
      taxNumber,
      taxOffice,
      ownerId,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    name = String(name).trim();

    if (!region || !String(region).trim()) {
      return res.status(400).json({ message: "region is required" });
    }
    region = String(region).trim().toUpperCase();

    if (defaultLanguage) {
      defaultLanguage = String(defaultLanguage).trim();
    }

    const org = await Organization.create({
      name,
      legalName: legalName || undefined,
      logoUrl: logoUrl || undefined,
      region,
      defaultLanguage: defaultLanguage || undefined,
      description: description || undefined,
      taxNumber: taxNumber || undefined,
      taxOffice: taxOffice || undefined,
    });

    // ✅ Owner ataması: body.ownerId varsa onu, yoksa req.user.id'yi owner say
    const resolvedOwnerId =
      ownerId || req.user?.id || req.user?._id || null;

    if (resolvedOwnerId) {
      await assignMemberships(resolvedOwnerId, {
        organizationId: org._id,
        orgRole: "org_owner",
      });
    }

    res.status(201).json({
      ok: true,
      organization: {
        _id: org._id,
        name: org.name,
        legalName: org.legalName || null,
        logoUrl: org.logoUrl || null,
        region: org.region || null,
        defaultLanguage: org.defaultLanguage || null,
        description: org.description || null,
        taxNumber: org.taxNumber || null,
        taxOffice: org.taxOffice || null,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};
// ------------------------
// Organization Membership
// ------------------------

export async function addOrganizationMember(req, res, next) {
  try {
    const { oid } = req.params;
    const { userId, role } = req.body || {};

    if (!oid || !userId || !role) {
      return res
        .status(400)
        .json({ message: "organization, userId ve role zorunludur" });
    }

    const org = await Organization.findById(oid);
    if (!org) {
      return res.status(404).json({ message: "Organizasyon bulunamadı" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }

    // user.organizations: [{ organization: ObjectId, role: string }]
    if (!Array.isArray(user.organizations)) {
      user.organizations = [];
    }

    const existing = user.organizations.find(
      (m) => String(m.organization) === String(oid)
    );

    if (existing) {
      // varsa rol güncelle
      existing.role = role;
    } else {
      // yoksa yeni membership ekle
      user.organizations.push({
        organization: org._id,
        role,
      });
    }

    await user.save();

    // Frontend zaten tekrar getOrganizationDetail çağırıyor,
    // o yüzden burada full org dönmek zorunda değiliz.
    return res.json({
      ok: true,
      userId: user._id,
      organizationId: org._id,
      role,
    });
  } catch (err) {
    next(err);
  }
}

export async function removeOrganizationMember(req, res, next) {
  try {
    const { oid, uid } = req.params;

    if (!oid || !uid) {
      return res
        .status(400)
        .json({ message: "organization ve userId zorunludur" });
    }

    const user = await User.findById(uid);
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }

    if (!Array.isArray(user.organizations)) {
      user.organizations = [];
    }

    const before = user.organizations.length;

    user.organizations = user.organizations.filter(
      (m) => String(m.organization) !== String(oid)
    );

    const after = user.organizations.length;

    // Değişiklik olmasa bile 200 dönmek sorun değil
    if (before === after) {
      // isteğe bağlı: message ile bilgi verilebilir
    }

    await user.save();

    return res.json({
      ok: true,
      userId: user._id,
      organizationId: oid,
    });
  } catch (err) {
    next(err);
  }
}
// ------------------------
// Restaurant Membership
// ------------------------

export async function addRestaurantMember(req, res, next) {
  try {
    const { rid } = req.params;
    const { userId, role } = req.body || {};

    if (!rid || !userId || !role) {
      return res
        .status(400)
        .json({ message: "restaurant, userId ve role zorunludur" });
    }

    const restaurant = await Restaurant.findById(rid);
    if (!restaurant) {
      return res.status(404).json({ message: "Restoran bulunamadı" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }

    // user.restaurantMemberships: [{ restaurant: ObjectId, role: string }]
    if (!Array.isArray(user.restaurantMemberships)) {
      user.restaurantMemberships = [];
    }

    const existing = user.restaurantMemberships.find(
      (m) => String(m.restaurant) === String(rid)
    );

    if (existing) {
      // varsa rol güncelle
      existing.role = role;
    } else {
      // yoksa yeni membership ekle
      user.restaurantMemberships.push({
        restaurant: restaurant._id,
        role,
      });
    }

    await user.save();

    return res.json({
      ok: true,
      userId: user._id,
      restaurantId: restaurant._id,
      role,
    });
  } catch (err) {
    next(err);
  }
}

export async function removeRestaurantMember(req, res, next) {
  try {
    const { rid, uid } = req.params;

    if (!rid || !uid) {
      return res
        .status(400)
        .json({ message: "restaurant ve userId zorunludur" });
    }

    const user = await User.findById(uid);
    if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }

    if (!Array.isArray(user.restaurantMemberships)) {
      user.restaurantMemberships = [];
    }

    const before = user.restaurantMemberships.length;

    user.restaurantMemberships = user.restaurantMemberships.filter(
      (m) => String(m.restaurant) !== String(rid)
    );

    const after = user.restaurantMemberships.length;

    // değişiklik olmasa bile 200 dönmesi sorun değil
    await user.save();

    return res.json({
      ok: true,
      userId: user._id,
      restaurantId: rid,
      removed: before !== after,
    });
  } catch (err) {
    next(err);
  }
}
/**
 * Admin → Organizasyona şube (restaurant) ekleme
 * POST /admin/organizations/:oid/restaurants
 */
export const createOrganizationRestaurant = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }

    // Organizasyon var mı?
    const org = await Organization.findById(oid)
      .select("_id name region")
      .lean();
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    let {
      ownerId,
      name,
      region,
      address,
      phone,
      city,
      priceRange,
      rating,
      iban,
      openingHours,
      photos,
      description,
      social,
      depositRate,
      cancelPolicy,
      graceMinutes,
      isActive,
      location,
      mapAddress,
      placeId,
      googleMapsUrl,
      businessType,
    } = req.body || {};

    // ownerId zorunlu
    if (!ownerId || !String(ownerId).trim()) {
      return res.status(400).json({ message: "ownerId is required" });
    }
    const ownerObjectId = toObjectId(ownerId);
    if (!ownerObjectId) {
      return res.status(400).json({ message: "Invalid ownerId" });
    }

    // Owner user var mı?
    const owner = await User.findById(ownerObjectId).select("_id").lean();
    if (!owner) {
      return res.status(404).json({ message: "Owner user not found" });
    }

    // name zorunlu
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    name = String(name).trim();

    // region zorunlu (Joi tarafında da validate edeceğiz ama burada da normalize edelim)
    if (!region || !String(region).trim()) {
      return res.status(400).json({ message: "region is required" });
    }
    region = String(region).trim().toUpperCase();

    // priceRange / rating / depositRate / graceMinutes gibi sayısal alanları normalize et
    if (rating != null) rating = Number(rating);
    if (depositRate != null) depositRate = Number(depositRate);
    if (graceMinutes != null) graceMinutes = Number(graceMinutes);

    const doc = await Restaurant.create({
      owner: owner._id,
      organizationId: org._id,
      name,
      region,
      address: address || undefined,
      phone: phone || undefined,
      city: city || undefined,
      priceRange: priceRange || "₺₺",
      rating: rating != null ? rating : 0,
      iban,
      openingHours: Array.isArray(openingHours) ? openingHours : [],
      photos: Array.isArray(photos) ? photos : [],
      description: description || undefined,
      social: Array.isArray(social) ? social : [],
      depositRate: depositRate != null ? depositRate : 10,
      cancelPolicy: cancelPolicy || "24h_100;3h_50;lt3h_0",
      graceMinutes: graceMinutes != null ? graceMinutes : 15,
      isActive: typeof isActive === "boolean" ? isActive : true,
      status: "active", // 🔒 Admin akışı: şube direkt aktif
      location: location || undefined,
      mapAddress: mapAddress || undefined,
      placeId: placeId || undefined,
      googleMapsUrl: googleMapsUrl || undefined,
      businessType: businessType || "restaurant",
    });

    // ✅ Owner -> organizations & restaurantMemberships güncelle
    await assignMemberships(owner._id, {
      organizationId: org._id,
      orgRole: "org_owner",
      restaurantId: doc._id,
      restaurantRole: "location_manager",
      setLegacyRestaurantId: true, // backward compat için
    });

    res.status(201).json({
      ok: true,
      restaurant: {
        _id: doc._id,
        organizationId: doc.organizationId,
        ownerId: owner._id,
        name: doc.name,
        region: doc.region,
        city: doc.city || null,
        address: doc.address || null,
        phone: doc.phone || null,
        email: doc.email || null,
        priceRange: doc.priceRange || null,
        rating: doc.rating ?? null,
        status: doc.status,
        iban: doc.iban || null,
        depositRate: doc.depositRate ?? null,
        cancelPolicy: doc.cancelPolicy || null,
        graceMinutes: doc.graceMinutes ?? null,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ------------ Restaurants ------------ */
export const listRestaurants = async (req, res, next) => {
  try {
    const { query, city, organizationId } = req.query;
    const { limit, cursor } = pageParams(req.query);

    const q = {};

    if (query) {
      q.name = { $regex: String(query), $options: "i" };
    }

    if (city) {
      q.city = { $regex: String(city), $options: "i" };
    }

    // 🔹 Organizasyona göre filtre
    if (organizationId) {
      const oid = toObjectId(organizationId);
      if (!oid) {
        return res
          .status(400)
          .json({ message: "Invalid organizationId" });
      }
      q.organizationId = oid;
    }

    if (cursor) {
      q._id = { ...(q._id || {}), $lt: cursor };
    }

    const rows = await Restaurant.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select(
        "_id name city address phone email region isActive commissionRate organizationId"
      )
      .lean();

    res.json({
      items: cut(rows, limit),
      nextCursor: nextCursor(rows, limit),
    });
  } catch (e) {
    next(e);
  }
};

// -------------------------
// ✅ Admin — Create User
// -------------------------
export const createUser = async (req, res, next) => {
  try {
    let { name, email, phone, password } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    name = String(name).trim();
    if (email) email = String(email).trim().toLowerCase();
    if (phone) phone = String(phone).trim();
    if (password) password = String(password).trim();

    if (!email && !phone) {
      return res.status(400).json({ message: "email or phone is required" });
    }

    // Benzersizlik kontrolleri
    if (email) {
      const ex = await User.findOne({ email }).select("_id").lean();
      if (ex) return res.status(409).json({ message: "Email already in use" });
    }
    if (phone) {
      const ex2 = await User.findOne({ phone }).select("_id").lean();
      if (ex2)
        return res.status(409).json({ message: "Phone already in use" });
    }

    // Şifre yoksa güvenli random üret
    if (!password) {
      password = Math.random().toString(36).slice(-10);
    }

    const user = await User.create({
      name,
      email: email || undefined,
      phone: phone || undefined,
      password,
      role: "customer",
      providers: email ? [{ name: "password", sub: email }] : [],
    });

    res.status(201).json({
      ok: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email || null,
        phone: user.phone || null,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * ⚠️ LEGACY: Tek restoranlı yapı için kullanılan eski endpoint.
 *
 * Yeni mimaride:
 *  - Restaurant her zaman bir Organization’a ait olmalı.
 *  - Owner membership’leri organizations[] / restaurantMemberships[] üzerinden yönetiliyor.
 *
 * Bu yüzden bu endpoint’i artık gerçek restoran yaratmak için KULLANMIYORUZ.
 * Admin panel tarafında /admin/organizations/:oid/restaurants endpoint’ini kullanman gerekiyor.
 */
export const createRestaurant = async (req, res, next) => {
  try {
    return res.status(410).json({
      ok: false,
      message:
        "Legacy /admin/restaurants endpoint is deprecated. Please use /admin/organizations/:oid/restaurants instead.",
    });
  } catch (e) {
    next(e);
  }
};

export const getRestaurantDetail = async (req, res, next) => {
  try {
    const rid = toObjectId(req.params.rid);
    if (!rid) {
      return res.status(400).json({ message: "Invalid restaurant id" });
    }

    const r = await Restaurant.findById(rid)
      .select(
        "_id name city address owner settings depositAmount depositRate depositType commissionRate commissionPct commission phone email isActive region organizationId"
      )
      .lean();

    if (!r) {
      return res.status(404).json({ message: "Restaurant not found" });
    }

    // 🔹 Bu restorana bağlı kullanıcılar (restaurantMemberships[] içinden)
    const userDocs = await User.find({
      "restaurantMemberships.restaurant": rid,
    })
      .select("_id name email restaurantMemberships")
      .lean();

    const members = userDocs.map((u) => {
      const rel = (u.restaurantMemberships || []).find(
        (m) => String(m.restaurant) === String(rid)
      );

      return {
        userId: u._id,
        name: u.name,
        email: u.email,
        role: rel?.role || "restaurant_staff",
      };
    });

    res.json({
      ...r,
      members,
    });
  } catch (e) {
    next(e);
  }
};

export const listReservationsByRestaurantAdmin = async (
  req,
  res,
  next
) => {
  try {
    const { status, start, end } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const rid = toObjectId(req.params.rid);
    if (!rid)
      return res.status(400).json({ message: "Invalid restaurant id" });

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
      if (r.customer && (r.customer.name || r.customer.email))
        return r.customer;
      if (
        r.customerName ||
        r.guestName ||
        r.contactName ||
        r.name
      ) {
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

    res.json({ items, nextCursor: nextCursor(rows, limit) });
  } catch (e) {
    next(e);
  }
};

/* ------------ Commission rate update ------------ */
export const updateRestaurantCommission = async (req, res, next) => {
  try {
    const rid = toObjectId(req.params.rid);
    if (!rid)
      return res.status(400).json({ message: "Invalid restaurant id" });

    let { commissionRate } = req.body || {};
    if (commissionRate == null)
      return res
        .status(400)
        .json({ message: "commissionRate is required" });

    commissionRate = Number(commissionRate);
    if (Number.isNaN(commissionRate))
      return res.status(400).json({ message: "Invalid commissionRate" });
    if (commissionRate > 1) commissionRate = commissionRate / 100;
    commissionRate = Math.max(0, Math.min(1, commissionRate));

    const r = await Restaurant.findByIdAndUpdate(
      rid,
      { $set: { commissionRate } },
      { new: true }
    )
      .select("_id name commissionRate")
      .lean();

    if (!r) return res.status(404).json({ message: "Restaurant not found" });
    res.json({ ok: true, restaurant: r });
  } catch (e) {
    next(e);
  }
};

/* ------------ Users ------------ */
export const listUsers = async (req, res, next) => {
  try {
    const { query, role, banned } = req.query;
    const { limit, cursor } = pageParams(req.query);

    const q = {};
    if (query) {
      q.$or = [
        { name: { $regex: String(query), $options: "i" } },
        { email: { $regex: String(query), $options: "i" } },
      ];
    }
    if (role) q.role = role;
    if (banned === "true") q.banned = true;
    if (banned === "false") q.banned = { $ne: true };
    if (cursor) q._id = { $lt: cursor };

    const rows = await User.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select(
        "_id name email role restaurantId banned banReason bannedUntil createdAt riskScore noShowCount"
      )
      .lean();

    res.json({ items: cut(rows, limit), nextCursor: nextCursor(rows, limit) });
  } catch (e) {
    next(e);
  }
};

export const getUserDetail = async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({ message: "Invalid user id" });

    const user = await User.findById(uid)
      .select(
        "_id name email phone role restaurantId banned banReason bannedUntil createdAt"
      )
      .lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const agg = await Reservation.aggregate([
      { $match: { userId: uid } },
      {
        $group: {
          _id: "$status",
          c: { $sum: 1 },
          revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
          deposits: { $sum: { $ifNull: ["$depositAmount", 0] } },
        },
      },
    ]);
    const by = new Map(agg.map((r) => [r._id, r]));
    const total = agg.reduce((a, r) => a + (r.c || 0), 0);
    const revenue = agg.reduce((a, r) => a + (r.revenue || 0), 0);
    const deposits = agg.reduce(
      (a, r) => a + (r.deposits || 0),
      0
    );

    res.json({
      user,
      kpi: {
        total,
        pending: by.get("pending")?.c || 0,
        confirmed: by.get("confirmed")?.c || 0,
        arrived: by.get("arrived")?.c || 0,
        cancelled: by.get("cancelled")?.c || 0,
        no_show: by.get("no_show")?.c || 0,
        revenue,
        deposits,
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ------------ NEW: User Risk History (read-only) ------------ */
export const getUserRiskHistory = async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({ message: "Invalid user id" });

    const { start, end } = req.query;
    const { start: s, end: e } = parseDateRange({ start, end });

    const u = await User.findById(uid)
      .select(
        "_id name email banned banReason bannedUntil riskScore noShowCount riskIncidents consecutiveGoodShows createdAt"
      )
      .lean();
    if (!u) return res.status(404).json({ message: "User not found" });

    let incidents = Array.isArray(u.riskIncidents)
      ? u.riskIncidents.slice()
      : [];
    incidents.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
    if (s || e) {
      incidents = incidents.filter((it) => {
        const t = new Date(it.at).getTime();
        if (s && t < s.getTime()) return false;
        if (e && t > e.getTime()) return false;
        return true;
      });
    }

    const limit = Math.min(
      500,
      Math.max(1, Number(req.query.limit) || 100)
    );
    incidents = incidents.slice(0, limit);

    const snapshot = {
      riskScore: u.riskScore || 0,
      noShowCount: u.noShowCount || 0,
      banned: !!u.banned,
      bannedUntil: u.bannedUntil || null,
      banReason: u.banReason || null,
      consecutiveGoodShows: u.consecutiveGoodShows || 0,
      windowDays: 180,
      weights: {
        NO_SHOW: 1.0,
        LATE_CANCEL: 0.5,
        UNDER_ATTEND: 0.25,
        GOOD_ATTEND: -0.1,
      },
      multiplier: 25,
    };

    res.json({
      user: {
        _id: u._id,
        name: u.name,
        email: u.email,
        createdAt: u.createdAt,
      },
      snapshot,
      incidents: incidents.map((it) => ({
        type: it.type,
        weight: it.weight,
        at: it.at,
        reservationId: it.reservationId || null,
      })),
      range: { start: start || null, end: end || null, limit },
    });
  } catch (e) {
    next(e);
  }
};

export const banUser = async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({ message: "Invalid user id" });

    const { reason, bannedUntil } = req.body || {};
    if (!reason || !String(reason).trim())
      return res.status(400).json({ message: "Reason is required" });

    const patch = {
      banned: true,
      banReason: String(reason).trim(),
      bannedAt: new Date(),
      bannedBy: req.user.id,
    };
    if (bannedUntil) patch.bannedUntil = new Date(bannedUntil);

    const u = await User.findByIdAndUpdate(
      uid,
      { $set: patch },
      { new: true }
    ).lean();
    if (!u) return res.status(404).json({ message: "User not found" });

    res.json({
      ok: true,
      user: {
        _id: u._id,
        banned: u.banned,
        banReason: u.banReason,
        bannedUntil: u.bannedUntil,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const unbanUser = async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({ message: "Invalid user id" });

    const u = await User.findByIdAndUpdate(
      uid,
      {
        $set: { banned: false, banReason: null, bannedUntil: null },
        $unset: { bannedAt: "", bannedBy: "" },
      },
      { new: true }
    ).lean();

    if (!u) return res.status(404).json({ message: "User not found" });
    res.json({ ok: true, user: { _id: u._id, banned: u.banned } });
  } catch (e) {
    next(e);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const uid = toObjectId(req.params.uid);
    if (!uid) return res.status(400).json({ message: "Invalid user id" });

    const { role } = req.body || {};
    // ✅ Global rol sadeleştirme: sadece "customer" ve "admin" yazılabilir.
    const allowed = ["customer", "admin"];
    if (!allowed.includes(role)) {
      return res.status(400).json({
        message:
          'Invalid role. Only "customer" and "admin" can be set in the new multi-organization model.',
      });
    }

    const u0 = await User.findByIdAndUpdate(
      uid,
      { $set: { role } },
      { new: true }
    ).lean();
    if (!u0) return res.status(404).json({ message: "User not found" });

    res.json({
      ok: true,
      user: {
        _id: u0._id,
        name: u0.name,
        email: u0.email,
        role: u0.role,
        // Legacy restaurantId bilgisi sadece okunur amaçlı dönebilir
        restaurantId: u0.restaurantId ? u0.restaurantId.toString() : null,
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ------------ Reservations (global read-only) ------------ */
export const listReservationsAdmin = async (req, res, next) => {
  try {
    const {
      status,
      restaurantId,
      userId,
      start,
      end,
      reservationId,
    } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const { dt } = parseDateRange({ start, end });

    const q = {};
    if (status) q.status = status;
    if (reservationId) {
      const rid = toObjectId(reservationId);
      if (!rid)
        return res.status(400).json({ message: "Invalid reservationId" });
      q._id = rid;
    }

    if (restaurantId) {
      const rid = toObjectId(restaurantId);
      if (!rid)
        return res.status(400).json({ message: "Invalid restaurantId" });
      q.restaurantId = rid;
    }
    if (userId) {
      const uid = toObjectId(userId);
      if (!uid)
        return res.status(400).json({ message: "Invalid userId" });
      q.userId = uid;
    }

    if (cursor) q._id = { ...(q._id || {}), $lt: cursor };
    if (start || end) q.dateTimeUTC = dt;

    const rows = await Reservation.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate({ path: "userId", select: "name email" })
      .populate({ path: "restaurantId", select: "name" })
      .lean();

    const pickUser = (r) => {
      if (r.userId) return { name: r.userId.name, email: r.userId.email };
      if (r.user && (r.user.name || r.user.email)) return r.user;
      if (r.customer && (r.customer.name || r.customer.email))
        return r.customer;
      if (
        r.customerName ||
        r.guestName ||
        r.contactName ||
        r.name
      ) {
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
        ? {
            id: r.restaurantId._id?.toString?.() ?? null,
            name: r.restaurantId.name,
          }
        : null,
      userId: r.userId?._id?.toString() ?? null,
      user: pickUser(r) || undefined,
    }));

    res.json({ items, nextCursor: nextCursor(rows, limit) });
  } catch (e) {
    next(e);
  }
};

/* ------------ Reviews ------------ */
export const listReviews = async (req, res, next) => {
  try {
    const { restaurantId, userId, status } = req.query;
    const { limit, cursor } = pageParams(req.query);
    const q = {};
    if (restaurantId) q.restaurantId = toObjectId(restaurantId);
    if (userId) q.userId = toObjectId(userId);
    if (status) q.status = status;
    if (cursor) q._id = { $lt: cursor };

    const rows = await Review.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();
    res.json({ items: cut(rows, limit), nextCursor: nextCursor(rows, limit) });
  } catch (e) {
    next(e);
  }
};
export const hideReview = async (req, res, next) => {
  try {
    const r = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "hidden" } },
      { new: true }
    ).lean();
    if (!r) return res.status(404).json({ message: "Review not found" });
    res.json({ ok: true, status: r.status });
  } catch (e) {
    next(e);
  }
};
export const unhideReview = async (req, res, next) => {
  try {
    const r = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "visible" } },
      { new: true }
    ).lean();
    if (!r) return res.status(404).json({ message: "Review not found" });
    res.json({ ok: true, status: r.status });
  } catch (e) {
    next(e);
  }
};
export const removeReview = async (req, res, next) => {
  try {
    const r = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "removed" } },
      { new: true }
    ).lean();
    if (!r) return res.status(404).json({ message: "Review not found" });
    res.json({ ok: true, status: r.status });
  } catch (e) {
    next(e);
  }
};
/* ------------ USERS: Export & Stats ------------ */

/** CSV dışa aktarım */
export const exportUsers = async (req, res, next) => {
  try {
    const users = await User.find({})
      .select(
        "name email phone role banned riskScore noShowCount createdAt"
      )
      .lean();

    const parser = new Parser({
      fields: [
        "name",
        "email",
        "phone",
        "role",
        "banned",
        "riskScore",
        "noShowCount",
        "createdAt",
      ],
    });
    const csv = parser.parse(users);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=users.csv"
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

/** Toplam kullanıcı, banlı, yüksek riskli, ortalama risk */
export const userStats = async (req, res, next) => {
  try {
    const total = await User.countDocuments({});
    const banned = await User.countDocuments({ banned: true });
    const highRisk = await User.countDocuments({
      riskScore: { $gte: 75 },
    });
    const avgRiskAgg = await User.aggregate([
      { $match: { riskScore: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$riskScore" } } },
    ]);
    const avgRisk = avgRiskAgg[0]?.avg ?? 0;

    res.json({
      ok: true,
      total,
      banned,
      highRisk,
      avgRisk: Number(avgRisk.toFixed(1)),
    });
  } catch (e) {
    next(e);
  }
};
/* ------------ Complaints (şikayet yönetimi) ------------ */
/** Listele (admin panel tablosu için) */
export const listComplaints = async (req, res, next) => {
  try {
    const { status, restaurantId, userId } = req.query;
    const q = {};
    if (status) q.status = status;
    if (restaurantId)
      q.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    if (userId) q.userId = new mongoose.Types.ObjectId(userId);

    const rows = await Complaint.find(q)
      .sort({ createdAt: -1 })
      .populate("restaurantId", "name")
      .populate("userId", "name email")
      .lean();

    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
};

/** Çözüldü olarak işaretle */
export const resolveComplaint = async (req, res, next) => {
  try {
    const id = req.params.id;
    const c = await Complaint.findByIdAndUpdate(
      id,
      { $set: { status: "resolved" } },
      { new: true }
    ).lean();
    if (!c) return res.status(404).json({ message: "Complaint not found" });
    res.json({ ok: true, status: c.status });
  } catch (e) {
    next(e);
  }
};

/** Geçersiz / reddedildi olarak işaretle */
export const dismissComplaint = async (req, res, next) => {
  try {
    const id = req.params.id;
    const c = await Complaint.findByIdAndUpdate(
      id,
      { $set: { status: "dismissed" } },
      { new: true }
    ).lean();
    if (!c) return res.status(404).json({ message: "Complaint not found" });
    res.json({ ok: true, status: c.status });
  } catch (e) {
    next(e);
  }
};
/* ------------ Branch Requests (Admin) ------------ */

export const listBranchRequestsAdmin = async (req, res, next) => {
  try {
    const { status, organizationId, requestedBy } = req.query;
    const { limit, cursor } = pageParams(req.query);

    const q = {};

    if (status) {
      q.status = status;
    } else {
      // default: pending
      q.status = "pending";
    }

    if (organizationId) {
      const oid = toObjectId(organizationId);
      if (!oid) return res.status(400).json({ message: "Invalid organizationId" });
      q.organizationId = oid;
    }

    if (requestedBy) {
      const uid = toObjectId(requestedBy);
      if (!uid) return res.status(400).json({ message: "Invalid requestedBy" });
      q.requestedBy = uid;
    }

    if (cursor) {
      q._id = { $lt: cursor };
    }

    const rows = await BranchRequest.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate("organizationId", "name region")
      .populate("requestedBy", "name email")
      .populate("restaurantId", "name")
      .lean();

    const items = cut(rows, limit).map((r) => ({
      _id: r._id,
      status: r.status,
      organization: r.organizationId
        ? {
            id: r.organizationId._id?.toString?.() ?? null,
            name: r.organizationId.name,
            region: r.organizationId.region || null,
          }
        : null,
      requestedBy: r.requestedBy
        ? {
            id: r.requestedBy._id?.toString?.() ?? null,
            name: r.requestedBy.name,
            email: r.requestedBy.email,
          }
        : null,
      restaurant: r.restaurantId
        ? {
            id: r.restaurantId._id?.toString?.() ?? null,
            name: r.restaurantId.name,
          }
        : null,
      payload: r.payload,
      notes: r.notes || null,
      rejectReason: r.rejectReason || null,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt || null,
    }));

    res.json({ items, nextCursor: nextCursor(rows, limit) });
  } catch (e) {
    next(e);
  }
};

export const approveBranchRequestAdmin = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid branch request id" });

    const br = await BranchRequest.findById(id);
    if (!br) return res.status(404).json({ message: "Branch request not found" });

    if (br.status !== "pending") {
      return res.status(409).json({ message: "Branch request already resolved" });
    }

    const org = await Organization.findById(br.organizationId).lean();
    if (!org) {
      return res.status(400).json({ message: "Organization not found for this request" });
    }

    const user = await User.findById(br.requestedBy);
    if (!user) {
      return res.status(400).json({ message: "Requested user not found" });
    }

    const payload = br.payload || {};
    const region = payload.region || org.region || "TR";

    // Yeni Restaurant kaydı oluştur
    const restaurantDoc = await Restaurant.create({
      owner: user._id,
      organizationId: br.organizationId,
      name: payload.name,
      region,
      city: payload.city || undefined,
      address: payload.address || undefined,
      phone: payload.phone || undefined,
      iban: payload.iban || undefined,
      priceRange: payload.priceRange || "₺₺",
      businessType: payload.businessType || "restaurant",
      openingHours: Array.isArray(payload.openingHours)
        ? payload.openingHours
        : [],
      description: payload.description || undefined,

      // Multi-org statü + legacy flag
      status: "active",
      isActive: true,
    });

    // ✅ Kullanıcıyı organizasyon & şubeyle ilişkilendir
    await assignMemberships(user._id, {
      organizationId: br.organizationId,
      orgRole: "org_owner",
      restaurantId: restaurantDoc._id,
      restaurantRole: "location_manager",
      setLegacyRestaurantId: true,
    });

    // Branch request'i güncelle
    br.status = "approved";
    br.restaurantId = restaurantDoc._id;
    br.resolvedAt = new Date();
    br.resolvedBy = toObjectId(req.user?.id || req.user?._id) || undefined;
    br.rejectReason = undefined;

    await br.save();

    res.json({
      ok: true,
      request: {
        _id: br._id,
        status: br.status,
        organizationId: br.organizationId,
        requestedBy: br.requestedBy,
        restaurantId: br.restaurantId,
        resolvedAt: br.resolvedAt,
        resolvedBy: br.resolvedBy,
      },
      restaurant: {
        _id: restaurantDoc._id,
        name: restaurantDoc.name,
        region: restaurantDoc.region,
        city: restaurantDoc.city,
        address: restaurantDoc.address,
        phone: restaurantDoc.phone,
        organizationId: restaurantDoc.organizationId,
        status: restaurantDoc.status,
      },
    });
  } catch (e) {
    next(e);
  }
};

export const rejectBranchRequestAdmin = async (req, res, next) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid branch request id" });

    const { reason } = req.body || {};

    const br = await BranchRequest.findById(id);
    if (!br) return res.status(404).json({ message: "Branch request not found" });

    if (br.status !== "pending") {
      return res.status(409).json({ message: "Branch request already resolved" });
    }

    br.status = "rejected";
    br.rejectReason = reason || null;
    br.resolvedAt = new Date();
    br.resolvedBy = toObjectId(req.user?.id || req.user?._id) || undefined;

    await br.save();

    res.json({
      ok: true,
      request: {
        _id: br._id,
        status: br.status,
        organizationId: br.organizationId,
        requestedBy: br.requestedBy,
        rejectReason: br.rejectReason,
        resolvedAt: br.resolvedAt,
        resolvedBy: br.resolvedBy,
      },
    });
  } catch (e) {
    next(e);
  }
};