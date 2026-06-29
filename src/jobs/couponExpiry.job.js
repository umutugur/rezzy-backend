import cron from "node-cron";
import Campaign from "../models/Campaign.js";
import UserCoupon from "../models/UserCoupon.js";
import { notifyUser } from "../services/notification.service.js";

// Daily at 09:00
cron.schedule("0 9 * * *", async () => {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 48 * 3600e3);
    // mark expired
    const expiredCampaigns = await Campaign.find({ validTo: { $lt: now } }).select("_id").lean();
    if (expiredCampaigns.length) {
      await UserCoupon.updateMany(
        { campaign: { $in: expiredCampaigns.map((c) => c._id) }, status: "active" },
        { $set: { status: "expired" } }
      );
    }
    // notify soon-to-expire (within 48h)
    const soonCampaigns = await Campaign.find({ isActive: true, validTo: { $gte: now, $lte: soon } }).lean();
    for (const c of soonCampaigns) {
      const ucs = await UserCoupon.find({ campaign: c._id, status: "active" }).select("user").lean();
      for (const uc of ucs) {
        await notifyUser(uc.user, {
          title: "⏰ Kuponun bitmek üzere",
          body: `${c.title} yakında sona eriyor.`,
          data: { type: "coupon_expiring", campaignId: String(c._id) },
          key: `coupon_expiring_${uc.user}_${c._id}`,
          type: "coupon_expiring",
        }).catch(() => {});
      }
    }
  } catch (e) { console.error("[couponExpiry] error:", e.message); }
});
