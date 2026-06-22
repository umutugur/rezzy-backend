import assert from "node:assert";
import { normalizePrice, normalizeUnit, guessColumnMap, headerFingerprint } from "./csvImport.runtime.mjs";

assert.equal(normalizePrice("1.250,50", { decimalSeparator: ",", stripCurrency: true }), 1250.5);
assert.equal(normalizePrice("₺19,90", { decimalSeparator: ",", stripCurrency: true }), 19.9);
assert.equal(normalizePrice("19.90", { decimalSeparator: ".", stripCurrency: true }), 19.9);
assert.equal(normalizePrice("1,250.50", { decimalSeparator: ".", stripCurrency: true }), 1250.5);
assert.equal(normalizePrice("abc", { decimalSeparator: ".", stripCurrency: true }), null);

assert.equal(normalizeUnit("ADET", {}), "piece");
assert.equal(normalizeUnit("KG", {}), "kg");
assert.equal(normalizeUnit("LT", {}), "litre");
assert.equal(normalizeUnit("paket", {}), "pack");
assert.equal(normalizeUnit("kasa", { kasa: "pack" }), "pack");
assert.equal(normalizeUnit("???", {}), "piece");

let g = guessColumnMap(["Ürün Adı", "Barkod", "Satış Fiyatı", "Kategori"]);
assert.equal(g.title, "Ürün Adı");
assert.equal(g.barcode, "Barkod");
assert.equal(g.category, "Kategori");

assert.equal(headerFingerprint(["B", "a", "C"]), headerFingerprint(["c", "A", "b"]));

console.log("ok: csvImport helpers");
