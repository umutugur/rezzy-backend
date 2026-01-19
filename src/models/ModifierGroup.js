// src/models/ModifierGroup.js
import mongoose from "mongoose";

const ModifierOptionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    price: { type: Number, min: 0, default: 0 }, // ek ücret
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { _id: true }
);

const ModifierGroupSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    // seçim kuralları
    minSelect: { type: Number, min: 0, default: 0 },
    maxSelect: { type: Number, min: 1, default: 1 },

    isActive: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },

    options: { type: [ModifierOptionSchema], default: [] },
  },
  { timestamps: true }
);

ModifierGroupSchema.index(
  { restaurantId: 1, isActive: 1, order: 1 },
  { name: "restaurant_active_order" }
);

export default mongoose.model("ModifierGroup", ModifierGroupSchema);