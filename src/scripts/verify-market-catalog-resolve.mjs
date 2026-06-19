import assert from "node:assert";
import { mergeOrgProduct } from "../services/marketCatalogResolve.service.js";

const org = {
  _id: "p1", title: "Süt 1L", description: "", barcode: "111", unit: "piece",
  defaultPrice: 50, defaultDiscountPrice: null, imageUrl: "x", category: "c1",
};

// 1) no override -> org defaults
let r = mergeOrgProduct(org, null);
assert.equal(r.price, 50);
assert.equal(r.discountPrice, null);
assert.equal(r.isAvailable, true);
assert.equal(r.source, "org");
assert.equal(String(r.orgProductId), "p1");
assert.equal(r.title, "Süt 1L");

// 2) price override
r = mergeOrgProduct(org, { price: 45 });
assert.equal(r.price, 45);
assert.equal(r.discountPrice, null);

// 3) discount override
r = mergeOrgProduct(org, { discountPrice: 40 });
assert.equal(r.price, 50);
assert.equal(r.discountPrice, 40);

// 4) availability override
r = mergeOrgProduct(org, { isAvailable: false });
assert.equal(r.isAvailable, false);

// 5) org default discount flows through when no override
r = mergeOrgProduct({ ...org, defaultDiscountPrice: 42 }, null);
assert.equal(r.discountPrice, 42);

// 6) override discount of 0 is respected (not treated as "unset")
r = mergeOrgProduct({ ...org, defaultDiscountPrice: 42 }, { discountPrice: 0 });
assert.equal(r.discountPrice, 0);

console.log("ok: marketCatalogResolve merge (6 cases)");
