// src/controllers/org.controller.js
import mongoose from "mongoose";
import BranchRequest from "../models/BranchRequest.js";
import Organization from "../models/Organization.js";
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
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

async function loadUserWithOrganizations(req) {
  const uid = toObjectId(req.user?.id || req.user?._id);
  if (!uid) return null;

  const user = await User.findById(uid)
    .select("_id role organizations")
    .lean();

  return user;
}

/* ------------------------------------------------------------------ */
/*  ORG OWNER / ORG ADMIN PANEL FONKSİYONLARI                         */
/* ------------------------------------------------------------------ */

/**
 * Org owner / org_admin → Kendi organizasyonlarını listeler
 * GET /api/org/organizations
 */
export const listMyOrganizations = async (req, res, next) => {
  try {
    const user = await loadUserWithOrganizations(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgRoles = Array.isArray(user.organizations)
      ? user.organizations
      : [];

    // Sadece org_owner / org_admin rollerini dikkate al
    const ownedOrgIds = orgRoles
      .filter((o) => o && (o.role === "org_owner" || o.role === "org_admin"))
      .map((o) => toObjectId(o.organization || o.organizationId))
      .filter(Boolean);

    if (!ownedOrgIds.length) {
      return res.json({ items: [], nextCursor: undefined });
    }

    const { limit, cursor } = pageParams(req.query || {});

    const q = { _id: { $in: ownedOrgIds } };
    if (cursor) {
      q._id.$lt = cursor;
    }

    const rows = await Organization.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select(
        "_id name legalName region defaultLanguage taxNumber taxOffice createdAt updatedAt"
      )
      .lean();

    const sliced = cut(rows, limit);
    const ids = sliced.map((o) => o._id).filter(Boolean);

    // Her organizasyona bağlı restoran sayısı
    let countMap = new Map();
    if (ids.length > 0) {
      const counts = await Restaurant.aggregate([
        { $match: { organizationId: { $in: ids } } },
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

/**
 * Org owner / org_admin → Tek organizasyon detayı + restoranlar + üyeler
 * GET /api/org/organizations/:oid
 */
export const getMyOrganizationDetail = async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.oid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }

    const user = await loadUserWithOrganizations(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgRoles = Array.isArray(user.organizations)
      ? user.organizations
      : [];

    const hasAccess = orgRoles.some((o) => {
      if (!o) return false;
      const orgRef = o.organization || o.organizationId;
      if (!orgRef) return false;
      return (
        String(orgRef) === String(oid) &&
        (o.role === "org_owner" || o.role === "org_admin")
      );
    });

    if (!hasAccess && user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const org = await Organization.findById(oid)
      .select(
        "_id name legalName logoUrl region defaultLanguage description taxNumber taxOffice createdAt updatedAt"
      )
      .lean();

    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    // Bu organizasyona bağlı restoranlar
    const restaurants = await Restaurant.find({ organizationId: oid })
      .select("_id name city region isActive")
      .sort({ name: 1 })
      .lean();

    // Organizasyona bağlı kullanıcılar (users.organizations[] içinden)
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

/**
 * Org owner / org_admin → Organizasyona bağlı restoranların listesi
 * GET /api/org/organizations/:oid/restaurants
 */
export const listOrganizationRestaurantsForOwner = async (
  req,
  res,
  next
) => {
  try {
    const oid = toObjectId(req.params.oid);
    if (!oid) {
      return res.status(400).json({ message: "Invalid organization id" });
    }

    const user = await loadUserWithOrganizations(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgRoles = Array.isArray(user.organizations)
      ? user.organizations
      : [];

    const hasAccess = orgRoles.some((o) => {
      if (!o) return false;
      const orgRef = o.organization || o.organizationId;
      if (!orgRef) return false;
      return (
        String(orgRef) === String(oid) &&
        (o.role === "org_owner" || o.role === "org_admin")
      );
    });

    if (!hasAccess && user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { limit, cursor } = pageParams(req.query || {});

    const q = { organizationId: oid };
    if (cursor) {
      q._id = { $lt: cursor };
    }

    const rows = await Restaurant.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .select(
        "_id name city address phone email region isActive organizationId"
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

/* ------------------------------------------------------------------ */
/*  BRANCH REQUEST (ZATEN MEVCUT OLANLAR)                             */
/* ------------------------------------------------------------------ */

/**
 * Org owner / org_admin → Yeni şube açma talebi
 * POST /org/branch-requests
 */
export const createBranchRequest = async (req, res, next) => {
  try {
    const userId = toObjectId(req.user?.id || req.user?._id);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      organizationId,
      name,
      region,
      city,
      address,
      phone,
      iban,
      priceRange,
      businessType,
      openingHours,
      description,
      notes,
    } = req.body || {};

    const orgId = toObjectId(organizationId);
    if (!orgId) {
      return res.status(400).json({ message: "Invalid organizationId" });
    }

    const user = await loadUserWithOrganizations(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgRoles = Array.isArray(user.organizations)
      ? user.organizations
      : [];

    const hasAccess = orgRoles.some((o) => {
      const oid = o.organization || o.organizationId;
      const role = o.role;
      return (
        oid &&
        String(oid) === String(orgId) &&
        (role === "org_owner" || role === "org_admin")
      );
    });

    if (!hasAccess) {
      return res.status(403).json({
        message:
          "You are not allowed to create branch requests for this organization",
      });
    }

    // Organizasyon gerçekten var mı?
    const org = await Organization.findById(orgId)
      .select("_id name region")
      .lean();
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }

    const payload = {
      name,
      region,
      city: city || null,
      address: address || null,
      phone: phone || null,
      iban: iban || null,
      priceRange: priceRange || "₺₺",
      businessType: businessType || "restaurant",
      openingHours: Array.isArray(openingHours) ? openingHours : [],
      description: description || null,
    };

    const doc = await BranchRequest.create({
      organizationId: orgId,
      requestedBy: userId,
      status: "pending",
      payload,
      notes: notes || undefined,
    });

    res.status(201).json({
      ok: true,
      request: {
        _id: doc._id,
        organizationId: doc.organizationId,
        requestedBy: doc.requestedBy,
        status: doc.status,
        payload: doc.payload,
        notes: doc.notes || null,
        createdAt: doc.createdAt,
      },
    });
  } catch (e) {
    next(e);
  }
};

/**
 * Org owner / org_admin → Kendi organizasyonları için branch request listesi
 * GET /org/branch-requests
 */
export const listMyBranchRequests = async (req, res, next) => {
  try {
    const userId = toObjectId(req.user?.id || req.user?._id);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { status, organizationId } = req.query;
    const { limit, cursor } = pageParams(req.query);

    const user = await loadUserWithOrganizations(req);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const orgRoles = Array.isArray(user.organizations)
      ? user.organizations
      : [];

    // Kullanıcının erişebildiği organizasyonlar
    let accessibleOrgIds = orgRoles
      .filter((o) => {
        const role = o.role;
        return role === "org_owner" || role === "org_admin";
      })
      .map((o) => toObjectId(o.organization || o.organizationId))
      .filter(Boolean);

    if (!accessibleOrgIds.length) {
      return res.json({ items: [], nextCursor: undefined });
    }

    const q = {
      organizationId: { $in: accessibleOrgIds },
    };

    if (status) {
      q.status = status;
    }

    if (organizationId) {
      const oid = toObjectId(organizationId);
      if (!oid) {
        return res.status(400).json({ message: "Invalid organizationId" });
      }
      q.organizationId = oid;
    }

    if (cursor) {
      q._id = { $lt: cursor };
    }

    const rows = await BranchRequest.find(q)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .populate("organizationId", "name region")
      .populate("restaurantId", "name")
      .lean();

    const items = cut(rows, limit).map((r) => ({
      _id: r._id,
      organization: r.organizationId
        ? {
            id: r.organizationId._id?.toString?.() ?? null,
            name: r.organizationId.name,
            region: r.organizationId.region || null,
          }
        : null,
      status: r.status,
      payload: r.payload,
      notes: r.notes || null,
      restaurant: r.restaurantId
        ? {
            id: r.restaurantId._id?.toString?.() ?? null,
            name: r.restaurantId.name,
          }
        : null,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt || null,
      rejectReason: r.rejectReason || null,
    }));

    res.json({ items, nextCursor: nextCursor(rows, limit) });
  } catch (e) {
    next(e);
  }
};