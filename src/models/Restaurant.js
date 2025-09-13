// models/Restaurant.js
import mongoose from "mongoose";

const RestaurantSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    city: String,
    priceRange: String,
    rating: Number,
    photos: [String],
    description: String,
    address: String,
    phone: String,
    email: String,
    openingHours: [
      {
        day: Number,
        open: String,
        close: String,
        isClosed: Boolean,
      },
    ],
    tables: [
      {
        name: String,
        capacity: Number,
        isActive: Boolean,
      },
    ],
    minPartySize: Number,
    maxPartySize: Number,
    slotMinutes: Number,
    depositRequired: Boolean,
    depositAmount: Number,
    blackoutDates: [String],

    // IBAN & banka bilgileri (panelde kullanıyoruz)
    iban: String,
    ibanName: String,
    bankName: String,
  },
  { timestamps: true }
);

export default mongoose.model("Restaurant", RestaurantSchema);
