import * as c from "../controllers/promoReports.controller.js";
import assert from "node:assert";
assert.equal(typeof c.adminReport, "function");
assert.equal(typeof c.adminSettlement, "function");
assert.equal(typeof c.businessStatement, "function");
console.log("promo reports smoke ok");
