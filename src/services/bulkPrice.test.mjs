import assert from "node:assert";
import { parsePriceRows } from "./bulkPrice.js";

// Geçerli satırlar normalize edilir (barkod string, fiyat number)
{
  const { valid, invalid } = parsePriceRows([
    { barcode: "8690000000001", price: "12,50" },
    { barcode: " 8690000000002 ", price: "₺ 9.90" },
    { barcode: "8690000000003", price: "1.234,00" }, // TR binlik+ondalık
  ]);
  assert.strictEqual(invalid.length, 0);
  assert.strictEqual(valid.length, 3);
  assert.strictEqual(valid[0].barcode, "8690000000001");
  assert.strictEqual(valid[0].price, 12.5);
  assert.strictEqual(valid[1].barcode, "8690000000002");
  assert.strictEqual(valid[1].price, 9.9);
  assert.strictEqual(valid[2].price, 1234);
}

// Geçersizler ayrılır: boş barkod, sıfır/negatif/parse edilemez fiyat
{
  const { valid, invalid } = parsePriceRows([
    { barcode: "", price: "10" },
    { barcode: "X1", price: "0" },
    { barcode: "X2", price: "-5" },
    { barcode: "X3", price: "abc" },
    { barcode: "X4", price: "" },
  ]);
  assert.strictEqual(valid.length, 0);
  assert.strictEqual(invalid.length, 5);
  assert.ok(invalid.every((r) => typeof r.reason === "string"));
}

// Bilimsel gösterim/baştaki sıfır: barkod string olarak korunur
{
  const { valid } = parsePriceRows([{ barcode: "0086900001", price: "5" }]);
  assert.strictEqual(valid[0].barcode, "0086900001");
}
console.log("bulkPrice ok");
