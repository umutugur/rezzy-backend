// src/services/assistantWriteTools.js
//
// Write-tool draft builders + executors for the assistant (spec §2/§3, plan A3).
//
// Two maps, keyed by the tool `name` from src/ai/assistant.tools.js:
//   BUILD_DRAFT[name](args, {userId, region}) →
//       { kind, params, serverTotals, card:{title,lines,total?,destructive?} }   // ready to confirm
//     | { handoff:{screen, params, label} }                                        // needs in-app UI (e.g. online pay)
//     | { error:"<reason>" }                                                       // validation failed
//   EXECUTE_DRAFT[kind](params, {userId}) → { ok, message, handoff? } | { ok:false, message }
//
// SECURITY: builders recompute every price on the server from the DB — the LLM's
// numbers are never trusted. Executors call EXISTING cores/handlers only (no copied
// business logic); classic (req,res,next) handlers are adapted via `invoke()`.

import mongoose from "mongoose";
import Restaurant from "../models/Restaurant.js";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";
import { resolveStoreCatalog } from "../services/marketCatalogResolve.service.js";
import { getRouteInfo } from "./places.service.js";
import { estimateFareForRegion } from "./taxiPricing.service.js";

import { createReservationCore } from "../controllers/reservation.controller.js";
import {
  cancelReservationForUser,
  updateReservationForUser,
} from "../controllers/assistant.controller.js";
import { createOrder, cancelOrder } from "../controllers/market.controller.js";
import { createDeliveryOrderCOD } from "../controllers/deliveryOrders.controller.js";
import { createRideCore, cancelRide } from "../controllers/taxi.controller.js";
import {
  updateScheduledRide,
  cancelScheduledRideCustomer,
} from "../controllers/scheduledRide.controller.js";

/* ── Express-handler adapter (identical spirit to assistantReadTools) ───────── */
function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return res; },
      json(payload) { resolve({ status: statusCode, body: payload }); },
    };
    const next = (err) => reject(err instanceof Error ? err : err || new Error("handler_error"));
    try { Promise.resolve(handler(req, res, next)).catch(reject); }
    catch (err) { reject(err); }
  });
}
function baseReq({ userId, region, params = {}, body = {}, query = {} } = {}) {
  return {
    user: { id: userId, role: "customer", region },
    params, body, query,
    headers: { "x-region": region || "" },
  };
}
const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)));
const money = (n) => `₺${Math.round(Number(n) || 0)}`;
function errMsg(e, fb) {
  if (!e) return fb;
  if (typeof e === "string") return e;
  return e.message || e.body?.message || e.error || fb;
}

/* ══════════════════════════ BUILD_DRAFT ══════════════════════════ */

