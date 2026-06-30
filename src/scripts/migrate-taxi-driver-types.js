// Map legacy driver.type -> vehicleType key + acceptsPets (idempotent).
// node src/scripts/migrate-taxi-driver-types.js           (dry-run)
// node src/scripts/migrate-taxi-driver-types.js --apply
import dotenv from "dotenv"; dotenv.config();
import mongoose from "mongoose";
import TaxiDriver from "../models/TaxiDriver.js";

const APPLY = process.argv.includes("--apply");
const MAP = { sedan: "standard", van: "xl", luxury: "lux", pet: "standard" };

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const drivers = await TaxiDriver.find({ $or: [{ vehicleType: { $in: [null, ""] } }, { vehicleType: { $exists: false } }] }).lean();
  let changed = 0;
  for (const d of drivers) {
    const legacy = d.type || "sedan";
    const vehicleType = MAP[legacy] || "standard";
    const acceptsPets = legacy === "pet" || d.acceptsPets === true;
    console.log(`${APPLY ? "MIGRATE" : "DRY"} driver ${d._id}: ${legacy} -> ${vehicleType}, pets=${acceptsPets}`);
    if (APPLY) await TaxiDriver.updateOne({ _id: d._id }, { $set: { vehicleType, acceptsPets }, $unset: { type: "" } });
    changed++;
  }
  console.log(`[migrate-driver-types] ${APPLY ? "migrated" : "would migrate"} ${changed}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
