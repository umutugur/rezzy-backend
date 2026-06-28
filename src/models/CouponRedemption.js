import mongoose from "mongoose";

const CouponRedemptionSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    surface: { type: String, enum: ["market", "restaurant", "taxi"], required: true },
    orderRef: { type: mongoose.Schema.Types.ObjectId },
    store: { type: mongoose.Schema.Types.ObjectId, default: null },
    organization: { type: mongoose.Schema.Types.ObjectId, default: null },
    gross: { type: Number, required: true },
    discount: { type: Number, required: true },
    platformContribution: { type: Number, required: true },
    businessContribution: { type: Number, required: true },
    commission: { type: Number, default: 0 },
    paymentMethod: { type: String, default: "" },
    region: { type: String, default: "" },
    status: { type: String, enum: ["applied", "reversed"], default: "applied", index: true },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

CouponRedemptionSchema.index({ campaign: 1, createdAt: -1 });
CouponRedemptionSchema.index({ store: 1, createdAt: -1 });
CouponRedemptionSchema.index({ surface: 1, region: 1, createdAt: -1 });

export default mongoose.model("CouponRedemption", CouponRedemptionSchema);
