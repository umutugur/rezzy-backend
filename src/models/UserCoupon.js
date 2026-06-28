import mongoose from "mongoose";

const UserCouponSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true },
    source: { type: String, enum: ["collected", "auto"], default: "collected" },
    collectedAt: { type: Date, default: Date.now },
    usedCount: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "used", "expired"], default: "active", index: true },
  },
  { timestamps: true }
);

UserCouponSchema.index({ user: 1, campaign: 1 }, { unique: true });

export default mongoose.model("UserCoupon", UserCouponSchema);
