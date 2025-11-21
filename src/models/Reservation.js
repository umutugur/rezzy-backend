import mongoose from "mongoose";

const SelectionSchema = new mongoose.Schema(
  {
    person: { type: Number, min: 1, required: true },
    menuId: { type: mongoose.Schema.Types.ObjectId, ref: "Menu", required: true },
    price:  { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const ReservationSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User",       required: true },
    dateTimeUTC:  { type: Date, required: true },

    partySize:    { type: Number, min: 1, required: true },
    selections: { type: [SelectionSchema], default: [] },
    
    totalPrice:    { type: Number, min: 0, default: 0 },
    depositAmount: { type: Number, min: 0, default: 0 },

    // Dekont
    receiptUrl:        { type: String },
    receiptUploadedAt: { type: Date },

    status: {
      type: String,
      enum: ["pending", "confirmed", "arrived", "no_show", "cancelled"],
      default: "pending",
      index: true,
    },

    // QR & check-in
    qrSig:        { type: String },
    // models/Reservation.js (şema tanımında uygun yere ekle)
    qrTs: { type: Date }, // QR imzasında kullanılacak sabit timestamp
    checkinAt:    { type: Date },
    cancelledAt:  { type: Date },
    noShowAt:     { type: Date },

    // Diğer
    arrivedCount:   { type: Number, min: 0, default: 0 },
    lateMinutes:    { type: Number, min: 0, default: 0 },
    underattended:  { type: Boolean, default: false }, // ✅ yeni: eksik katılım işareti

    // Bildirim flag’leri (idempotency için)
    reminder24hSent:    { type: Boolean, default: false },
    reminder3hSent:     { type: Boolean, default: false },
    restPendingRemSent: { type: Boolean, default: false },

    // ✅ Stripe ödeme bilgileri (depozito)
    paymentProvider: {
      type: String,
      enum: ["stripe"],
      default: null, // havale/IBAN için null kalacak
    },
    paymentIntentId: { type: String, default: null },

    depositPaid: {
      type: Boolean,
      default: false,
    },
    depositStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paidCurrency: { type: String, default: null }, // Örn: "GBP", "TRY"
    paidAmount:   { type: Number, min: 0, default: 0 }, // Ödenen depozito tutarı (küçük birim değil, normal para birimi)
  },
  { timestamps: true }
);

ReservationSchema.index({ userId: 1, dateTimeUTC: -1 });
ReservationSchema.index({ restaurantId: 1, dateTimeUTC: -1 });
ReservationSchema.index({ dateTimeUTC: 1, status: 1 });

export default mongoose.model("Reservation", ReservationSchema);