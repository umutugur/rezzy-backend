import dotenv from "dotenv";
import mongoose from "mongoose";
import ApplicationDocRequirement from "../models/ApplicationDocRequirement.js";
import PartnerApplication from "../models/PartnerApplication.js";
import { connectDB } from "../config/db.js";
dotenv.config();

async function run() {
  await connectDB();
  const db = mongoose.connection.db;

  // 1) requirements: driverdocrequirements -> ApplicationDocRequirement (appType:"driver")
  let reqCount = 0;
  try {
    const oldReqs = await db.collection("driverdocrequirements").find({}).toArray();
    for (const r of oldReqs) {
      const { _id, __v, createdAt, updatedAt, ...rest } = r;
      await ApplicationDocRequirement.updateOne(
        { appType: "driver", countryCode: r.countryCode, key: r.key },
        { $set: { ...rest, appType: "driver" } },
        { upsert: true }
      );
      reqCount++;
    }
  } catch (e) { console.warn("requirements:", e.message); }

  // 2) applications: driverapplications -> PartnerApplication (appType:"driver", vehicle->payload)
  let appCount = 0;
  try {
    const oldApps = await db.collection("driverapplications").find({}).toArray();
    for (const a of oldApps) {
      const { _id, __v, createdAt, updatedAt, vehicle, ...rest } = a;
      await PartnerApplication.updateOne(
        { user: a.user },
        { $set: { ...rest, appType: "driver", payload: vehicle || {} } },
        { upsert: true }
      );
      appCount++;
    }
  } catch (e) { console.warn("applications:", e.message); }

  console.log(`[migrate-driver-to-partner] requirements=${reqCount} applications=${appCount}`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
