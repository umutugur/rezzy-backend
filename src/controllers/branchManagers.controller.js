// src/controllers/branchManagers.controller.js
import mongoose from "mongoose";
import User from "../models/User.js";
import MarketStore from "../models/MarketStore.js";
import Restaurant from "../models/Restaurant.js";

const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null);

async function assertStoreInOrg(storeId, organizationId) {
  const s = await MarketStore.findOne({ _id: oid(storeId), organization: oid(organizationId) }).select("_id name").lean();
  return s || null;
}
async function assertRestaurantInOrg(rid, organizationId) {
  const r = await Restaurant.findOne({ _id: oid(rid), organizationId: oid(organizationId) }).select("_id name").lean();
  return r || null;
}

const PUBLIC_USER = "_id name email";

// ── MARKET ────────────────────────────────────────────────────────────────────
export const listStoreManagers = async (req, res, next) => {
  try {
    const store = await assertStoreInOrg(req.params.storeId, req.params.organizationId);
    if (!store) return res.status(404).json({ message: "Şube bu organizasyonda bulunamadı" });
    const users = await User.find({ "marketMemberships.store": store._id }).select(PUBLIC_USER).lean();
    res.json({ items: users });
  } catch (e) { next(e); }
};

export const addStoreManager = async (req, res, next) => {
  try {
    const store = await assertStoreInOrg(req.params.storeId, req.params.organizationId);
    if (!store) return res.status(404).json({ message: "Şube bu organizasyonda bulunamadı" });
    const { name, email, password } = req.body || {};
    const mail = String(email || "").trim().toLowerCase();
    if (!mail) return res.status(400).json({ message: "E-posta zorunlu" });

    let user = await User.findOne({ email: mail });
    if (!user) {
      if (!name || !password || String(password).length < 6)
        return res.status(400).json({ message: "Yeni kullanıcı için ad ve en az 6 karakter şifre gerekli" });
      user = new User({ name: String(name).trim(), email: mail, password: String(password), role: "customer" });
      // pre-save hook şifreyi hash'ler (User.js). role/organizations'a DOKUNMA.
    }
    const exists = (user.marketMemberships || []).some((m) => String(m.store) === String(store._id));
    if (!exists) user.marketMemberships = [...(user.marketMemberships || []), { store: store._id, role: "location_manager" }];
    await user.save();
    res.status(201).json({ item: { _id: user._id, name: user.name, email: user.email } });
  } catch (e) { next(e); }
};

export const removeStoreManager = async (req, res, next) => {
  try {
    const store = await assertStoreInOrg(req.params.storeId, req.params.organizationId);
    if (!store) return res.status(404).json({ message: "Şube bu organizasyonda bulunamadı" });
    await User.updateOne({ _id: oid(req.params.userId) }, { $pull: { marketMemberships: { store: store._id } } });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// ── RESTAURANT ────────────────────────────────────────────────────────────────
export const listRestaurantManagers = async (req, res, next) => {
  try {
    const r0 = await assertRestaurantInOrg(req.params.rid, req.params.organizationId);
    if (!r0) return res.status(404).json({ message: "Restoran bu organizasyonda bulunamadı" });
    const users = await User.find({ "restaurantMemberships.restaurant": r0._id }).select(PUBLIC_USER + " restaurantMemberships").lean();
    const items = users.map((u) => ({
      _id: u._id, name: u.name, email: u.email,
      role: (u.restaurantMemberships || []).find((m) => String(m.restaurant) === String(r0._id))?.role || "-",
    }));
    res.json({ items });
  } catch (e) { next(e); }
};

export const addRestaurantManager = async (req, res, next) => {
  try {
    const r0 = await assertRestaurantInOrg(req.params.rid, req.params.organizationId);
    if (!r0) return res.status(404).json({ message: "Restoran bu organizasyonda bulunamadı" });
    const { name, email, password } = req.body || {};
    const mail = String(email || "").trim().toLowerCase();
    if (!mail) return res.status(400).json({ message: "E-posta zorunlu" });
    let user = await User.findOne({ email: mail });
    if (!user) {
      if (!name || !password || String(password).length < 6)
        return res.status(400).json({ message: "Yeni kullanıcı için ad ve en az 6 karakter şifre gerekli" });
      user = new User({ name: String(name).trim(), email: mail, password: String(password), role: "customer" });
    }
    const exists = (user.restaurantMemberships || []).some((m) => String(m.restaurant) === String(r0._id));
    if (!exists) user.restaurantMemberships = [...(user.restaurantMemberships || []), { restaurant: r0._id, role: "location_manager" }];
    await user.save();
    // KURAL: organizations[] eklenmez, role yükseltilmez, legacy restaurantId set edilmez.
    res.status(201).json({ item: { _id: user._id, name: user.name, email: user.email } });
  } catch (e) { next(e); }
};

export const removeRestaurantManager = async (req, res, next) => {
  try {
    const r0 = await assertRestaurantInOrg(req.params.rid, req.params.organizationId);
    if (!r0) return res.status(404).json({ message: "Restoran bu organizasyonda bulunamadı" });
    await User.updateOne({ _id: oid(req.params.userId) }, { $pull: { restaurantMemberships: { restaurant: r0._id } } });
    res.json({ ok: true });
  } catch (e) { next(e); }
};
