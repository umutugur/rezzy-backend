import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "../config/db.js";
import MarketOrder from "../models/MarketOrder.js";
import TaxiRide from "../models/TaxiRide.js";

async function main() {
  await connectDB();
  const m = await MarketOrder.updateMany(
    { platformContribution: { $exists: false } },
    { $set: { platformContribution: 0, businessContribution: 0, commission: 0, couponCampaign: null } }
  );
  // grossFare = fare where missing
  const rides = await TaxiRide.find({ grossFare: { $exists: false } }).select("_id fare").lean();
  let r = 0;
  for (const ride of rides) {
    await TaxiRide.updateOne(
      { _id: ride._id },
      { $set: { grossFare: ride.fare || 0, discount: 0, platformContribution: 0, businessContribution: 0, driverEarning: 0, commission: 0, couponCampaign: null } }
    );
    r++;
  }
  console.log(`[migrate] market orders: ${m.modifiedCount}; taxi rides: ${r}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
