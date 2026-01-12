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

/**
 * Burada “hex zone bulma” katmanını soyut tutuyoruz.
 * Senin gerçek algoritman:
 *  - restaurant.delivery.gridSettings (pointy) ile
 *  - customerLocation -> hexId ("hex-123") üretir.
 *
 * Şimdilik bu fonksiyonun sadece "hexId" döndüren kısmını senin algoritmana bağlayacağız.
 */
export function computeHexIdPointy({
  // eslint-disable-next-line no-unused-vars
  gridSettings,
  // eslint-disable-next-line no-unused-vars
  customerLocation,
}) {
  // ✅ TODO: Senin pointy hex algoritman buraya.
  // Şu an varsayım: dışarıdan "hexId" üretilebiliyor.
  // Bu placeholder’ı bırakmak yerine, kendi resolver’ını buraya taşımalısın.
  return null;
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
  const computedHexId =
    String(hexId || "").trim() ||
    computeHexIdPointy({ gridSettings, customerLocation: coords });

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