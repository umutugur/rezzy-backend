// src/models/ScheduledRide.js
//
// Planlı Taksi — rezervasyona bağlı taksi planı. Spec §1:
// docs/superpowers/specs/2026-07-14-scheduled-taxi-design.md
import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const RemindersSentSchema = new mongoose.Schema(
  {
    t30: { type: Boolean, default: false },
    t10: { type: Boolean, default: false },
    unconfirmed60: { type: Boolean, default: false },
  },
  { _id: false }
);

const ScheduledRideSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Rezervasyon başına yalnızca 1 plan.
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      unique: true,
    },
    region: { type: String, uppercase: true, trim: true, default: null },

    pickupAt: { type: Date, required: true },
    pickup: { type: LocationSchema, required: true },
    dropoff: { type: LocationSchema, required: true },

    vehicleType: { type: String, default: "ride", trim: true, lowercase: true },
    acceptsPets: { type: Boolean, default: false },

    // Planlama anında hesaplanan tahmini ücret (pickupAt saatine göre gece/gündüz).
    estimatedFare: { type: Number, default: 0 },
    // Bölgeden snapshot alınan sabit planlı yolculuk ücreti (komisyon matrahına girmez).
    scheduledFee: { type: Number, default: 0 },

    status: {
      type: String,
      enum: [
        "pending_reservation",
        "scheduled",
        "claimed",
        "dispatching",
        "converted",
        "cancelled",
        "failed",
      ],
      default: "pending_reservation",
    },

    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiDriver",
      default: null,
    },
    claimedAt: { type: Date, default: null },

    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaxiRide",
      default: null,
    },

    failReason: {
      type: String,
      enum: ["no_driver", "reservation_not_confirmed", "reservation_cancelled", null],
      default: null,
    },

    remindersSent: { type: RemindersSentSchema, default: () => ({}) },
  },
  { timestamps: true }
);

ScheduledRideSchema.index({ status: 1, pickupAt: 1 });

export default mongoose.model("ScheduledRide", ScheduledRideSchema);
