// src/models/MarketProduct.js
import mongoose from "mongoose";

export const MARKET_PRODUCT_UNITS = ["kg", "piece", "litre", "pack"];

const MarketProductSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    price: { type: Number, required: true, min: 0 },

    unit: {
      type: String,
      enum: MARKET_PRODUCT_UNITS,
      default: "piece",
    },

    stock: { type: Number, default: 0, min: 0 },

    photos: { type: [String], default: [] },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoreCategory",
      index: true,
    },

    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketStore",
      required: true,
      index: true,
    },

    isActive: { type: Boolean, default: true, index: true },

    barcode: { type: String, default: null, sparse: true },

    brand: { type: String, default: "", trim: true },

    attributes: {
      type: [
        {
          label: { type: String, required: true, trim: true },
          value: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },

    netQuantity: { type: Number, default: null, min: 0 },
    netUnit: {
      type: String,
      enum: ["L", "ml", "kg", "g", "piece", null],
      default: null,
    },
  },
  { timestamps: true }
);

MarketProductSchema.index({ title: "text" });
MarketProductSchema.index({ store: 1, category: 1, isActive: 1 });
MarketProductSchema.index(
  { store: 1, isActive: 1, category: 1 },
  { name: "market_product_store_active_category" }
);

export default mongoose.model("MarketProduct", MarketProductSchema);
