// src/services/assistantReadTools.js
//
// Yürütücü haritası for the 17 "read" tools in src/ai/assistant.tools.js.
// Every executor: async (args, {userId, region}) => plainResult; NEVER throws —
// on failure it returns { error: "<short reason>" } so the LLM gets a usable
// functionResponse instead of a crashed turn.
//
// Design: reuse EXISTING controller logic (no duplicated business rules).
// Most controllers here are plain Express handlers (req,res,next); `invoke()`
// below adapts them to a promise-returning call without touching HTTP.
// Spec: docs/superpowers/specs/2026-07-16-full-assistant-design.md §2.
// Plan: docs/superpowers/plans/2026-07-16-full-assistant.md (A2).

import { buildUserContext, summarizeContext } from "./assistantContext.js";
import { getFaqAnswer } from "./assistantFaq.helpers.js";

import Restaurant from "../models/Restaurant.js";
import { listRestaurants, getRestaurant } from "../controllers/restaurant.controller.js";
import { listMyReservations } from "../controllers/reservation.controller.js";
import {
  listNearbyStores,
  listStoreProducts,
  listMyOrders,
  getOrderDetail,
} from "../controllers/market.controller.js";
import {
  listMyDeliveryOrders,
  getMyDeliveryOrder,
} from "../controllers/deliveryOrders.controller.js";
import { getResolvedMenuForPublic } from "../controllers/menu.controller.js";
import { getRide, getActiveRide, getMyRides } from "../controllers/taxi.controller.js";
import { quoteScheduledRideCore, getMyScheduledRides } from "../controllers/scheduledRide.controller.js";
import { getWallet, getApplicable } from "../controllers/promotions.controller.js";
import { listMyAddresses } from "../controllers/addressController.js";

/**
 * Adapts a classic Express (req,res,next) handler into a promise of
 * { status, body }. The handler is called EXACTLY as-is — no logic copied.
 */
