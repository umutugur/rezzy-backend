import mongoose from "mongoose";

const RestaurantSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },

    // ✅ Bölge (ülke) – artık sabit enum yok; herhangi bir ISO kodu kabul edebilir
    region: {
      type: String,
      index: true,
    },
    isActive: {
  type: Boolean,
  default: true,
  index: true,
},

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
        index: "2dsphere", // tek 2dsphere indeks bu satırda tanımlanıyor
      },
    },
    mapAddress: String,
    placeId: String,
    googleMapsUrl: String,
  },
  { timestamps: true }
);

// Arama ve konum indeksleri
RestaurantSchema.index({ name: "text" });

// Listeleme için optimize index:
// filter: isActive + region
// sort:   rating DESC + name ASC
RestaurantSchema.index(
  { isActive: 1, region: 1, rating: -1, name: 1 },
  { name: "isActive_region_rating_name" }
);
export default mongoose.model("Restaurant", RestaurantSchema);
