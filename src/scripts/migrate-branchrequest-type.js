import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "../config/db.js";
import BranchRequest from "../models/BranchRequest.js";

async function main() {
  await connectDB();
  const res = await BranchRequest.updateMany(
    { type: { $exists: false } },
    { $set: { type: "restaurant" } }
  );
  console.log(`[migrate] backfilled type=restaurant on ${res.modifiedCount} rows`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
