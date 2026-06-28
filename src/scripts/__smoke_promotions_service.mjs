import assert from "node:assert";
import * as svc from "../services/promotionsService.js";
assert.equal(typeof svc.regionOf, "function");
assert.equal(typeof svc.isStoreActiveForCampaign, "function");
assert.equal(typeof svc.getUsage, "function");
assert.equal(typeof svc.evaluateForOrder, "function");
assert.equal(svc.regionOf({ headers: { "x-region": "cy" } }), "CY");
assert.equal(svc.regionOf({ headers: {}, user: { region: "TR" } }), "TR");
console.log("promotions service smoke ok");
