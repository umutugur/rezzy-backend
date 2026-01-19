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
     * ✅ Organization seviyesindeki ürünün referansı
     * - orgItemId doluysa → bu kayıt o org item’ın restoran override’ı
     * - orgItemId null ise → tamamen lokal, restorana özel ürün
     */
    orgItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrgMenuItem",
      default: null,
      index: true,
    },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    price: { type: Number, required: true, min: 0 },
    photoUrl: { type: String, default: "" },

    tags: { type: [String], default: [] },
    order: { type: Number, default: 0 },

    /**
     * ✅ NEW: Modifier group bağlantıları (reusable)
     * - Sipariş anında snapshot order’a yazılacak
     * - Menü değişse bile sipariş bozulmayacak
     */
    modifierGroupIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "ModifierGroup" }],
      default: [],
    },

    isActive: { type: Boolean, default: true, index: true },
    isAvailable: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

MenuItemSchema.index({ restaurantId: 1, categoryId: 1, order: 1 });
MenuItemSchema.index({ restaurantId: 1, isActive: 1, isAvailable: 1 });

// ✅ restoran + org item hızlı lookup
MenuItemSchema.index({ restaurantId: 1, orgItemId: 1 }, { name: "restaurant_orgItem" });

// ✅ ürün listeleme + modifier populate/lookup için
MenuItemSchema.index({ restaurantId: 1, modifierGroupIds: 1 }, { name: "restaurant_modifierGroups" });

export default mongoose.model("MenuItem", MenuItemSchema);