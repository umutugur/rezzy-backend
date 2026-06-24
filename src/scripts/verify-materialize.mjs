import assert from "node:assert";
import { hasRequiredPayload, isValidAppType } from "../config/partnerTypes.js";

assert.equal(isValidAppType("market"), true);
assert.equal(isValidAppType("x"), false);

assert.equal(hasRequiredPayload("driver", { plate: "AB", brand: "b", model: "m", color: "c", type: "sedan" }), true);
assert.equal(hasRequiredPayload("driver", { plate: "AB", brand: "b", model: "m", color: "c" }), false);

const loc = { type: "Point", coordinates: [33.3, 35.1] };
assert.equal(hasRequiredPayload("market", { businessName: "X", category: "c", address: "a", location: loc }), true);
assert.equal(hasRequiredPayload("market", { businessName: "X", category: "c", address: "a", location: { coordinates: [] } }), false);
assert.equal(hasRequiredPayload("restaurant", { businessName: "", category: "c", address: "a", location: loc }), false);

console.log("ok: partnerTypes (6 cases)");
