// src/models/MarketStore.js
import mongoose from "mongoose";

export const MARKET_STORE_CATEGORIES = [
  "supermarket",
  "bakery",
  "greengrocer",
  "organic",
  "pharmacy",
];

const WorkingHoursSchema = new mongoose.Schema(
  {
    open: { type: String, default: "09:00" },
    close: { type: String, default: "22:00" },
    days: {
      type: [Number], // 0=Pazar … 6=Cumartesi
      default: [1, 2, 3, 4, 5, 6],
    },
  },
  { _id: false }
);

const MarketStoreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    category: {
      type: String,
      enum: MARKET_STORE_CATEGORIES,
      required: true,
      index: true,
    },

    // GeoJSON Point — yakın market sorgusu için 2dsphere
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        index: "2dsphere",
      },
    },

    address: { type: String, default: "" },
    city: { type: String, default: "", index: true },

    photos: { type: [String], default: [] },

    workingHours: { type: WorkingHoursSchema, default: () => ({}) },

    deliveryZoneKm: { type: Number, default: 5, min: 0 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    freeDeliveryThreshold: { type: Number, default: null },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    isActive: { type: Boolean, default: true, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalOrders: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

MarketStoreSchema.index({ name: "text" });
MarketStoreSchema.index(
  { isActive: 1, city: 1, rating: -1 },
  { name: "market_store_active_city_rating" }
);
MarketStoreSchema.index(
  { owner: 1, isActive: 1 },
  { name: "market_store_owner_active" }
);

export default mongoose.model("MarketStore", MarketStoreSchema);
