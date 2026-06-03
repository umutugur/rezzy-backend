// src/models/TaxiRide.js
import mongoose from "mongoose";

const CoordinatesSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  { _id: false }
);

const TaxiRideSchema = new mongoose.Schema(
  {
    passenger: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiDriver",
      default: null,
    },

    pickup: { type: CoordinatesSchema, required: true },
    dropoff: { type: CoordinatesSchema, required: true },

    vehicleType: {
      type: String,
      enum: ["ride", "xl", "lux", "pet"],
      default: "ride",
    },

    // Rota bilgileri
    distanceKm: { type: Number, default: 0 },
    durationMin: { type: Number, default: 0 },
    fare: { type: Number, default: 0 },

    // Durum
    status: {
      type: String,
      enum: ["searching", "matched", "inProgress", "completed", "cancelled"],
      default: "searching",
    },

    // Ödeme
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "online"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    stripePaymentIntentId: { type: String, default: null },

    // Zaman damgaları
    requestedAt: { type: Date, default: Date.now },
    matchedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // İptal
    cancelledBy: {
      type: String,
      enum: ["passenger", "driver", "system", null],
      default: null,
    },
    cancelReason: { type: String, default: null },

    // Puanlama (yolculuk sonrası)
    passengerRating: { type: Number, min: 1, max: 5, default: null },
    driverRating: { type: Number, min: 1, max: 5, default: null },

    // Bildirim durumu
    notified500m: { type: Boolean, default: false },
    notified200m: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

TaxiRideSchema.index({ passenger: 1, status: 1 });
TaxiRideSchema.index({ driver: 1, status: 1 });
TaxiRideSchema.index({ status: 1, requestedAt: -1 });

export default mongoose.model("TaxiRide", TaxiRideSchema);
