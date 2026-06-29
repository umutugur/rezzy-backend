import assert from "node:assert";
import * as s from "../services/targetedCoupons.service.js";
assert.equal(typeof s.completedOrderCount, "function");
assert.equal(typeof s.grantCoupon, "function");
assert.equal(typeof s.grantFirstOrderCoupons, "function");
console.log("targeted coupons smoke ok");
