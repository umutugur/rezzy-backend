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

    // Depozito
    depositRequired: Boolean,
    depositAmount: Number,

    blackoutDates: [String],

    // IBAN & banka bilgileri
    iban: String,
    ibanName: String,
    bankName: String,

    // ✅ Komisyon oranı (0..1) (varsayılan %5)
    commissionRate: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.05,
    },

    // ✅ Check-in zaman penceresi
    // Rezervasyon saatinden kaç dakika ÖNCE ve SONRAYA kadar check-in kabul edilecek
    checkinWindowBeforeMinutes: { type: Number, min: 0, default: 15 },
    checkinWindowAfterMinutes:  { type: Number, min: 0, default: 90 },

    // ✅ Eksik katılım eşiği (%). 80 -> %80. 0..100
    // arrivedCount < partySize * (threshold/100) ise "eksik katılım" sayılır
    underattendanceThresholdPercent: { type: Number, min: 0, max: 100, default: 80 },
  },
  { timestamps: true }
);
RestaurantSchema.index({ name: "text" });

export default mongoose.model("Restaurant", RestaurantSchema);
