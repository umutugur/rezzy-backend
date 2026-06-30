// Seed default TaxiRegionConfig docs (idempotent; never overwrites existing).
// Needed because the legacy taxi flow used hardcoded fallback tariffs and never
// created region configs — so the new dynamic vehicleTypes had nothing to migrate.
//   node src/scripts/seed-taxi-region-configs.js          (dry-run)
//   node src/scripts/seed-taxi-region-configs.js --apply
import dotenv from "dotenv"; dotenv.config();
import mongoose from "mongoose";
import TaxiRegionConfig from "../models/TaxiRegionConfig.js";

const APPLY = process.argv.includes("--apply");

const TZ = { TR: "Europe/Istanbul", CY: "Asia/Nicosia", UK: "Europe/London", US: "America/New_York" };
const REGIONS = ["TR", "CY", "UK"]; // active regions; add "US" if needed

const DEFAULT_TYPES = [
  { key: "standard", name: "Standart", icon: "car-front", capacity: 4, description: "", order: 0, isActive: true, base: 30, perKm: 12, nightBase: 30, nightPerKm: 12 },
  { key: "xl",       name: "XL",       icon: "users",     capacity: 6, description: "", order: 1, isActive: true, base: 45, perKm: 18, nightBase: 45, nightPerKm: 18 },
  { key: "lux",      name: "Lüks",     icon: "crown",     capacity: 4, description: "", order: 2, isActive: true, base: 80, perKm: 25, nightBase: 80, nightPerKm: 25 },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  let created = 0, skipped = 0;
  for (const region of REGIONS) {
    const doc = {
      region,
      timezone: TZ[region] || "Europe/Istanbul",
      dispatchRadiusKm: 5,
      commissionRate: 0.1,
      vehicleTypes: DEFAULT_TYPES,
      nightTariff: { enabled: false, start: "22:00", end: "06:00" },
      petAddon: { enabled: true, surcharge: 0 },
      isActive: true,
    };
    if (!APPLY) {
      const exists = await TaxiRegionConfig.exists({ region });
      console.log(`${exists ? "SKIP (exists)" : "CREATE"} ${region} (${DEFAULT_TYPES.length} types, tz=${doc.timezone})`);
      exists ? skipped++ : created++;
      continue;
    }
    const res = await TaxiRegionConfig.updateOne({ region }, { $setOnInsert: doc }, { upsert: true });
    if (res.upsertedCount) { created++; console.log(`CREATED ${region}`); } else { skipped++; console.log(`SKIP (exists) ${region}`); }
  }
  console.log(`[seed-taxi-region-configs] ${APPLY ? "created" : "would create"} ${created}, skipped ${skipped}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
