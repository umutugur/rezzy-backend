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

/** Active vehicle types for a region (sorted by order). Empty array if none. */
export async function getVehicleTypes(region) {
  const cfg = await getRegionConfig(region);
  const list = Array.isArray(cfg?.vehicleTypes) ? cfg.vehicleTypes.filter((t) => t.isActive) : [];
  return list.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Is the night tariff active for a region right now (or at `when`)? */
export async function isNightNow(region, when = new Date()) {
  const cfg = await getRegionConfig(region);
  if (!cfg?.nightTariff?.enabled) return false;
  return isWithinWindow(when, cfg.timezone, cfg.nightTariff.start, cfg.nightTariff.end);
}

/** Pet add-on config for a region. */
export async function getPetAddon(region) {
  const cfg = await getRegionConfig(region);
  return { enabled: !!cfg?.petAddon?.enabled, surcharge: Number(cfg?.petAddon?.surcharge) || 0 };
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

/**
 * Region-aware fare. Resolves day/night by the region's local time and adds the
 * pet surcharge when requested. Falls back to hardcoded TARIFF for unknown types.
 * @returns {Promise<{ fare:number, isNight:boolean }>}
 */
export async function estimateFareForRegion(region, vehicleTypeKey, distanceKm, opts = {}) {
  const { when = new Date(), petRequested = false } = opts;
  const cfg = await getRegionConfig(region);
  const key = String(vehicleTypeKey || "").toLowerCase();
  const type = cfg?.vehicleTypes?.find((t) => t.key === key && t.isActive);

  const night = !!cfg?.nightTariff?.enabled &&
    isWithinWindow(when, cfg?.timezone, cfg?.nightTariff?.start, cfg?.nightTariff?.end);

  let base, perKm;
  if (type) {
    base = night ? (type.nightBase ?? type.base) : type.base;
    perKm = night ? (type.nightPerKm ?? type.perKm) : type.perKm;
  } else {
    const fb = TARIFF[key] ?? TARIFF.ride;
    base = fb.base; perKm = fb.perKm;
  }

  let fare = fareFor(base, perKm, distanceKm);
  if (petRequested && cfg?.petAddon?.enabled) fare = Math.round((fare + (Number(cfg.petAddon.surcharge) || 0)) * 100) / 100;
  return { fare, isNight: night };
}

export { TARIFF };
