// src/controllers/org.controller.js
import mongoose from "mongoose";
import BranchRequest from "../models/BranchRequest.js";
import Organization from "../models/Organization.js";

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

    // Kullanıcının bu organizasyonda owner/admin rolü var mı?
    const orgRoles = Array.isArray(req.user.organizations)
      ? req.user.organizations
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
      return res
        .status(403)
        .json({ message: "You are not allowed to create branch requests for this organization" });
    }

    // Organizasyon gerçekten var mı?
    const org = await Organization.findById(orgId).select("_id name region").lean();
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

    const orgRoles = Array.isArray(req.user.organizations)
      ? req.user.organizations
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