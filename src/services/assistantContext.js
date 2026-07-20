// src/services/assistantContext.js
//
// Kullanıcının "canlı durumu" — asistanın her mesajda sistem prompt'una
// enjekte ettiği hafif özet + `get_my_context` read aracının tam hali.
// Spec §4: docs/superpowers/specs/2026-07-16-full-assistant-design.md
//
// `buildUserContext(userId)`  -> DB'ye ~6 paralel lean sorgu, ham veri döner.
// `summarizeContext(raw)`     -> SAF fonksiyon, ham veriyi kompakt/insan-okur
//                                 JSON'a çevirir (id'ler string, sadece özet alanlar).

import mongoose from "mongoose";
import Reservation from "../models/Reservation.js";
import MarketOrder from "../models/MarketOrder.js";
import DeliveryOrder from "../models/DeliveryOrder.js";
import TaxiRide from "../models/TaxiRide.js";
import ScheduledRide from "../models/ScheduledRide.js";
import UserCoupon from "../models/UserCoupon.js";
import UserAddress from "../models/UserAddress.js";

// Terminal (bitmiş) durumlar — "aktif" sipariş/yolculuk sayılmaz.
const MARKET_TERMINAL = ["delivered", "cancelled"];
const DELIVERY_TERMINAL = ["delivered", "cancelled"];
const TAXI_TERMINAL = ["completed", "cancelled"];
const SCHEDULED_TERMINAL = ["converted", "cancelled", "failed"];

const RESERVATION_UPCOMING_STATUSES = ["pending", "confirmed"];

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;
}

/**
 * Kullanıcının canlı durumunu paralel lean sorgularla toplar (DB'ye bağlı).
 * Hata durumunda her bölüm bağımsız olarak null/[]/0'a düşer — tek bir
 * sorgunun başarısız olması diğerlerini etkilemez.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {Promise<object>} ham (lean) sonuçlar — bkz. summarizeContext
 */
export async function buildUserContext(userId) {
  const empty = {
    activeMarketOrder: null,
    activeDeliveryOrder: null,
    activeTaxiRide: null,
    upcomingReservations: [],
    activeCouponCount: 0,
    defaultAddress: null,
  };

  if (!userId) return empty;

  const uid = toObjectId(userId);
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const until48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const safe = (p) => p.catch(() => null);
  const safeArr = (p) => p.catch(() => []);
  const safeNum = (p) => p.catch(() => 0);

  const [
    activeMarketOrder,
    activeDeliveryOrder,
    activeTaxiRide,
    upcomingReservationsRaw,
    activeCouponCount,
    defaultAddress,
  ] = await Promise.all([
    safe(
      MarketOrder.findOne({
        customer: uid,
        status: { $nin: MARKET_TERMINAL },
        createdAt: { $gte: since24h },
      })
        .sort({ createdAt: -1 })
        .populate("store", "_id name")
        .lean()
    ),
    safe(
      DeliveryOrder.findOne({
        userId: uid,
        status: { $nin: DELIVERY_TERMINAL },
        createdAt: { $gte: since24h },
      })
        .sort({ createdAt: -1 })
        .populate("restaurantId", "_id name")
        .lean()
    ),
    safe(
      TaxiRide.findOne({ passenger: uid, status: { $nin: TAXI_TERMINAL } })
        .sort({ requestedAt: -1 })
        .lean()
    ),
    safeArr(
      Reservation.find({
        userId: uid,
        status: { $in: RESERVATION_UPCOMING_STATUSES },
        dateTimeUTC: { $gte: now, $lte: until48h },
      })
        .sort({ dateTimeUTC: 1 })
        .populate("restaurantId", "_id name")
        .lean()
    ),
    safeNum(UserCoupon.countDocuments({ user: uid, status: "active" })),
    safe(
      UserAddress.findOne({ userId: uid, isActive: true })
        .sort({ isDefault: -1, updatedAt: -1 })
        .lean()
    ),
  ]);

  // Yaklaşan rezervasyonlara bağlı ScheduledRide'lar (varsa) — tek ek sorgu.
  const reservationIds = (upcomingReservationsRaw || []).map((r) => r._id).filter(Boolean);
  let scheduledRides = [];
  if (reservationIds.length) {
    scheduledRides = await ScheduledRide.find({
      reservationId: { $in: reservationIds },
      status: { $nin: SCHEDULED_TERMINAL },
    })
      .lean()
      .catch(() => []);
  }
  const scheduledByReservation = new Map(
    (scheduledRides || []).map((sr) => [String(sr.reservationId), sr])
  );

  const upcomingReservations = (upcomingReservationsRaw || []).map((r) => ({
    ...r,
    scheduledRide: scheduledByReservation.get(String(r._id)) || null,
  }));

  return {
    activeMarketOrder: activeMarketOrder || null,
    activeDeliveryOrder: activeDeliveryOrder || null,
    activeTaxiRide: activeTaxiRide || null,
    upcomingReservations,
    activeCouponCount: Number(activeCouponCount) || 0,
    defaultAddress: defaultAddress || null,
  };
}

