import assert from "node:assert";
import { effectivePrice, discountPercent, lowest30, recordPriceHistory } from "./marketPricing.js";

assert.strictEqual(effectivePrice({ price: 100, discountPrice: 70 }), 70);
assert.strictEqual(effectivePrice({ price: 100, discountPrice: null }), 100);
assert.strictEqual(effectivePrice({ price: 100, discountPrice: 100 }), 100);
assert.strictEqual(effectivePrice({ price: 100, discountPrice: 120 }), 100);

assert.strictEqual(discountPercent({ price: 69, discountPrice: 48.9 }), 29);
assert.strictEqual(discountPercent({ price: 100, discountPrice: null }), 0);

assert.strictEqual(lowest30({ price: 100, discountPrice: 70, priceHistory: [] }), 70);
const now = Date.now();
const d = (days) => new Date(now - days * 86400000);
assert.strictEqual(
  lowest30({ price: 100, discountPrice: 90, priceHistory: [{ price: 60, at: d(10) }, { price: 95, at: d(40) }] }),
  60
);

const p1 = { price: 100, discountPrice: null, priceHistory: [{ price: 100, at: d(1) }] };
recordPriceHistory(p1);
assert.strictEqual(p1.priceHistory.length, 1);
const p2 = { price: 80, discountPrice: null, priceHistory: [{ price: 100, at: d(1) }] };
recordPriceHistory(p2);
assert.strictEqual(p2.priceHistory.length, 2);
assert.strictEqual(p2.priceHistory[1].price, 80);

console.log("marketPricing OK");