function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return res;
      },
      json(payload) {
        resolve({ status: statusCode, body: payload });
      },
    };
    const next = (err) => reject(err instanceof Error ? err : err || new Error("handler_error"));
    try {
      Promise.resolve(handler(req, res, next)).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

function baseReq({ userId, region, query = {}, params = {}, headers = {} } = {}) {
  return {
    user: { id: userId, role: "customer", region },
    query,
    params,
    headers: { "x-region": region || "", ...headers },
    body: {},
  };
}

function errMessage(e, fallback) {
  if (!e) return fallback;
  if (typeof e === "string") return e;
  return e.message || e.error || fallback;
}

function escapeRegExp(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps an executor so it NEVER throws — always {error} on failure. */
function safe(name, fn) {
  return async (args, ctx) => {
    try {
      return await fn(args || {}, ctx || {});
    } catch (e) {
      return { error: errMessage(e, `${name}_failed`) };
    }
  };
}

export const ASSISTANT_READ_TOOLS = {
  get_my_context: safe("get_my_context", async (_args, { userId }) => {
    const raw = await buildUserContext(userId);
    return summarizeContext(raw);
  }),

  search_restaurants: safe("search_restaurants", async (args, { userId, region }) => {
    const { q, filters = {} } = args;
    const req = baseReq({
      userId,
      region,
      query: {
        query: q || undefined,
        city: filters.city || undefined,
        date: filters.date || undefined,
        timeRange: filters.time || undefined,
        people: filters.partySize || undefined,
        budget: filters.budget || undefined,
        style: filters.style || undefined,
      },
    });
    const { body } = await invoke(listRestaurants, req);
    return { items: Array.isArray(body) ? body : [] };
  }),

  get_restaurant: safe("get_restaurant", async (args, { userId, region }) => {
    const { id } = args;
    if (!id) return { error: "id_required" };
    const req = baseReq({ userId, region, params: { id } });
    const { body } = await invoke(getRestaurant, req);
    return body;
  }),

  list_my_reservations: safe("list_my_reservations", async (args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const { status, limit } = args;
    const req = baseReq({ userId, region, query: { status: status || undefined } });
    const { body } = await invoke(listMyReservations, req);
    const list = Array.isArray(body) ? body : [];
    const lim = Number(limit) > 0 ? Number(limit) : list.length;
    return { items: list.slice(0, lim) };
  }),

  search_market_stores: safe("search_market_stores", async (args, { userId, region }) => {
    const { q, lat, lng } = args;
    const req = baseReq({ userId, region, query: { lat, lng } });
    const { body } = await invoke(listNearbyStores, req);
    const items = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
    const needle = String(q || "").trim().toLowerCase();
    const filtered = needle ? items.filter((s) => String(s?.name || "").toLowerCase().includes(needle)) : items;
    // Compact, unambiguous shape: the model must pass `storeId` (never the name)
    // to draft_market_order / search_products.
    return {
      items: filtered.map((s) => ({
        storeId: String(s?._id ?? s?.id ?? ""),
        name: s?.name,
        category: s?.category,
        pickupEnabled: s?.pickupEnabled !== false,
      })),
    };
  }),

  search_products: safe("search_products", async (args, { userId, region }) => {
    const { storeId, q, category } = args;
    if (!storeId) return { error: "storeId_required" };
    const req = baseReq({ userId, region, params: { id: storeId }, query: { q, category } });
    const { body } = await invoke(listStoreProducts, req);
    return body;
  }),

  get_market_order_status: safe("get_market_order_status", async (args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const { orderId } = args;
    if (orderId) {
      const req = baseReq({ userId, region, params: { id: orderId } });
      const { body } = await invoke(getOrderDetail, req);
      return { order: body };
    }
    const req = baseReq({ userId, region, query: { limit: 1 } });
    const { body } = await invoke(listMyOrders, req);
    const items = Array.isArray(body?.items) ? body.items : [];
    return { order: items[0] || null };
  }),

  search_delivery_restaurants: safe("search_delivery_restaurants", async (args) => {
    const { q } = args;
    const needle = String(q || "").trim();
    const filter = { isActive: true, status: "active", "delivery.enabled": true };
    if (needle) filter.name = new RegExp(escapeRegExp(needle), "i");
    const rows = await Restaurant.find(filter)
      .select("_id name city priceRange rating logoUrl")
      .limit(20)
      .lean();
    return { items: rows.map((r) => ({ ...r, _id: String(r._id) })) };
  }),

  get_delivery_menu: safe("get_delivery_menu", async (args, { userId, region }) => {
    const { restaurantId } = args;
    if (!restaurantId) return { error: "restaurantId_required" };
    const req = baseReq({ userId, region, params: { rid: restaurantId } });
    const { body } = await invoke(getResolvedMenuForPublic, req);
    return body;
  }),

  get_delivery_order_status: safe("get_delivery_order_status", async (args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const { orderId } = args;
    if (orderId) {
      const req = baseReq({ userId, region, params: { orderId } });
      const { body } = await invoke(getMyDeliveryOrder, req);
      return body;
    }
    const req = baseReq({ userId, region, query: { limit: 1 } });
    const { body } = await invoke(listMyDeliveryOrders, req);
    const items = Array.isArray(body?.items) ? body.items : [];
    return { order: items[0] || null };
  }),

  taxi_quote: safe("taxi_quote", async (args, { userId, region }) => {
    const { pickup, dropoff, vehicleType } = args;
    const result = await quoteScheduledRideCore(
      { pickup, dropoff, vehicleType, region },
      { userId }
    );
    if (!result.ok) return { error: result.body?.message || "quote_failed" };
    return result.body;
  }),

  get_ride_status: safe("get_ride_status", async (args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const { rideId } = args;
    if (rideId) {
      const req = baseReq({ userId, region, params: { id: rideId } });
      const { body } = await invoke(getRide, req);
      return { ride: body };
    }
    const activeReq = baseReq({ userId, region });
    try {
      const { body } = await invoke(getActiveRide, activeReq);
      return { ride: body };
    } catch {
      // Aktif yolculuk yok — en son yolculuğa düş.
      const listReq = baseReq({ userId, region, query: { limit: 1 } });
      const { body } = await invoke(getMyRides, listReq);
      const rides = Array.isArray(body?.rides) ? body.rides : [];
      return { ride: rides[0] || null };
    }
  }),

  list_scheduled_rides: safe("list_scheduled_rides", async (args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const { status } = args;
    const req = baseReq({ userId, region });
    const { body } = await invoke(getMyScheduledRides, req);
    let items = Array.isArray(body?.scheduledRides) ? body.scheduledRides : [];
    if (status) items = items.filter((r) => r.status === status);
    return { items };
  }),

  my_coupons: safe("my_coupons", async (_args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const req = baseReq({ userId, region });
    const { body } = await invoke(getWallet, req);
    return body;
  }),

  applicable_campaigns: safe("applicable_campaigns", async (args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const { surface, storeId } = args;
    if (!surface) return { error: "surface_required" };
    const req = baseReq({ userId, region, query: { surface, storeId } });
    const { body } = await invoke(getApplicable, req);
    return body;
  }),

  list_my_addresses: safe("list_my_addresses", async (_args, { userId, region }) => {
    if (!userId) return { error: "login_required" };
    const req = baseReq({ userId, region });
    const { body } = await invoke(listMyAddresses, req);
    return body;
  }),

  faq: safe("faq", async (args) => {
    const { topic } = args;
    return getFaqAnswer(topic);
  }),
};

// Note: deliveryController.js#listDeliveryRestaurants requires a location
// (addressId or lat/lng) to resolve delivery zones; the `search_delivery_restaurants`
// tool only takes `q` (see src/ai/assistant.tools.js), so it isn't reusable here.
// search_delivery_restaurants therefore does a plain name-search query instead
// (no zone/delivery-fee business logic duplicated — just a lean find()).

export default ASSISTANT_READ_TOOLS;
