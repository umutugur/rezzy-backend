import assert from "node:assert";
import { slugifyKey, visibleInRegion, keywordRegexes } from "../serviceCategories.helpers.js";

// slugifyKey
assert.equal(slugifyKey("Su & Damacana"), "su-damacana");
assert.equal(slugifyKey("Çiğ Köfte"), "cig-kofte");
assert.equal(slugifyKey("  Pizza!!  "), "pizza");
assert.equal(slugifyKey("Tüp"), "tup");
assert.ok(slugifyKey("") === "");

// visibleInRegion — empty regions array means visible everywhere
assert.equal(visibleInRegion({ regions: ["TR", "CY"] }, "TR"), true);
assert.equal(visibleInRegion({ regions: ["TR", "CY"] }, "UK"), false);
assert.equal(visibleInRegion({ regions: [] }, "UK"), true);
assert.equal(visibleInRegion({ regions: ["TR"] }, ""), true); // no region context -> show

// keywordRegexes — escaped, case-insensitive
const rx = keywordRegexes(["pizza", "a+b"]);
assert.equal(rx.length, 2);
assert.ok(rx[0].test("Roma PIZZA House"));
assert.ok(rx[1].test("x A+B y"));
assert.ok(!rx[1].test("aab")); // '+' must be literal
assert.deepEqual(keywordRegexes([]), []);
assert.deepEqual(keywordRegexes(["  "]), []);

console.log("serviceCategories helpers: all passed");
