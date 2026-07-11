import cron from "node-cron";
import Campaign from "../models/Campaign.js";
import { grantCoupon } from "../services/targetedCoupons.service.js";

// Daily at 10:00
cron.schedule("0 10 * * *", async () => {
  try {
    const now = new Date();
    const camps = await Campaign.find({
      isActive: true, "audience.kind": "targeted", "audience.trigger": "win_back",
      validFrom: { $lte: now }, validTo: { $gte: now },
    }).lean();
    for (const c of camps) {
      const days = Number(c.audience.winBackDays) || 30;
      const cutoff = new Date(now.getTime() - days * 864e5);
      let candidates = [];
      if (c.surface === "market") {
        const MarketOrder = (await import("../models/MarketOrder.js")).default;
        candidates = await MarketOrder.aggregate([
          { $match: { status: { $ne: "cancelled" } } },
          { $group: { _id: "$customer", last: { $max: "$createdAt" } } },
          { $match: { last: { $lt: cutoff } } },
          { $limit: 5000 },
        ]);
      } else if (c.surface === "taxi") {
        const TaxiRide = (await import("../models/TaxiRide.js")).default;
        candidates = await TaxiRide.aggregate([
          { $match: { status: "completed" } },
          { $group: { _id: "$passenger", last: { $max: "$createdAt" } } },
          { $match: { last: { $lt: cutoff } } },
          { $limit: 5000 },
        ]);
      } else if (c.surface === "restaurant") {
        const DeliveryOrder = (await import("../models/DeliveryOrder.js")).default;
        candidates = await DeliveryOrder.aggregate([
          { $match: { status: { $ne: "cancelled" } } },
          { $group: { _id: "$userId", last: { $max: "$createdAt" } } },
          { $match: { last: { $lt: cutoff } } },
          { $limit: 5000 },
        ]);
      }
      let granted = 0;
      for (const u of candidates) { if (u._id && (await grantCoupon(u._id, c))) granted++; }
      if (granted) console.log(`[winback] campaign ${c._id}: granted ${granted}`);
    }
  } catch (e) { console.error("[winback] error:", e.message); }
});