/**
 * SAF fonksiyon: buildUserContext'in ham çıktısını (veya mock verisini)
 * kompakt, insan-okur bir özet objesine çevirir. DB'ye dokunmaz, side-effect'siz.
 * Sistem prompt'una JSON.stringify edilerek verilir.
 *
 * @param {object} raw - buildUserContext çıktısı (veya eşdeğer şekilli mock)
 * @returns {object} kompakt özet
 */
export function summarizeContext(raw) {
  const r = raw || {};
  const summary = {};

  const marketOrder = r.activeMarketOrder;
  if (marketOrder) {
    summary.activeMarketOrder = {
      id: marketOrder._id ? String(marketOrder._id) : null,
      store:
        (marketOrder.store && typeof marketOrder.store === "object"
          ? marketOrder.store.name
          : null) || null,
      status: marketOrder.status || null,
      type: marketOrder.type || null,
    };
  }

  const deliveryOrder = r.activeDeliveryOrder;
  if (deliveryOrder) {
    summary.activeDeliveryOrder = {
      id: deliveryOrder._id ? String(deliveryOrder._id) : null,
      restaurant:
        (deliveryOrder.restaurantId && typeof deliveryOrder.restaurantId === "object"
          ? deliveryOrder.restaurantId.name
          : null) || null,
      status: deliveryOrder.status || null,
    };
  }

  const taxiRide = r.activeTaxiRide;
  if (taxiRide) {
    summary.activeTaxiRide = {
      id: taxiRide._id ? String(taxiRide._id) : null,
      status: taxiRide.status || null,
      vehicleType: taxiRide.vehicleType || null,
    };
  }

  const upcoming = Array.isArray(r.upcomingReservations) ? r.upcomingReservations : [];
  summary.upcomingReservations = upcoming.map((res) => {
    const restaurant =
      res?.restaurantId && typeof res.restaurantId === "object" ? res.restaurantId : null;
    const scheduledRide = res?.scheduledRide || null;
    return {
      id: res?._id ? String(res._id) : null,
      restaurant: restaurant?.name || null,
      dateTimeUTC: res?.dateTimeUTC || null,
      partySize: res?.partySize ?? null,
      status: res?.status || null,
      scheduledRide: scheduledRide
        ? {
            id: scheduledRide._id ? String(scheduledRide._id) : null,
            status: scheduledRide.status || null,
            pickupAt: scheduledRide.pickupAt || null,
          }
        : null,
    };
  });

  summary.activeCouponCount = Number(r.activeCouponCount) || 0;

  const address = r.defaultAddress;
  summary.defaultAddress = address
    ? {
        id: address._id ? String(address._id) : null,
        title: address.title || null,
        fullAddress: address.fullAddress || null,
      }
    : null;

  return summary;
}
