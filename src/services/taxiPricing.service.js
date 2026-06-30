// src/services/taxiPricing.service.js
import TaxiRegionConfig from "../models/TaxiRegionConfig.js";

export function hhmmToMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

/** Local "HH:MM" for a Date in an IANA timezone (00-23 hours). */
export function localHHMM(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

/** Is `date` (evaluated in `timeZone`) within [start, end)? Handles windows crossing midnight. */
export function isWithinWindow(date, timeZone, start, end) {
  const s = hhmmToMinutes(start), e = hhmmToMinutes(end);
  if (Number.isNaN(s) || Number.isNaN(e) || s === e) return false;
  let cur;
  try { cur = hhmmToMinutes(localHHMM(date, timeZone || "UTC")); }
  catch { cur = hhmmToMinutes(localHHMM(date, "UTC")); }
  if (Number.isNaN(cur)) return false;
  return s < e ? (cur >= s && cur < e) : (cur >= s || cur < e);
}

/** Linear fare: base + max(0,km)*perKm, rounded to 2 decimals. */
export function fareFor(base, perKm, km) {
  const k = Math.max(0, Number(km) || 0);
  return Math.round((Number(base) + k * Number(perKm)) * 100) / 100;
}

/**
 * Araç tipine göre tarife tablosu (TRY cinsinden)
 * base: Biniş ücreti
 * perKm: Km başına ücret
 */
const TARIFF = {
  ride: { base: 30, perKm: 12 },
  xl:   { base: 45, perKm: 18 },
  lux:  { base: 80, perKm: 25 },
  pet:  { base: 40, perKm: 15 },
};

// 60s in-memory cache: region -> { config, fetchedAt }
const _cache = new Map();
const CACHE_TTL_MS = 60_000;

async function getRegionConfig(region) {
  const key = String(region || "").toUpperCase();
  if (!key) return null;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.config;
  const config = await TaxiRegionConfig.findOne({ region: key, isActive: true }).lean();
  _cache.set(key, { config, fetchedAt: Date.now() });
  return config;
}

export function clearTaxiConfigCache() { _cache.clear(); }

/** Returns tariff {base, perKm} for region+vehicleType, falling back to hardcoded TARIFF. */
export async function getTariff(region, vehicleType) {
  const cfg = await getRegionConfig(region);
  const t = cfg?.tariffs?.[vehicleType];
  if (t && typeof t.base === "number" && typeof t.perKm === "number") return t;
  return TARIFF[vehicleType] ?? TARIFF.ride;
}

/** Dispatch radius in meters for region (fallback 5000). */
export async function getDispatchRadiusM(region) {
  const cfg = await getRegionConfig(region);
  const km = cfg?.dispatchRadiusKm;
  return typeof km === "number" && km > 0 ? km * 1000 : 5000;
}

/** Commission rate for region (fallback 0.10). */
export async function getCommissionRate(region) {
  const cfg = await getRegionConfig(region);
  return typeof cfg?.commissionRate === "number" ? cfg.commissionRate : 0.1;
}

/**
 * Belirli bir araç tipi ve mesafe için ücret hesaplar.
 * @param {string} type - 'ride' | 'xl' | 'lux' | 'pet'
 * @param {number} distanceKm - Kilometre cinsinden mesafe
 * @returns {number} Hesaplanan ücret (TRY)
 */
export function calculateFare(type, distanceKm) {
  const tariff = TARIFF[type];
  if (!tariff) throw new Error(`Bilinmeyen araç tipi: ${type}`);
  const km = Math.max(0, Number(distanceKm));
  const fare = tariff.base + km * tariff.perKm;
  return Math.round(fare * 100) / 100; // 2 ondalık
}

/**
 * Tüm araç tipleri için ücret tahmini döner.
 * @param {number} distanceKm
 * @returns {Object} Her araç tipi için { fare, base, perKm }
 */
export function estimateAllTypes(distanceKm) {
  const result = {};
  for (const [type, tariff] of Object.entries(TARIFF)) {
    result[type] = {
      fare: calculateFare(type, distanceKm),
      base: tariff.base,
      perKm: tariff.perKm,
    };
  }
  return result;
}

/** Region-aware fare estimate. Falls back to hardcoded tariffs when no DB config exists. */
export async function estimateFareForRegion(region, vehicleType, distanceKm) {
  const t = await getTariff(region, vehicleType);
  const km = Math.max(0, Number(distanceKm));
  return Math.round((t.base + km * t.perKm) * 100) / 100;
}

export { TARIFF };
