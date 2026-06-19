import mongoose from "mongoose";

const MarketOrgProductSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "CoreCategory", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    barcode: { type: String, default: "", index: true },
    unit: { type: String, enum: ["kg", "piece", "litre", "pack"], default: "piece" },
    defaultPrice: { type: Number, required: true, min: 0 },
    defaultDiscountPrice: { type: Number, default: null, min: 0 },
    imageUrl: { type: String, default: "" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);
MarketOrgProductSchema.index({ organizationId: 1, category: 1, order: 1 }, { name: "org_product_org_cat_order" });
MarketOrgProductSchema.index({ organizationId: 1, isActive: 1 }, { name: "org_product_org_active" });
MarketOrgProductSchema.index({ organizationId: 1, barcode: 1 }, { name: "org_product_org_barcode" });

export default mongoose.model("MarketOrgProduct", MarketOrgProductSchema);
