// Seed dynamic vehicleTypes from the legacy tariffs object (idempotent).
// node src/scripts/migrate-taxi-region-types.js           (dry-run)
// node src/scripts/migrate-taxi-region-types.js --apply
import dotenv from "dotenv"; dotenv.config();
import mongoose from "mongoose";
import TaxiRegionConfig from "../models/TaxiRegionConfig.js";

const APPLY = process.argv.includes("--apply");
const TZ = { TR: "Europe/Istanbul", CY: "Asia/Nicosia", UK: "Europe/London", US: "America/New_York" };
const DEFAULTS = [
  { key: "standard", name: "Standart", icon: "car-front", capacity: 4, order: 0, from: "ride" },
  { key: "xl",       name: "XL",       icon: "users",     capacity: 6, order: 1, from: "xl" },
  { key: "lux",      name: "Lüks",     icon: "crown",     capacity: 4, order: 2, from: "lux" },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const cfgs = await TaxiRegionConfig.find().lean();
  let changed = 0;
  for (const c of cfgs) {
    if (Array.isArray(c.vehicleTypes) && c.vehicleTypes.length) continue; // already migrated
    const legacy = c.tariffs || {};
    const types = DEFAULTS.map((d) => {
      const t = legacy[d.from] || { base: 30, perKm: 12 };
      return { key: d.key, name: d.name, icon: d.icon, capacity: d.capacity, description: "",
        order: d.order, isActive: true, base: t.base, perKm: t.perKm, nightBase: t.base, nightPerKm: t.perKm };
    });
    const petLegacy = legacy.pet || null;
    const set = {
      vehicleTypes: types,
      timezone: c.timezone || TZ[c.region] || "Europe/Istanbul",
      nightTariff: c.nightTariff?.start ? c.nightTariff : { enabled: false, start: "22:00", end: "06:00" },
      petAddon: c.petAddon?.surcharge != null ? c.petAddon : { enabled: true, surcharge: 0 },
    };
    console.log(`${APPLY ? "MIGRATE" : "DRY"} ${c.region}: ${types.length} types, tz=${set.timezone}, petLegacy=${!!petLegacy}`);
    if (APPLY) await TaxiRegionConfig.updateOne({ _id: c._id }, { $set: set });
    changed++;
  }
  console.log(`[migrate-region-types] ${APPLY ? "migrated" : "would migrate"} ${changed}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
