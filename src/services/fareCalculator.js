// src/services/fareCalculator.js
// Haversine tabanlı mesafe hesabı + tarife uygulaması

const BASE_FARE = 30; // TRY — biniş ücreti
const PRICE_PER_KM = 12; // TRY / km
const PRICE_PER_MINUTE = 1.5; // TRY / dakika

const EARTH_RADIUS_KM = 6371;

/**
 * İki koordinat arasındaki mesafeyi Haversine formülüyle hesaplar.
 * @param {{ lat: number, lng: number }} pointA
 * @param {{ lat: number, lng: number }} pointB
 * @returns {number} Kilometre cinsinden mesafe
 */
export function haversineDistanceKm(pointA, pointB) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(pointB.lat - pointA.lat);
  const dLng = toRad(pointB.lng - pointA.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(pointA.lat)) *
      Math.cos(toRad(pointB.lat)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = EARTH_RADIUS_KM * c;

  return Math.round(distanceKm * 100) / 100;
}

/**
 * Baz tarife + km ücreti + dakika ücreti formülüyle ücret hesaplar.
 * @param {number} distanceKm - Kilometre cinsinden mesafe
 * @param {number} durationMin - Dakika cinsinden süre
 * @param {{ baseFare?: number, pricePerKm?: number, pricePerMinute?: number }} [overrides]
 * @returns {number} Hesaplanan ücret (TRY)
 */
export function calculateFare(distanceKm, durationMin, overrides = {}) {
  const baseFare = overrides.baseFare ?? BASE_FARE;
  const perKm = overrides.pricePerKm ?? PRICE_PER_KM;
  const perMin = overrides.pricePerMinute ?? PRICE_PER_MINUTE;

  const km = Math.max(0, Number(distanceKm));
  const min = Math.max(0, Number(durationMin));

  const total = baseFare + km * perKm + min * perMin;
  return Math.round(total * 100) / 100;
}

/**
 * Koordinat çifti kullanarak haversine mesafesini ve tahmini ücreti döner.
 * Google Maps API mevcut değilse fallback olarak kullanılır.
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @param {number} [avgSpeedKmh=40]
 * @returns {{ distanceKm: number, durationMin: number, fare: number }}
 */
export function estimateFromCoordinates(origin, destination, avgSpeedKmh = 40) {
  const distanceKm = haversineDistanceKm(origin, destination);
  const durationMin = Math.ceil((distanceKm / avgSpeedKmh) * 60);
  const fare = calculateFare(distanceKm, durationMin);

  return { distanceKm, durationMin, fare };
}

export { BASE_FARE, PRICE_PER_KM, PRICE_PER_MINUTE };
