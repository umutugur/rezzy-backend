import assert from "node:assert";
import BranchRequest from "../models/BranchRequest.js";
import { MARKET_STORE_CATEGORIES } from "../models/MarketStore.js";

// type default + enum
const tp = BranchRequest.schema.path("type");
assert.equal(tp.defaultValue, "restaurant", "type default must be restaurant");
assert.deepEqual(tp.enumValues, ["restaurant", "market"]);
assert.ok(BranchRequest.schema.path("marketStoreId"), "marketStoreId path must exist");

// category gate sanity
assert.ok(MARKET_STORE_CATEGORIES.includes("supermarket"));
assert.ok(!MARKET_STORE_CATEGORIES.includes("nope"));
console.log("market branch smoke ok");
