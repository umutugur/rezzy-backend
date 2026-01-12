// src/services/deliveryZoneService.js
import Restaurant from "../models/Restaurant.js";
import { lngLatToHexId } from "../utils/hexGrid.js";

function normalizeLngLat(input) {
  if (!Array.isArray(input) || input.length !== 2) return null;
  const lng = Number(input[0]);
  const lat = Number(input[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

/**
 * Business rule (important):
 * - delivery.enabled false => no service
 * - if zones[] is empty => within radius is served with global defaults
 * - if zones[] has items => only listed zones are served; missing => not configured
 */
export async function resolveDeliveryZoneForCustomer({ restaurantId, customerLocation }) {
  const rest = await Restaurant.findById(restaurantId)
    .select("isActive status location delivery")
    .lean();

  if (!rest) {
    return { ok: false, reason: "RESTAURANT_NOT_FOUND" };
  }

  if (!rest.isActive || rest.status !== "active") {
    return { ok: false, reason: "RESTAURANT_INACTIVE" };
  }

  if (!rest.delivery?.enabled) {
    return { ok: false, reason: "DELIVERY_DISABLED" };
  }

  const origin = normalizeLngLat(rest.location?.coordinates);
  if (!origin) {
    return { ok: false, reason: "RESTAURANT_LOCATION_MISSING" };
  }

  const cust = normalizeLngLat(customerLocation);
  if (!cust) {
    return { ok: false, reason: "INVALID_CUSTOMER_LOCATION" };
  }

  const gs = rest.delivery?.gridSettings || {};
  const cellSizeMeters = Number(gs.cellSizeMeters ?? 450);
  const radiusMeters = Number(gs.radiusMeters ?? 3000);

  // Orientation: ALWAYS pointy (rule)
  // gs.orientation is ignored for matching.

  const hex = lngLatToHexId({
    customerLngLat: cust,
    originLngLat: origin,
    cellSizeMeters,
    radiusMeters,
  });

  if (!hex.ok) {
    // OUT_OF_RADIUS dahil
    return {
      ok: false,
      reason: hex.reason,
      details: {
        q: hex.q,
        r: hex.r,
        ring: hex.ring,
        ringMax: hex.ringMax,
      },
    };
  }

  const zoneId = hex.zoneId;

  const zones = Array.isArray(rest.delivery?.zones) ? rest.delivery.zones : [];
  const hasOverrides = zones.length > 0;

  const override = zones.find((z) => String(z?.id || "").trim() === zoneId) || null;

  if (hasOverrides && !override) {
    return {
      ok: false,
      reason: "ZONE_NOT_CONFIGURED",
      zoneId,
      details: { q: hex.q, r: hex.r, ring: hex.ring, ringMax: hex.ringMax },
    };
  }

  const isActive = override ? !!override.isActive : true;
  if (!isActive) {
    return {
      ok: false,
      reason: "ZONE_INACTIVE",
      zoneId,
      details: { q: hex.q, r: hex.r, ring: hex.ring, ringMax: hex.ringMax },
    };
  }

  const minOrderAmount =
    override && Number.isFinite(Number(override.minOrderAmount))
      ? Number(override.minOrderAmount)
      : Number(rest.delivery?.minOrderAmount || 0);

  const feeAmount =
    override && Number.isFinite(Number(override.feeAmount))
      ? Number(override.feeAmount)
      : Number(rest.delivery?.feeAmount || 0);

  return {
    ok: true,
    zoneId,
    isActive: true,
    minOrderAmount: Math.max(0, minOrderAmount),
    feeAmount: Math.max(0, feeAmount),
    details: { q: hex.q, r: hex.r, ring: hex.ring, ringMax: hex.ringMax },
  };
}