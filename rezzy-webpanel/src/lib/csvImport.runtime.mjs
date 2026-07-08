export const OUR_FIELDS = ["title","category","defaultPrice","barcode","unit","defaultDiscountPrice"];

const SYNONYMS = {
  title: ["title","ad","adı","ürün","ürün adı","urun","name","product","isim"],
  category: ["category","kategori","grup","group","reyon"],
  defaultPrice: ["price","fiyat","satış fiyatı","satis fiyati","tutar","birim fiyat","defaultprice"],
  barcode: ["barcode","barkod","stok kodu","sku","kod"],
  unit: ["unit","birim","ölçü","olcu"],
  defaultDiscountPrice: ["discount","indirim","indirimli fiyat","kampanya","defaultdiscountprice"],
};

export function guessColumnMap(headers) {
  const out = {};
  const lower = headers.map((h) => ({ raw: h, low: String(h).trim().toLowerCase() }));
  for (const field of OUR_FIELDS) {
    const syns = SYNONYMS[field] || [];
    const hit = lower.find((h) => syns.some((s) => h.low === s)) || lower.find((h) => syns.some((s) => h.low.includes(s)));
    if (hit) out[field] = hit.raw;
  }
  return out;
}

export function normalizePrice(raw, { decimalSeparator = ".", stripCurrency = true } = {}) {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (stripCurrency) s = s.replace(/[^\d.,\-]/g, "");
  if (!s) return null;
  const thou = decimalSeparator === "," ? "." : ",";
  s = s.split(thou).join("");
  if (decimalSeparator === ",") s = s.replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UNIT_ALIASES = { adet: "piece", ad: "piece", piece: "piece", kg: "kg", kilo: "kg", kilogram: "kg",
  lt: "litre", l: "litre", litre: "litre", liter: "litre", paket: "pack", pk: "pack", pack: "pack" };

export function normalizeUnit(raw, unitMap = {}) {
  const v = String(raw ?? "").trim();
  if (v && unitMap[v]) return unitMap[v];
  const low = v.toLowerCase();
  if (unitMap[low]) return unitMap[low];
  return UNIT_ALIASES[low] || "piece";
}

export function headerFingerprint(headers) {
  return headers.map((h) => String(h).trim().toLowerCase()).sort().join(",");
}

export function detectDecimalSeparator(samples) {
  let comma = 0, dot = 0;
  for (const s of (samples || []).slice(0, 50)) {
    const str = String(s);
    const lc = str.lastIndexOf(","), ld = str.lastIndexOf(".");
    if (lc > ld) comma++; else if (ld > lc) dot++;
  }
  return comma > dot ? "," : ".";
}

export function guessCategoryMatch(value, categories) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  const exact = categories.find((c) => String(c.title || "").toLowerCase() === v || String(c.key || "").toLowerCase() === v);
  if (exact) return exact._id;
  const partial = categories.find((c) => {
    const t = String(c.title || "").toLowerCase();
    return t && (t.includes(v) || v.includes(t));
  });
  return partial ? partial._id : null;
}

import * as XLSX from "xlsx";

/**
 * XLSX/CSV ArrayBuffer → { headers:string[], rows:Record<string,string>[] }
 * Tüm hücreler string (raw:false) → barkodda baştaki sıfır / bilimsel gösterim korunur.
 */
export function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix[0].map((h, i) => (String(h).trim() || `Sütun ${String.fromCharCode(65 + i)}`));
  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const arr = matrix[i];
    if (!arr || arr.every((c) => String(c).trim() === "")) continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = arr[j] == null ? "" : String(arr[j]); });
    rows.push(obj);
  }
  return { headers, rows };
}

export function applyMapping(rows, columnMap, categoryMap, options) {
  const out = []; const errors = [];
  rows.forEach((row, i) => {
    const title = String(row[columnMap.title] ?? "").trim();
    const rawCat = String(row[columnMap.category] ?? "").trim();
    const price = normalizePrice(row[columnMap.defaultPrice], options);
    const catId = categoryMap[rawCat];
    if (!title) { errors.push({ row: i + 1, message: "Başlık boş" }); return; }
    if (price == null) { errors.push({ row: i + 1, message: "Fiyat okunamadı: " + row[columnMap.defaultPrice] }); return; }
    if (!catId) { errors.push({ row: i + 1, message: "Kategori eşlenmemiş: " + (rawCat || "(boş)") }); return; }
    const disc = columnMap.defaultDiscountPrice ? normalizePrice(row[columnMap.defaultDiscountPrice], options) : null;
    out.push({
      title, category: catId, defaultPrice: price,
      barcode: columnMap.barcode ? String(row[columnMap.barcode] ?? "").trim() : "",
      unit: columnMap.unit ? normalizeUnit(row[columnMap.unit], options.unitMap || {}) : "piece",
      defaultDiscountPrice: disc != null ? disc : undefined,
    });
  });
  return { rows: out, errors };
}
