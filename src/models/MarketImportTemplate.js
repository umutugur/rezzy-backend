import mongoose from "mongoose";

const MarketImportTemplateSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    columnMap: {
      title: { type: String, default: "" },
      category: { type: String, default: "" },
      defaultPrice: { type: String, default: "" },
      barcode: { type: String, default: "" },
      unit: { type: String, default: "" },
      defaultDiscountPrice: { type: String, default: "" },
    },
    categoryMap: { type: Object, default: {} },
    options: {
      decimalSeparator: { type: String, enum: [".", ","], default: "." },
      stripCurrency: { type: Boolean, default: true },
      unitMap: { type: Object, default: {} },
    },
    headerFingerprint: { type: String, default: "", index: true },
  },
  { timestamps: true }
);
MarketImportTemplateSchema.index({ organizationId: 1, headerFingerprint: 1 });

export default mongoose.model("MarketImportTemplate", MarketImportTemplateSchema);
