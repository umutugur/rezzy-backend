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

    /**
     * ✅ NEW: Organization seviyesindeki kategorinin referansı
     * - orgCategoryId doluysa → bu kayıt o org kategorisinin restoran override’ı
     * - orgCategoryId null ise → tamamen lokal, restorana özel kategori
     */
    orgCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrgMenuCategory",
      default: null,
      index: true,
    },

    /**
     * 🔴 LEGACY: CoreCategory’den seed edilmiş kategoriler için,
     * v2 org menü yapısında KULLANMAYACAĞIZ ama şimdilik silmiyoruz.
     */
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

// Eski index durabilir
MenuCategorySchema.index({ restaurantId: 1, order: 1 });

// ✅ Yeni: restoran + orgCategory için hızlı lookup
MenuCategorySchema.index(
  { restaurantId: 1, orgCategoryId: 1 },
  { name: "restaurant_orgCategory" }
);

export default mongoose.model("MenuCategory", MenuCategorySchema);