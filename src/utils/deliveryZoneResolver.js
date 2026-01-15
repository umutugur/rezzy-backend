// src/utils/deliveryZoneResolver.js
import Restaurant from "../models/Restaurant.js";

function normalizePoint(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}
function metersPerLngAtLat(lat) {
  const latRad = (lat * Math.PI) / 180;
  return 111_320 * Math.cos(latRad);
}

function axialIdFromQR(q, r) {
  return `ax:${q},${r}`;
}

function cubeRound(x, y, z) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz;
  else if (yDiff > zDiff) ry = -rx - rz;
  else rz = -rx - ry;

  return { x: rx, y: ry, z: rz };
}

function axialFromOffsetMeters(dx, dy, size) {
  // inverse of:
  // x = size*sqrt(3)*(q + r/2)
  // y = size*(3/2)*r
  const r = (2 / 3) * (dy / size);
  const q = (dx / (size * Math.sqrt(3))) - r / 2;

  const cx = q;
  const cz = r;
  const cy = -cx - cz;

  const rounded = cubeRound(cx, cy, cz);
  return { q: rounded.x, r: rounded.z };
}

function axialDistance(q, r) {
  const s = -q - r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
}

/**
 * Burada “hex zone bulma” katmanını soyut tutuyoruz.
 * Senin gerçek algoritman:
 *  - restaurant.delivery.gridSettings (pointy) ile
 *  - customerLocation -> hexId ("hex-123") üretir.
 *
 * Şimdilik bu fonksiyonun sadece "hexId" döndüren kısmını senin algoritmana bağlayacağız.
 */
export function computeHexIdPointy({ gridSettings, customerLocation, restaurantLocation }) {
  const size = Number(gridSettings?.cellSizeMeters || 0);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (!Array.isArray(restaurantLocation) || restaurantLocation.length !== 2) return null;

  const [clng, clat] = customerLocation;        // [lng, lat]
  const [rlng, rlat] = restaurantLocation || []; // [lng, lat]
  if (![clng, clat, rlng, rlat].every(Number.isFinite)) return null;

  // offset in meters (east, north)
  const dx = (clng - rlng) * metersPerLngAtLat(rlat);
  const dy = (clat - rlat) * 111_320;

  const ax = axialFromOffsetMeters(dx, dy, size);

  // ring limit (same logic as frontend)
  const radiusMeters = Number(gridSettings?.radiusMeters || 0);
  const ring = Math.max(1, Math.min(6, Math.round(radiusMeters / (size * 1.6))));

  if (axialDistance(ax.q, ax.r) > ring) return null;

  return axialIdFromQR(ax.q, ax.r);
}
/**
 * Restaurant + customerLocation -> zone sonucu
 * - global defaults + per-zone override uygular
 */
export async function resolveZoneForRestaurant({
  restaurantId,
  customerLocation, // [lng, lat]
  hexId, // opsiyonel: eğer client/başka servis hesapladıysa doğrudan verebilirsin
}) {
  if (!restaurantId) throw { status: 400, code: "RESTAURANT_ID_REQUIRED", message: "restaurantId zorunlu." };

  const coords = normalizePoint(customerLocation);
  if (!coords) throw { status: 400, code: "CUSTOMER_LOCATION_INVALID", message: "customerLocation [lng, lat] olmalı." };

  const r = await Restaurant.findById(restaurantId).select("isActive status region delivery location").lean();
  if (!r) throw { status: 404, code: "RESTAURANT_NOT_FOUND", message: "Restoran bulunamadı." };

  if (!r.isActive || String(r.status || "active") !== "active") {
    throw { status: 400, code: "RESTAURANT_INACTIVE", message: "Restoran şu an sipariş alamıyor." };
  }

  if (!r.delivery?.enabled) {
    throw { status: 400, code: "DELIVERY_DISABLED", message: "Bu restoran şu an paket servis almıyor." };
  }

  const gridSettings = r.delivery?.gridSettings || {};

const restaurantLocation = Array.isArray(r?.location?.coordinates)
  ? r.location.coordinates
  : null;

const computedHexId =
  String(hexId || "").trim() ||
  computeHexIdPointy({
    gridSettings,
    customerLocation: coords,
    restaurantLocation, // ✅ şart
  });
  if (!computedHexId) {
    // Hex bulunamıyorsa sipariş de engellenecek; ama bunun nedeni algoritma/limit olabilir.
    return {
      ok: false,
      reason: "ZONE_NOT_FOUND",
      hexId: null,
      zone: null,
      defaults: {
        minOrderAmount: Number(r.delivery?.minOrderAmount || 0),
        feeAmount: Number(r.delivery?.feeAmount || 0),
      },
    };
  }

  const zones = Array.isArray(r.delivery?.zones) ? r.delivery.zones : [];
  const zone = zones.find((z) => String(z?.id || "").trim() === computedHexId) || null;

  if (!zone) {
    return {
      ok: false,
      reason: "ZONE_NOT_FOUND",
      hexId: computedHexId,
      zone: null,
      defaults: {
        minOrderAmount: Number(r.delivery?.minOrderAmount || 0),
        feeAmount: Number(r.delivery?.feeAmount || 0),
      },
    };
  }

  const isActive = zone.isActive !== false;
  const minOrderAmount =
    Number.isFinite(Number(zone.minOrderAmount)) ? Number(zone.minOrderAmount) : Number(r.delivery?.minOrderAmount || 0);
  const feeAmount =
    Number.isFinite(Number(zone.feeAmount)) ? Number(zone.feeAmount) : Number(r.delivery?.feeAmount || 0);

  return {
    ok: true,
    reason: null,
    hexId: computedHexId,
    zone: {
      id: String(zone.id),
      name: zone.name || null,
      isActive,
      minOrderAmount: Math.max(0, Number(minOrderAmount || 0)),
      feeAmount: Math.max(0, Number(feeAmount || 0)),
    },
  };
}