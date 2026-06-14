import assert from "node:assert";
import { computeUnitPrice } from "./marketUnitPrice.js";

let r = computeUnitPrice(48.9, 5, "L");
assert.deepStrictEqual(r, { unitPrice: 9.78, unitPriceUnit: "litre" });
r = computeUnitPrice(30, 750, "ml");
assert.deepStrictEqual(r, { unitPrice: 40, unitPriceUnit: "litre" });
r = computeUnitPrice(25, 500, "g");
assert.deepStrictEqual(r, { unitPrice: 50, unitPriceUnit: "kg" });
r = computeUnitPrice(100, 2, "kg");
assert.deepStrictEqual(r, { unitPrice: 50, unitPriceUnit: "kg" });
r = computeUnitPrice(60, 6, "piece");
assert.deepStrictEqual(r, { unitPrice: 10, unitPriceUnit: "adet" });
assert.strictEqual(computeUnitPrice(48.9, null, "L"), null);
assert.strictEqual(computeUnitPrice(48.9, 0, "L"), null);
assert.strictEqual(computeUnitPrice(48.9, 5, null), null);
console.log("marketUnitPrice OK");
