// models/BranchMenuOverride.js
import mongoose from "mongoose";

const BranchMenuOverrideSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      enum: ["category", "item"],
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // ---- Faz-1 override alanları ----
    hidden: { type: Boolean, default: false }, // şubede kapat/aç
    order: { type: Number }, // şube sıralama

    // item için:
    price: { type: Number }, // fiyat override
    isAvailable: { type: Boolean }, // stok/servis

    // (İleride istersen: title/description override eklenebilir)
  },
  { timestamps: true }
);

// aynı şube + aynı hedef => tek override
BranchMenuOverrideSchema.index(
  { restaurantId: 1, targetType: 1, targetId: 1 },
  { unique: true }
);

export default mongoose.model("BranchMenuOverride", BranchMenuOverrideSchema);