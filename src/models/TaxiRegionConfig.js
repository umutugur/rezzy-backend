// src/models/TaxiRegionConfig.js
import mongoose from "mongoose";

const VehicleTypeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true }, // slug, unique within region
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: "car", trim: true },
    capacity: { type: Number, default: null, min: 1 },
    description: { type: String, default: "", trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    base: { type: Number, required: true, min: 0 },
    perKm: { type: Number, required: true, min: 0 },
    nightBase: { type: Number, default: null, min: 0 },
    nightPerKm: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const TaxiRegionConfigSchema = new mongoose.Schema(
  {
    region: { type: String, required: true, unique: true, uppercase: true, trim: true },
    timezone: { type: String, default: "Europe/Istanbul", trim: true }, // IANA
    dispatchRadiusKm: { type: Number, default: 5, min: 1, max: 50 },
    commissionRate: { type: Number, default: 0.1, min: 0, max: 1 },
    vehicleTypes: { type: [VehicleTypeSchema], default: [] },
    nightTariff: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: "22:00" }, // "HH:MM" local
      end: { type: String, default: "06:00" },
    },
    petAddon: {
      enabled: { type: Boolean, default: true },
      surcharge: { type: Number, default: 0, min: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("TaxiRegionConfig", TaxiRegionConfigSchema);
