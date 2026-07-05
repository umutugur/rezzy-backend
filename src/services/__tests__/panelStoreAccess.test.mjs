import assert from "node:assert";
import { buildAccessSet, pickStore } from "../panelStoreAccess.js";

const owned = [{ _id: "s1" }, { _id: "s2" }];
const memberships = [{ store: "s2", role: "location_manager" }, { store: "s3", role: "location_manager" }];

// buildAccessSet: owner wins over membership on the same store
const set = buildAccessSet(owned, memberships);
assert.deepEqual(set.get("s1"), "owner");
assert.deepEqual(set.get("s2"), "owner");
assert.deepEqual(set.get("s3"), "manager");
assert.equal(set.size, 3);

// pickStore: explicit id must be in set
assert.deepEqual(pickStore(set, "s3"), { storeId: "s3", access: "manager" });
assert.equal(pickStore(set, "sX"), null); // forbidden

// no id + single store -> that store
const single = buildAccessSet([{ _id: "only" }], []);
assert.deepEqual(pickStore(single, undefined), { storeId: "only", access: "owner" });

// no id + multiple -> choice required (undefined sentinel)
assert.equal(pickStore(set, undefined), undefined);

// empty set
assert.equal(pickStore(new Map(), undefined), null);

console.log("panelStoreAccess: all passed");
