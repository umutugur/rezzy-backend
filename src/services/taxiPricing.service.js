// src/services/taxiPricing.service.js

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

export { TARIFF };
