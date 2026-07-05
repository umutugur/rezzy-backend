// Şube yöneticilerine yanlışlıkla verilmiş org üyeliklerini bul/temizle (idempotent).
//   node src/scripts/audit-org-memberships.js           (dry-run)
//   node src/scripts/audit-org-memberships.js --apply
import dotenv from "dotenv"; dotenv.config();
import mongoose from "mongoose";
import User from "../models/User.js";

const APPLY = process.argv.includes("--apply");
const LEGIT = new Set(["org_owner", "org_admin", "org_finance"]);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const users = await User.find({
    $and: [
      { organizations: { $exists: true, $ne: [] } },
      { $or: [
        { restaurantMemberships: { $exists: true, $ne: [] } },
        { marketMemberships: { $exists: true, $ne: [] } },
      ] },
    ],
  }).select("name email role organizations restaurantMemberships marketMemberships").lean();

  let flagged = 0, cleaned = 0;
  for (const u of users) {
    const bad = (u.organizations || []).filter((o) => !LEGIT.has(String(o.role)));
    const legit = (u.organizations || []).filter((o) => LEGIT.has(String(o.role)));
    console.log(`USER ${u.email || u._id} role=${u.role} | orgRoles=[${(u.organizations||[]).map(o=>o.role).join(",")}] | restMemb=${(u.restaurantMemberships||[]).length} mktMemb=${(u.marketMemberships||[]).length}`);
    if (bad.length === 0) continue;
    flagged++;
    console.log(`  ${APPLY ? "CLEANING" : "WOULD CLEAN"} ${bad.length} non-legit org membership(s): [${bad.map(o=>o.role).join(",")}]`);
    if (APPLY) {
      await User.updateOne({ _id: u._id }, { $set: { organizations: legit } });
      cleaned++;
    }
  }
  console.log(`[audit-org-memberships] users listed=${users.length}, flagged=${flagged}, ${APPLY ? "cleaned=" + cleaned : "dry-run (no writes)"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
