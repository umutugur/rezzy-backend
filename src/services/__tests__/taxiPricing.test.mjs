import assert from "node:assert";
import { hhmmToMinutes, isWithinWindow, fareFor } from "../taxiPricing.service.js";

// hhmmToMinutes
assert.equal(hhmmToMinutes("00:00"), 0);
assert.equal(hhmmToMinutes("22:00"), 1320);
assert.equal(hhmmToMinutes("06:30"), 390);

// fareFor
assert.equal(fareFor(30, 12, 0), 30);
assert.equal(fareFor(30, 12, 10), 150);
assert.equal(fareFor(30, 12, -5), 30); // negative km clamped

// isWithinWindow — same-day window 22:00-23:00 (Istanbul). Build a UTC date that is 22:30 in Istanbul (UTC+3) => 19:30 UTC.
const tz = "Europe/Istanbul";
const at2230 = new Date(Date.UTC(2026, 0, 15, 19, 30)); // 22:30 local
assert.equal(isWithinWindow(at2230, tz, "22:00", "23:00"), true);
const at2130 = new Date(Date.UTC(2026, 0, 15, 18, 30)); // 21:30 local
assert.equal(isWithinWindow(at2130, tz, "22:00", "23:00"), false);

// crosses midnight 22:00-06:00
const at0300 = new Date(Date.UTC(2026, 0, 15, 0, 0)); // 03:00 local
assert.equal(isWithinWindow(at0300, tz, "22:00", "06:00"), true);
const at1200 = new Date(Date.UTC(2026, 0, 15, 9, 0)); // 12:00 local
assert.equal(isWithinWindow(at1200, tz, "22:00", "06:00"), false);

// disabled-ish: equal start/end => never
assert.equal(isWithinWindow(at0300, tz, "00:00", "00:00"), false);
// missing args => false
assert.equal(isWithinWindow(at0300, tz, "", "06:00"), false);

console.log("taxiPricing pure helpers: all passed");
