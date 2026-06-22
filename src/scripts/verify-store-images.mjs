import assert from "node:assert";
import { resolveStoreImages } from "../utils/storeImages.js";

// 1) branch has its own logo + cover -> keep branch
let r = resolveStoreImages({ logo: "b-logo", photos: ["b-cover"] }, { logoUrl: "o-logo", coverUrl: "o-cover" });
assert.equal(r.logo, "b-logo");
assert.deepEqual(r.photos, ["b-cover"]);

// 2) branch empty -> org defaults
r = resolveStoreImages({ logo: null, photos: [] }, { logoUrl: "o-logo", coverUrl: "o-cover" });
assert.equal(r.logo, "o-logo");
assert.deepEqual(r.photos, ["o-cover"]);

// 3) branch empty + no org -> null/empty
r = resolveStoreImages({ logo: null, photos: [] }, null);
assert.equal(r.logo, null);
assert.deepEqual(r.photos, []);

// 4) branch logo set but cover empty -> mix (branch logo + org cover)
r = resolveStoreImages({ logo: "b-logo", photos: [] }, { logoUrl: "o-logo", coverUrl: "o-cover" });
assert.equal(r.logo, "b-logo");
assert.deepEqual(r.photos, ["o-cover"]);

// 5) org has logo but no cover, branch empty -> logo from org, photos empty
r = resolveStoreImages({ logo: null, photos: [] }, { logoUrl: "o-logo", coverUrl: null });
assert.equal(r.logo, "o-logo");
assert.deepEqual(r.photos, []);

console.log("ok: resolveStoreImages (5 cases)");
