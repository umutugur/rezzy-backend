import mongoose from "mongoose";
import BranchRequest from "../models/BranchRequest.js";
import Organization from "../models/Organization.js";
import { MARKET_STORE_CATEGORIES } from "../models/MarketStore.js";

const toId = (v) => {
  try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
};

/** POST /api/market/org/:organizationId/branch-requests */
export const createMarketBranchRequest = async (req, res, next) => {
  try {
    const orgId = toId(req.params.organizationId);
    if (!orgId) return res.status(400).json({ message: "Invalid organizationId" });
    const userId = toId(req.user?.id || req.user?._id);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const org = await Organization.findById(orgId).select("_id name region").lean();
    if (!org) return res.status(404).json({ message: "Organization not found" });

    const b = req.body || {};
    const name = String(b.name || "").trim();
    const category = String(b.category || "").trim();
    const address = String(b.address || "").trim();
    const coords = b.location?.coordinates;

    if (!name) return res.status(400).json({ message: "name zorunlu" });
    if (!MARKET_STORE_CATEGORIES.includes(category))
      return res.status(400).json({ message: "Geçersiz kategori" });
    if (!address) return res.status(400).json({ message: "address zorunlu" });
    if (!Array.isArray(coords) || coords.length !== 2)
      return res.status(400).json({ message: "location.coordinates [lng,lat] zorunlu" });

    const payload = {
      name,
      category,
      address,
      city: b.city ? String(b.city).trim() : null,
      phone: b.phone ? String(b.phone).trim() : null,
      location: { type: "Point", coordinates: [Number(coords[0]), Number(coords[1])] },
    };

    const doc = await BranchRequest.create({
      type: "market",
      organizationId: orgId,
      requestedBy: userId,
      status: "pending",
      payload,
      notes: b.notes ? String(b.notes) : undefined,
    });

    res.status(201).json({ ok: true, request: doc.toObject() });
  } catch (e) { next(e); }
};

/** GET /api/market/org/:organizationId/branch-requests?status= */
export const listMarketBranchRequests = async (req, res, next) => {
  try {
    const orgId = toId(req.params.organizationId);
    if (!orgId) return res.status(400).json({ message: "Invalid organizationId" });
    const q = { organizationId: orgId, type: "market" };
    if (req.query.status) q.status = String(req.query.status);
    const rows = await BranchRequest.find(q).sort({ createdAt: -1 }).lean();
    res.json({ items: rows });
  } catch (e) { next(e); }
};