export const BUILD_DRAFT = {
  // ── Reservation ──────────────────────────────────────────────────────────
  async draft_reservation(args, { userId }) {
    const { restaurantId, dateTimeISO, partySize, menuSelections } = args || {};
    if (!oid(restaurantId)) return { error: "restaurantId geçersiz" };
    if (!dateTimeISO || Number.isNaN(new Date(dateTimeISO).getTime())) return { error: "dateTimeISO geçersiz" };
    const ps = Math.max(1, parseInt(partySize, 10) || 1);
    const rest = await Restaurant.findById(restaurantId).select("name").lean();
    if (!rest) return { error: "Restoran bulunamadı" };

    const lines = [
      { label: "Restoran", value: rest.name },
      { label: "Tarih", value: new Date(dateTimeISO).toLocaleString("tr-TR") },
      { label: "Kişi", value: String(ps) },
    ];
    const params = {
      restaurantId: String(restaurantId),
      dateTimeISO,
      partySize: ps,
      selections: Array.isArray(menuSelections) ? menuSelections : [],
    };
    return { kind: "reservation_create", params, serverTotals: {}, card: { title: "Rezervasyon", lines } };
  },

  async draft_reservation_cancel(args) {
    const { rid } = args || {};
    if (!oid(rid)) return { error: "rid geçersiz" };
    return {
      kind: "reservation_cancel",
      params: { rid: String(rid) },
      serverTotals: {},
      card: { title: "Rezervasyon İptali", lines: [{ label: "İşlem", value: "Bu rezervasyon iptal edilecek" }], destructive: true },
    };
  },

  async draft_reservation_modify(args) {
    const { rid, dateTimeISO, partySize } = args || {};
    if (!oid(rid)) return { error: "rid geçersiz" };
    const lines = [];
    if (dateTimeISO) lines.push({ label: "Yeni tarih", value: new Date(dateTimeISO).toLocaleString("tr-TR") });
    if (partySize) lines.push({ label: "Yeni kişi", value: String(partySize) });
    if (!lines.length) return { error: "Değiştirilecek bir alan belirtilmedi" };
    return {
      kind: "reservation_modify",
      params: { rid: String(rid), dateTimeISO: dateTimeISO || null, partySize: partySize ? parseInt(partySize, 10) : null },
      serverTotals: {},
      card: { title: "Rezervasyon Güncelle", lines },
    };
  },

  // ── Market ───────────────────────────────────────────────────────────────
  async draft_market_order(args, { userId }) {
    const { storeId, items, addressId, paymentMethod = "cash", couponCampaignId, outOfStockPreference } = args || {};
    if (!oid(storeId)) return { error: "storeId geçersiz" };
    if (!Array.isArray(items) || !items.length) return { error: "Sepet boş" };
    const store = await MarketStore.findById(storeId).select("name organization").lean();
    if (!store) return { error: "Mağaza bulunamadı" };

    // Fiyatları SUNUCUDA çöz (org kataloğu + şube override dahil)
    const catalog = await resolveStoreCatalog(store).catch(() => []);
    const byId = new Map(catalog.map((p) => [String(p._id ?? p.orgProductId ?? p.productId), p]));
    let subtotal = 0;
    const lines = [];
    for (const it of items) {
      const pid = String(it.productId ?? it.id ?? "");
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      const prod = byId.get(pid);
      if (!prod) return { error: `Ürün bulunamadı: ${pid}` };
      const price = Number(prod.discountPrice ?? prod.price ?? prod.defaultPrice ?? 0);
      subtotal += price * qty;
      lines.push({ label: `${qty}× ${prod.title || prod.name}`, value: money(price * qty) });
    }

    if (paymentMethod === "online") {
      // Online ödeme sohbetten alınamaz → sepeti hazır aç
      return {
        handoff: {
          screen: "MarketCart",
          params: { storeId: String(storeId), items, couponCampaignId: couponCampaignId || null },
          label: "Ödeme için sepeti aç",
        },
      };
    }

    const pm = ["cash", "card_on_delivery"].includes(paymentMethod) ? paymentMethod : "cash";
    lines.push({ label: "Ödeme", value: pm === "cash" ? "Kapıda nakit" : "Kapıda kart" });
    return {
      kind: "market_order_create",
      params: {
        storeId: String(storeId),
        items: items.map((it) => ({ productId: String(it.productId ?? it.id), qty: Math.max(1, parseInt(it.qty, 10) || 1) })),
        deliveryAddressId: addressId ? String(addressId) : null,
        paymentMethod: pm,
        couponCampaignId: couponCampaignId || null,
        outOfStockPreference: outOfStockPreference || undefined,
      },
      serverTotals: { subtotal },
      card: { title: `${store.name} — Market Siparişi`, lines, total: money(subtotal) },
    };
  },

  async draft_market_order_cancel(args) {
    const { orderId } = args || {};
    if (!oid(orderId)) return { error: "orderId geçersiz" };
    return {
      kind: "market_order_cancel",
      params: { orderId: String(orderId) },
      serverTotals: {},
      card: { title: "Sipariş İptali", lines: [{ label: "İşlem", value: "Market siparişin iptal edilecek" }], destructive: true },
    };
  },

  // ── Delivery ─────────────────────────────────────────────────────────────
  async draft_delivery_order(args, { userId }) {
    const { restaurantId, items, addressId, paymentMethod = "cash", couponCampaignId, note } = args || {};
    if (!oid(restaurantId)) return { error: "restaurantId geçersiz" };
    if (!Array.isArray(items) || !items.length) return { error: "Sepet boş" };
    if (!oid(addressId)) return { error: "Teslimat adresi gerekli" };
    if (paymentMethod === "online") {
      return {
        handoff: {
          screen: "DeliveryRestaurant",
          params: { restaurantId: String(restaurantId) },
          label: "Menüyü açıp online ödeme ile tamamla",
        },
      };
    }
    const pm = ["cash", "card_on_delivery"].includes(paymentMethod) ? paymentMethod : "cash";
    const rest = await Restaurant.findById(restaurantId).select("name").lean();
    // Fiyat/menü doğrulaması COD handler'ının kendi içinde yapılıyor; kart özeti kalem sayısı ile.
    const lines = [
      { label: "Restoran", value: rest?.name || "Restoran" },
      { label: "Ürün", value: `${items.length} kalem` },
      { label: "Ödeme", value: pm === "cash" ? "Kapıda nakit" : "Kapıda kart" },
    ];
    return {
      kind: "delivery_order_create",
      params: {
        restaurantId: String(restaurantId),
        addressId: String(addressId),
        items,
        paymentMethod: pm,
        couponCampaignId: couponCampaignId || null,
        customerNote: note || "",
      },
      serverTotals: {},
      card: { title: "Paket Servis Siparişi", lines },
    };
  },

  async draft_delivery_order_cancel(args) {
    const { orderId } = args || {};
    if (!oid(orderId)) return { error: "orderId geçersiz" };
    return {
      kind: "delivery_order_cancel",
      params: { orderId: String(orderId) },
      serverTotals: {},
      card: { title: "Sipariş İptali", lines: [{ label: "İşlem", value: "Paket servis siparişin iptal edilecek" }], destructive: true },
    };
  },

  // ── Taxi (instant) ───────────────────────────────────────────────────────
  async draft_taxi_call(args, { userId, region }) {
    const { pickup, dropoff, vehicleType = "ride", acceptsPets = false } = args || {};
    if (!pickup?.address || typeof pickup?.lat !== "number") return { error: "pickup geçersiz" };
    if (!dropoff?.address || typeof dropoff?.lat !== "number") return { error: "dropoff geçersiz" };
    let fareLine = "Yolculuk sonunda hesaplanır";
    try {
      const { distanceKm } = await getRouteInfo({ lat: pickup.lat, lng: pickup.lng }, { lat: dropoff.lat, lng: dropoff.lng });
      const { fare } = await estimateFareForRegion(region, vehicleType, distanceKm, { when: new Date(), petRequested: acceptsPets === true });
      if (fare) fareLine = `~${money(fare)} (tahmini)`;
    } catch { /* rota alınamazsa tahminsiz devam */ }
    return {
      kind: "taxi_call",
      params: { pickup, dropoff, vehicleType, acceptsPets: acceptsPets === true, paymentMethod: "cash" },
      serverTotals: {},
      card: {
        title: "Taksi Çağır",
        lines: [
          { label: "Nereden", value: pickup.address },
          { label: "Nereye", value: dropoff.address },
          { label: "Ücret", value: fareLine },
          { label: "Ödeme", value: "Nakit / kart (yolculukta)" },
        ],
      },
    };
  },

  async draft_taxi_cancel(args) {
    const { rideId } = args || {};
    if (!oid(rideId)) return { error: "rideId geçersiz" };
    return {
      kind: "taxi_cancel",
      params: { rideId: String(rideId) },
      serverTotals: {},
      card: { title: "Yolculuk İptali", lines: [{ label: "İşlem", value: "Aktif yolculuğun iptal edilecek" }], destructive: true },
    };
  },

  // ── Scheduled ride ───────────────────────────────────────────────────────
  async draft_scheduled_ride() {
    // Planlı taksi rezervasyona bağlıdır (ScheduledRide.reservationId zorunlu) —
    // bağımsız oluşturulamaz. Kullanıcıyı rezervasyon akışına yönlendir.
    return {
      handoff: {
        screen: "ReservationStep1",
        params: {},
        label: "Planlı taksi için önce masa rezervasyonu",
      },
    };
  },

  async draft_scheduled_ride_edit(args) {
    const { scheduledRideId, pickupAt } = args || {};
    if (!oid(scheduledRideId)) return { error: "scheduledRideId geçersiz" };
    const lines = [];
    if (pickupAt) lines.push({ label: "Yeni alınma", value: new Date(pickupAt).toLocaleString("tr-TR") });
    if (!lines.length) return { error: "Değiştirilecek alan yok" };
    return {
      kind: "scheduled_ride_edit",
      params: { id: String(scheduledRideId), pickupAt: pickupAt || null },
      serverTotals: {},
      card: { title: "Planlı Taksi Güncelle", lines },
    };
  },

  async draft_scheduled_ride_cancel(args) {
    const { scheduledRideId } = args || {};
    if (!oid(scheduledRideId)) return { error: "scheduledRideId geçersiz" };
    return {
      kind: "scheduled_ride_cancel",
      params: { id: String(scheduledRideId) },
      serverTotals: {},
      card: { title: "Planlı Taksi İptali", lines: [{ label: "İşlem", value: "Planlı taksin iptal edilecek" }], destructive: true },
    };
  },
};

