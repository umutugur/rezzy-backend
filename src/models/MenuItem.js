// src/models/MenuItem.js
import mongoose from "mongoose";

const MenuItemSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuCategory",
      required: true,
      index: true,
    },

    /**
     * ✅ NEW: Organization seviyesindeki ürünün referansı
     * - orgItemId doluysa → bu kayıt o org item’ın restoran override’ı
     * - orgItemId null ise → tamamen lokal, restorana özel ürün
     */
    orgItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrgMenuItem",
      default: null,
      index: true,
    },

    title: { type: String, required: true, trim: true }, // örn: "Haydari"
    description: { type: String, default: "" },

    price: { type: Number, required: true, min: 0 }, // fiziki fiyat
    photoUrl: { type: String, default: "" }, // Cloudinary URL

    tags: { type: [String], default: [] }, // ["acı", "vegan"]
    order: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true, index: true },
    isAvailable: { type: Boolean, default: true, index: true }, // stok / servis var mı
  },
  { timestamps: true }
);

MenuItemSchema.index({ restaurantId: 1, categoryId: 1, order: 1 });
MenuItemSchema.index({ restaurantId: 1, isActive: 1, isAvailable: 1 });

// ✅ Yeni: restoran + org item için hızlı lookup
MenuItemSchema.index(
  { restaurantId: 1, orgItemId: 1 },
  { name: "restaurant_orgItem" }
);

export default mongoose.model("MenuItem", MenuItemSchema);