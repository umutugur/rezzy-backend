// src/services/bulkPrice.js

/** Fiyat metnini number'a çevirir. ₺, boşluk, binlik ayraç temizlenir; virgül/nokta ondalık. */
export function normalizePrice(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[₺$€\s]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // hangisi sonda ise o ondalık ayraç; diğeri binlik → sil
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * [{barcode, price}] → { valid:[{barcode,price}], invalid:[{barcode,reason}] }
 * barkod: string trim (baştaki sıfır/uzun sayı korunur). fiyat: > 0 zorunlu.
 */
export function parsePriceRows(rows) {
  const valid = [];
  const invalid = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const barcode = r?.barcode == null ? "" : String(r.barcode).trim();
    if (!barcode) { invalid.push({ barcode, reason: "Barkod boş" }); continue; }
    const price = normalizePrice(r?.price);
    if (price == null) { invalid.push({ barcode, reason: "Fiyat okunamadı" }); continue; }
    if (price <= 0) { invalid.push({ barcode, reason: "Fiyat 0'dan büyük olmalı" }); continue; }
    valid.push({ barcode, price });
  }
  return { valid, invalid };
}
