import mongoose from "mongoose";

const MarketBranchOverrideSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "MarketStore", required: true, index: true },
    orgProductId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketOrgProduct", required: true, index: true },
    price: { type: Number, min: 0 },
    discountPrice: { type: Number, min: 0 },
    isAvailable: { type: Boolean },
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);
MarketBranchOverrideSchema.index({ store: 1, orgProductId: 1 }, { unique: true });

export default mongoose.model("MarketBranchOverride", MarketBranchOverrideSchema);
