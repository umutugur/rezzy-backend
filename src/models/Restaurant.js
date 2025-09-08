import mongoose from "mongoose";

const RestaurantSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  address: String,
  phone: String,
  city: String,
  priceRange: { type: String, enum: ["₺","₺₺","₺₺₺","₺₺₺₺"], default: "₺₺" },
  rating: { type: Number, default: 0 },
  iban: { type: String, required: true },
  openingHours: Object,
  photos: [String],
  description: String,
  social: [String],
  depositRate: { type: Number, default: 10 }, // %
  cancelPolicy: { type: String, default: "24h_100;3h_50;lt3h_0" },
  graceMinutes: { type: Number, default: 15 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Restaurant", RestaurantSchema);
