import mongoose from "mongoose";

// ✅ Controller ve validator aynı kaynaktan okusun diye burada export ediyoruz
export const BUSINESS_TYPES = [
  "restaurant",
  "meyhane",
  "bar",
  "cafe",
  "kebapci",
  "fast_food",
  "coffee_shop",
  "pub",
  "other",
];

const RestaurantSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    name: { type: String, required: true },

    // ✅ Bölge (ülke) – sabit enum yok
    region: {
      type: String,
      index: true,
    },

    // 🌐 Restoran arayüz dili
    preferredLanguage: {
      type: String,
      default: "tr",
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

    // ✅ İşletme tipi (core kategoriler için şart)
    businessType: {
      type: String,
      enum: BUSINESS_TYPES,
      default: "restaurant",
      index: true,
    },

    // ✅ Admin restoran oluştururken seçilen hazır kategori seti.
    // Restaurant panel ilk kez kategori çektiğinde boşsa, bu setten seed edilir.
    categorySet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuCategorySet",
      index: true,
    },

    openingHours: [
      {
        day: Number,
        open: String,
        close: String,
        isClosed: Boolean,
      },
    ],

    // ✅ Masalar (kat + drag & drop + live status için genişletildi)
    tables: [
      {
        name: { type: String, required: true },
        capacity: { type: Number, default: 2 },
        isActive: { type: Boolean, default: true },

        // Kat bilgisi
        floor: { type: Number, default: 1 },

        // Panel üzerindeki pozisyon (drag & drop)
        posX: { type: Number, default: 0 },
        posY: { type: Number, default: 0 },

        // (Opsiyonel) Cache alanları – panelde kullanmak istersen
        hasActiveSession: { type: Boolean, default: false },
        status: {
          type: String,
          enum: ["empty", "occupied", "waiter_call", "bill_request", "order_active"],
          default: "empty",
        },
        sessionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "OrderSession",
          default: null,
        },
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
    underattendanceThresholdPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 80,
    },

    // ✅ Konum bilgisi (GeoJSON)
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

    mapAddress: String,
    placeId: String,
    googleMapsUrl: String,
  },
  { timestamps: true }
);

// Arama ve konum indeksleri
RestaurantSchema.index({ name: "text" });

// Listeleme için optimize index
RestaurantSchema.index(
  { isActive: 1, region: 1, rating: -1, name: 1 },
  { name: "isActive_region_rating_name" }
);

export default mongoose.model("Restaurant", RestaurantSchema);