// DB-aware panel store resolution (owner ∪ marketMemberships). Shared across
// marketPanel.controller.js, marketCampaign.controller.js, promoReports.controller.js.
import mongoose from "mongoose";
import MarketStore from "../models/MarketStore.js";
import User from "../models/User.js";
import { buildAccessSet, pickStore } from "./panelStoreAccess.js";

const toObjectId = (id) => {
  try {
    const v = String(id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(v)) return null;
    return new mongoose.Types.ObjectId(v);
  } catch {
    return null;
  }
};

/**
 * Kullanıcının panel mağazasını çözer: owner ∪ marketMemberships.
 * storeId verilirse erişim doğrulanır; birden çok mağaza + storeId yoksa 400 STORE_CHOICE_REQUIRED.
 * @returns {{ store, access: "owner"|"manager" }|{ error }}
 */
export async function resolvePanelStore(reqUser, storeId) {
  const uid = toObjectId(reqUser?.id);
  if (!uid) return { error: { status: 401, message: "Yetkisiz" } };
  const [owned, userDoc] = await Promise.all([
    MarketStore.find({ owner: uid }).select("_id").lean(),
    User.findById(uid).select("marketMemberships").lean(),
  ]);
  const set = buildAccessSet(owned, userDoc?.marketMemberships);
  const picked = pickStore(set, storeId);
  if (picked === null) return { error: { status: 403, message: "Bu mağazaya erişiminiz yok" } };
  if (picked === undefined) return { error: { status: 400, code: "STORE_CHOICE_REQUIRED", message: "Birden fazla mağaza — storeId gönderin" } };
  const store = await MarketStore.findById(picked.storeId).lean();
  if (!store) return { error: { status: 404, message: "Mağaza bulunamadı" } };
  return { store, access: picked.access };
}
