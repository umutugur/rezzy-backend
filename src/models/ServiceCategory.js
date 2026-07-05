// src/models/ServiceCategory.js
import mongoose from "mongoose";

const ServiceCategorySchema = new mongoose.Schema(
  {
    surface: { type: String, enum: ["market", "delivery"], required: true, index: true },
    key: { type: String, required: true, trim: true, lowercase: true },
    name: {
      tr: { type: String, required: true, trim: true },
      en: { type: String, default: "", trim: true },
      el: { type: String, default: "", trim: true },
      ru: { type: String, default: "", trim: true },
    },
    imageUrl: { type: String, default: "", trim: true },
    fallbackEmoji: { type: String, default: "", trim: true },
    regions: { type: [String], default: ["TR", "CY", "UK"] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    // Market filter (at most one set; both empty = no filter)
    storeCategory: { type: String, default: null },
    coreCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "CoreCategory", default: null },

    // Delivery filter
    keywords: { type: [String], default: [] },
  },
  { timestamps: true }
);

ServiceCategorySchema.index({ surface: 1, key: 1 }, { unique: true });

export default mongoose.model("ServiceCategory", ServiceCategorySchema);
