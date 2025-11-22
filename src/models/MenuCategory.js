// src/models/MenuCategory.js
import mongoose from "mongoose";

const MenuCategorySchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    // ✅ Core’dan kopyalandıysa referans
    coreCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoreCategory",
      default: null,
      index: true,
    },

    title: { type: String, required: true, trim: true }, // örn: "Mezeler"
    description: { type: String, default: "" },

    order: { type: Number, default: 0 }, // sıralama için
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

MenuCategorySchema.index({ restaurantId: 1, order: 1 });

export default mongoose.model("MenuCategory", MenuCategorySchema);