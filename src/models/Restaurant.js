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
    checkinWindowBeforeMinutes: { type: Number, min: 0, default: 15 },
    checkinWindowAfterMinutes: { type: Number, min: 0, default: 90 },

    // ✅ Eksik katılım eşiği
    underattendanceThresholdPercent: { type: Number, min: 0, max: 100, default: 80 },

    // ✅ Konum bilgisi (GeoJSON formatında)
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
    mapAddress: String, // Harita üzerinde gösterilecek adres metni
    placeId: String, // Google Place ID
    googleMapsUrl: String, // Harita bağlantısı (opsiyonel)
  },
  { timestamps: true }
);

// Arama ve konum indeksleri
RestaurantSchema.index({ name: "text" });
RestaurantSchema.index({ location: "2dsphere" });

export default mongoose.model("Restaurant", RestaurantSchema);