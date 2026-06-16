import mongoose from "mongoose";

const MarketCollectionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    region: { type: String, default: null, uppercase: true },
    kind: { type: String, enum: ["manual", "discounted"], default: "manual" },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "MarketProduct" }],
    imageUrl: { type: String, default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MarketCollectionSchema.index({ region: 1, isActive: 1, order: 1 });

export default mongoose.models.MarketCollection || mongoose.model("MarketCollection", MarketCollectionSchema);