/* ══════════════════════════ EXECUTE_DRAFT ══════════════════════════ */

export const EXECUTE_DRAFT = {
  async reservation_create(params, { userId }) {
    const result = await createReservationCore(
      { restaurantId: params.restaurantId, dateTime: params.dateTimeISO, partySize: params.partySize, selections: params.selections },
      { userId }
    );
    if (!result.ok) return { ok: false, message: errMsg(result.body, "Rezervasyon oluşturulamadı") };
    const dep = Number(result.reservation?.depositAmount || 0);
    if (dep > 0) {
      return {
        ok: true,
        message: `Rezervasyon oluşturuldu. Kapora ${money(dep)} — dekont için ekranı açıyorum.`,
        handoff: { screen: "ReservationDetail", params: { id: String(result.reservation._id) }, label: "Dekont yükle" },
      };
    }
    return { ok: true, message: "Rezervasyonun oluşturuldu, onaya gönderildi. ✅" };
  },

  async reservation_cancel(params, { userId }) {
    const r = await cancelReservationForUser(userId, params.rid);
    if (r?.status === "already") return { ok: true, message: "Bu rezervasyon zaten iptal edilmiş." };
    return { ok: true, message: "Rezervasyonun iptal edildi." };
  },

  async reservation_modify(params, { userId }) {
    const dateObj = params.dateTimeISO ? new Date(params.dateTimeISO) : null;
    await updateReservationForUser({
      userId,
      rid: params.rid,
      dateObj,
      timeStr: dateObj ? dateObj.toTimeString().slice(0, 5) : null,
      partySize: params.partySize || null,
    });
    return { ok: true, message: "Rezervasyonun güncellendi." };
  },

  async market_order_create(params, { userId }) {
    const req = baseReq({ userId, body: params });
    const { status, body } = await invoke(createOrder, req);
    if (status >= 400) return { ok: false, message: errMsg(body, "Sipariş oluşturulamadı") };
    return { ok: true, message: "Market siparişin alındı. ✅" };
  },

  async market_order_cancel(params, { userId }) {
    const req = baseReq({ userId, params: { id: params.orderId } });
    const { status, body } = await invoke(cancelOrder, req);
    if (status >= 400) return { ok: false, message: errMsg(body, "Sipariş iptal edilemedi") };
    return { ok: true, message: "Market siparişin iptal edildi." };
  },

  async delivery_order_create(params, { userId }) {
    const req = baseReq({ userId, body: params });
    const { status, body } = await invoke(createDeliveryOrderCOD, req);
    if (status >= 400) return { ok: false, message: errMsg(body, "Sipariş oluşturulamadı") };
    return { ok: true, message: "Paket servis siparişin alındı. ✅" };
  },

  async delivery_order_cancel(params, { userId }) {
    // Delivery iptali için müşteri ucu — panel dışı iptal yoksa handoff'a düş.
    return { ok: true, message: "Sipariş detayından iptal edebilirsin.", handoff: { screen: "Orders", params: {}, label: "Siparişlerim" } };
  },

  async taxi_call(params, { userId }) {
    const result = await createRideCore(
      { user: userId, pickup: params.pickup, dropoff: params.dropoff, vehicleType: params.vehicleType, acceptsPets: params.acceptsPets, paymentMethod: "cash" },
      {}
    );
    if (!result.ok) return { ok: false, message: errMsg(result.body, "Taksi çağrılamadı") };
    return { ok: true, message: "Taksi çağrıldı, sürücü aranıyor. 🚕", handoff: { screen: "TaxiMatched", params: { rideId: String(result.body?._id || result.body?.ride?._id || "") }, label: "Yolculuğu takip et" } };
  },

  async taxi_cancel(params, { userId }) {
    const req = baseReq({ userId, params: { id: params.rideId }, body: {} });
    const { status, body } = await invoke(cancelRide, req);
    if (status >= 400) return { ok: false, message: errMsg(body, "Yolculuk iptal edilemedi") };
    return { ok: true, message: "Yolculuğun iptal edildi." };
  },

  async scheduled_ride_edit(params, { userId }) {
    const req = baseReq({ userId, params: { id: params.id }, body: { pickupAt: params.pickupAt } });
    const { status, body } = await invoke(updateScheduledRide, req);
    if (status >= 400) return { ok: false, message: errMsg(body, "Plan güncellenemedi") };
    return { ok: true, message: "Planlı taksin güncellendi." };
  },

  async scheduled_ride_cancel(params, { userId }) {
    const req = baseReq({ userId, params: { id: params.id }, body: {} });
    const { status, body } = await invoke(cancelScheduledRideCustomer, req);
    if (status >= 400) return { ok: false, message: errMsg(body, "Plan iptal edilemedi") };
    return { ok: true, message: "Planlı taksin iptal edildi." };
  },
};

/** buildDraft dispatcher — tool adından kind'e. */
export async function buildDraftFor(name, args, ctx) {
  const fn = BUILD_DRAFT[name];
  if (!fn) return { error: `Bilinmeyen araç: ${name}` };
  try {
    return await fn(args || {}, ctx || {});
  } catch (e) {
    return { error: errMsg(e, `${name}_failed`) };
  }
}

/** executeDraft dispatcher — kind'den yürütücüye. */
export async function executeDraftFor(kind, params, ctx) {
  const fn = EXECUTE_DRAFT[kind];
  if (!fn) return { ok: false, message: `Bilinmeyen işlem: ${kind}` };
  try {
    return await fn(params || {}, ctx || {});
  } catch (e) {
    return { ok: false, message: errMsg(e, `${kind}_failed`) };
  }
}
