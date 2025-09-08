import mongoose from "mongoose";

const SelectionSchema = new mongoose.Schema(
  {
    person: { type: Number, min: 1, required: true },                 // kişi sayısı
    menuId: { type: mongoose.Schema.Types.ObjectId, ref: "Menu", required: true },
    price:  { type: Number, min: 0, required: true },                 // kişi başı fiyat (anlık kopya)
  },
  { _id: false }
);

const ReservationSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "User",       required: true },
    dateTimeUTC:  { type: Date, required: true },

    partySize:    { type: Number, min: 1, required: true },
    selections:   { type: [SelectionSchema], default: [], validate: v => Array.isArray(v) && v.length > 0 },

    totalPrice:    { type: Number, min: 0, default: 0 },
    depositAmount: { type: Number, min: 0, default: 0 },

    receiptUrl: { type: String },

    status: {
      type: String,
      enum: ["pending", "confirmed", "arrived", "no_show", "cancelled"],
      default: "pending",
      index: true,
    },

    qrSig:      { type: String },
    checkinAt:  { type: Date },
    cancelledAt:{ type: Date },
    noShowAt:   { type: Date },
  },
  { timestamps: true }
);

// Faydalı indexler
ReservationSchema.index({ userId: 1, dateTimeUTC: -1 });
ReservationSchema.index({ restaurantId: 1, dateTimeUTC: -1 });

export default mongoose.model("Reservation", ReservationSchema);
