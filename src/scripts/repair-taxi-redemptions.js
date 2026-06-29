// One-off repair: undo taxi coupon redemptions that were recorded at ride
// CREATION (old behaviour) but whose ride never completed — these orphaned the
// budget.spent and locked single-use coupons to "used", so users could no longer
// get the discount. Reversing them restores campaign budget and reactivates the
// coupon. Idempotent & safe to run multiple times.
//
//   node src/scripts/repair-taxi-redemptions.js          # dry-run (report only)
//   node src/scripts/repair-taxi-redemptions.js --apply   # actually reverse
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import CouponRedemption from "../models/CouponRedemption.js";
import TaxiRide from "../models/TaxiRide.js";
import { reverseRedemptionForOrder } from "../services/promotionsService.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const reds = await CouponRedemption.find({ surface: "taxi", status: "applied" }).lean();
  let reversed = 0, kept = 0;
  for (const r of reds) {
    const ride = await TaxiRide.findById(r.orderRef).select("status").lean();
    const stale = !ride || ride.status !== "completed";
    if (!stale) { kept++; continue; }
    console.log(
      `${APPLY ? "REVERSING" : "WOULD REVERSE"} redemption ${r._id} ` +
      `(ride ${r.orderRef} ${ride ? ride.status : "MISSING"}, discount ${r.discount}, platform ${r.platformContribution})`,
    );
    if (APPLY) await reverseRedemptionForOrder(r.orderRef);
    reversed++;
  }
  console.log(`[repair-taxi-redemptions] ${APPLY ? "reversed" : "would reverse"} ${reversed}, kept ${kept} (completed).`);
  if (!APPLY) console.log("Dry-run only. Re-run with --apply to persist.");
  process.exit(0);
}
main().catch((e) => { console.error("[repair-taxi-redemptions] error:", e); process.exit(1); });
