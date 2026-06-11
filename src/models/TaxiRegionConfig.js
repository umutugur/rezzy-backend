// src/models/TaxiRegionConfig.js
import mongoose from "mongoose";

const TariffSchema = new mongoose.Schema(
  {
    base: { type: Number, required: true, min: 0 },
    perKm: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const TaxiRegionConfigSchema = new mongoose.Schema(
  {
    region: { type: String, required: true, unique: true, uppercase: true, trim: true },
    dispatchRadiusKm: { type: Number, default: 5, min: 1, max: 50 },
    commissionRate: { type: Number, default: 0.1, min: 0, max: 1 },
    tariffs: {
      ride: { type: TariffSchema, default: () => ({ base: 30, perKm: 12 }) },
      xl:   { type: TariffSchema, default: () => ({ base: 45, perKm: 18 }) },
      lux:  { type: TariffSchema, default: () => ({ base: 80, perKm: 25 }) },
      pet:  { type: TariffSchema, default: () => ({ base: 40, perKm: 15 }) },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("TaxiRegionConfig", TaxiRegionConfigSchema);
