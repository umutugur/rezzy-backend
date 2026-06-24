// src/models/TaxiDriver.js
import mongoose from "mongoose";

const PointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  { _id: false }
);

const TaxiDriverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Araç bilgileri
    vehiclePlate: { type: String, required: true, uppercase: true, trim: true },
    vehicleBrand: { type: String, required: true, trim: true },
    vehicleModel: { type: String, required: true, trim: true },
    vehicleColor: { type: String, required: true, trim: true },

    // Araç tipi
    type: {
      type: String,
      enum: ["sedan", "van", "luxury", "pet"],
      default: "sedan",
    },

    // Durum
    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: false },

    // Konum (2dsphere index için GeoJSON)
    location: { type: PointSchema, default: () => ({ type: "Point", coordinates: [0, 0] }) },

    // Puanlama ve istatistikler
    rating: { type: Number, default: 5.0, min: 1.0, max: 5.0 },
    ratingCount: { type: Number, default: 0 },
    totalRides: { type: Number, default: 0 },
    todayEarnings: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },

    // Belge / onay durumu
    isApproved: { type: Boolean, default: false },
    licenseNumber: { type: String, trim: true },
    // Yolcuya görünen sürücü fotoğrafı (başvuru selfie'sinden kopyalanır)
    photoUrl: { type: String, default: "" },
    rejectionReason: { type: String, default: null },

    // Aktif yolculuk referansı
    activeRide: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiRide",
      default: null,
    },

    // Socket bağlantısı
    socketId: { type: String, default: null },

    // Son görülme zamanı (connectivity freshness)
    lastSeenAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
  }
);

// 2dsphere index — $near ve $geoWithin sorguları için
TaxiDriverSchema.index({ location: "2dsphere" });
TaxiDriverSchema.index({ isOnline: 1, isAvailable: 1 });

export default mongoose.model("TaxiDriver", TaxiDriverSchema);
