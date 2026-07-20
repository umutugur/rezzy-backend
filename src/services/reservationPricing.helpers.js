// src/services/reservationPricing.helpers.js
//
// Saf (side-effect'siz) fiyatlama yardımcıları. Reservation controller ve
// commission controller tarafından kullanılır. DB'ye dokunmaz.

/**
 * Kapora tutarını hesaplar.
 * Öncelik sırası: flat > yüzde(+min taban) > 0.
 * ÖNEMLİ: eski kodda var olan "hiçbiri girilmemişse totalPrice*0.2" sessiz
 * fallback'i BİLİNÇLİ OLARAK YOK — hiçbir şey yapılandırılmamışsa sonuç 0'dır.
 *
 * @param {{flat?: number, ratePercent?: number, minAmount?: number}} cfg
 * @param {number} totalPrice
 * @returns {number}
 */
export function computeDepositPure(cfg, totalPrice) {
  const price = Number(totalPrice) || 0;

  // Flat kapora, totalPrice'tan BAĞIMSIZ sabit bir tutardır (mevcut computeDeposit
  // ile birebir): totalPrice'ı aşsa bile kırpılmaz.
  const flat = Number(cfg?.flat ?? 0) || 0;
  if (flat > 0) return flat;

  const ratePercent = Math.max(0, Number(cfg?.ratePercent ?? 0) || 0);
  const minAmount = Math.max(0, Number(cfg?.minAmount ?? 0) || 0);

  if (ratePercent <= 0) return 0;

  let depositAmount = Math.round(price * (ratePercent / 100));
  if (minAmount > 0) depositAmount = Math.max(depositAmount, minAmount);

  if (!Number.isFinite(depositAmount) || depositAmount < 0) depositAmount = 0;
  if (depositAmount > price && price > 0) depositAmount = price;

  return depositAmount;
}

/**
 * Bir rezervasyonun ciro/komisyon tabanını döndürür.
 * commissionBase set edilmişse (0 DAHİL — geçerli bir değer) o kullanılır;
 * yalnızca null/undefined (eski kayıt) ise totalPrice'a düşülür.
 *
 * @param {{commissionBase?: number|null, totalPrice?: number|null}} r
 * @returns {number}
 */
export function revenueBaseOf(r) {
  const base = r?.commissionBase;
  if (base != null) return Number(base) || 0;
  return Number(r?.totalPrice ?? 0) || 0;
}
