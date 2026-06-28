import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    surface: { type: String, enum: ["market", "restaurant", "taxi"], required: true, index: true },
    region: { type: String, required: true, uppercase: true, trim: true, index: true },
    currency: { type: String, default: "" },

    discount: {
      kind: { type: String, enum: ["percent", "fixed", "free_delivery", "fixed_price"], required: true },
      value: { type: Number, default: 0 },
      maxDiscount: { type: Number, default: null },
    },

    conditions: {
      minSubtotal: { type: Number, default: 0 },
      scope: { type: String, enum: ["platform", "category", "store", "chain"], required: true },
      categoryKeys: { type: [String], default: [] },
      storeIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
      organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
      paymentMethods: { type: [String], default: ["all"] }, // subset of all/cash/card/online
    },

    audience: {
      kind: { type: String, enum: ["public", "targeted"], default: "public" },
      trigger: { type: String, enum: ["first_order", "win_back", null], default: null },
      winBackDays: { type: Number, default: null },
      collectible: { type: Boolean, default: true },
    },

    funding: {
      platformSharePct: { type: Number, default: 100, min: 0, max: 100 },
    },

    requiresOptIn: { type: Boolean, default: true },

    usageLimit: {
      perUser: { type: Number, default: 1 },
      total: { type: Number, default: null },
      showRemaining: { type: Boolean, default: false },
    },

    budget: {
      cap: { type: Number, default: null },
      basis: { type: String, enum: ["platform", "discount"], default: "platform" },
      spent: { type: Number, default: 0 },
    },

    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CampaignSchema.index({ surface: 1, region: 1, isActive: 1 });
CampaignSchema.index({ "audience.kind": 1 });
CampaignSchema.index({ validTo: 1 });

export default mongoose.model("Campaign", CampaignSchema);
