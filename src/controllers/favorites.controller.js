// controllers/favorites.controller.js
import mongoose from "mongoose";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";

const toObjectId = (id) => {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
};

// GET /api/me/favorites
export const listMyFavorites = async (req, res, next) => {
  try {
    const me = await User.findById(req.user.id).select("_id favorites").lean();
    const ids = (me?.favorites || []).map(String);
    if (!ids.length) return res.json([]);

    const rows = await Restaurant.find({ _id: { $in: ids } })
      .select("_id name city address photos priceRange rating")
      .lean();

    // Orijinal sırayı korumak için map
    const byId = new Map(rows.map(r => [String(r._id), r]));
    const ordered = ids.map(id => byId.get(id)).filter(Boolean);

    res.json(ordered);
  } catch (e) { next(e); }
};

// POST /api/me/favorites/:rid  (ekle — idempotent)
export const addFavorite = async (req, res, next) => {
  try {
    const rid = toObjectId(req.params.rid);
    if (!rid) return res.status(400).json({ message: "Invalid restaurant id" });

    const exists = await Restaurant.exists({ _id: rid });
    if (!exists) return res.status(404).json({ message: "Restaurant not found" });

    const u = await User.findByIdAndUpdate(
      req.user.id,
      { $addToSet: { favorites: rid } },
      { new: true }
    ).select("_id favorites");
    res.json({ ok: true, count: u.favorites.length });
  } catch (e) { next(e); }
};

// DELETE /api/me/favorites/:rid  (çıkar — idempotent)
export const removeFavorite = async (req, res, next) => {
  try {
    const rid = toObjectId(req.params.rid);
    if (!rid) return res.status(400).json({ message: "Invalid restaurant id" });

    const u = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { favorites: rid } },
      { new: true }
    ).select("_id favorites");
    res.json({ ok: true, count: u.favorites.length });
  } catch (e) { next(e); }
};

// (opsiyonel) POST /api/me/favorites/:rid/toggle
export const toggleFavorite = async (req, res, next) => {
  try {
    const rid = toObjectId(req.params.rid);
    if (!rid) return res.status(400).json({ message: "Invalid restaurant id" });

    const me = await User.findById(req.user.id).select("_id favorites");
    const has = me.favorites.some(x => String(x) === String(rid));

    const u = await User.findByIdAndUpdate(
      req.user.id,
      has ? { $pull: { favorites: rid } } : { $addToSet: { favorites: rid } },
      { new: true }
    ).select("_id favorites");

    res.json({ ok: true, favorited: !has, count: u.favorites.length });
  } catch (e) { next(e); }
};
