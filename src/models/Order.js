// models/Order.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    title: { type: String, required: true }, // snapshot
    price: { type: Number, min: 0, required: true }, // snapshot
    qty:   { type: Number, min: 1, default: 1 },
    note:  { type: String, default: "" },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "OrderSession", required: true, index: true },
    restaurantId:{ type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    tableId: { type: String, required: true, index: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // guest ise null
    isGuest: { type: Boolean, default: false },
    guestName: { type: String, default: "" },

    items: { type: [OrderItemSchema], default: [] },

    currency: { type: String, default: "TRY" },
    total: { type: Number, min: 0, default: 0 },

    // ✅ Sipariş kaynağı (qr, rezvix, walk_in vs.)
    source: {
      type: String,
      enum: ["qr", "rezvix", "walk_in"],
      default: "qr",
      index: true,
    },

    paymentMethod: { type: String, enum: ["card", "venue"], required: true }, 
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "not_required"], default: "pending" },
    stripePaymentIntentId: { type: String, default: null },

    status: {
      type: String,
      enum: ["new", "accepted", "cancelled"],
      default: "new",
      index: true,
    },
     // ✅ Mutfak akışı için ayrı durum alanı
    kitchenStatus: {
      type: String,
      enum: ["new", "preparing", "ready", "delivered"],
      default: "new",
      index: true,
    },
  },
  { timestamps: true }
);

OrderSchema.index({ restaurantId: 1, createdAt: -1 });
OrderSchema.index({ sessionId: 1, createdAt: -1 });

export default mongoose.model("Order", OrderSchema);