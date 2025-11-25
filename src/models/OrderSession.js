// models/OrderSession.js
import mongoose from "mongoose";

const OrderSessionSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    tableId: { type: String, required: true, index: true }, // restaurant.tables içindeki name/id ile eşleşir
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", default: null },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },

    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },

    currency: { type: String, default: "TRY" },

    // Özet toplamlar (komisyon hesabında da işine yarayacak)
    totals: {
      cardTotal: { type: Number, min: 0, default: 0 },
      payAtVenueTotal: { type: Number, min: 0, default: 0 },
      grandTotal: { type: Number, min: 0, default: 0 },
    },

    // Panelde hızlı listelemek için
    lastOrderAt: { type: Date, default: null },

  },
  { timestamps: true }
);

OrderSessionSchema.index({ restaurantId: 1, status: 1, openedAt: -1 });

export default mongoose.model("OrderSession", OrderSessionSchema);