// models/Device.js
import mongoose from "mongoose";

const DeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    expoToken: { type: String, required: true, index: true },
    platform: { type: String, enum: ["ios", "android", "web", "unknown"], default: "unknown" },
    locale: { type: String, default: null },
    appVersion: { type: String, default: null },

    allowGuestPush: { type: Boolean, default: true },
    categories: [{ type: String }], // "marketing", "news", "promo" vs.

    isActive: { type: Boolean, default: true },

    // son provider hata kodlarını da saklayalım (debug)
    lastInvalidAt: { type: Date, default: null },
    lastInvalidCode: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Device", DeviceSchema);