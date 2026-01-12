// src/models/DeliveryOrder.js
import mongoose from "mongoose";

const DeliveryOrderItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    title: { type: String, required: true }, // snapshot
    price: { type: Number, min: 0, required: true }, // snapshot
    qty: { type: Number, min: 1, default: 1 },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const DeliveryOrderSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    addressId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAddress", required: true, index: true },

    // ✅ Zone snapshot (sipariş anındaki)
    zoneId: { type: String, required: true, index: true },
    zoneIsActive: { type: Boolean, default: true },
    minOrderAmountSnapshot: { type: Number, min: 0, default: 0 },
    feeAmountSnapshot: { type: Number, min: 0, default: 0 },

    items: { type: [DeliveryOrderItemSchema], default: [] },

    currency: { type: String, default: "TRY" },

    subtotal: { type: Number, min: 0, default: 0 },
    deliveryFee: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },

    // Komisyonlar delivery için ayrı olacak demiştin:
    commissionRate: { type: Number, min: 0, max: 1, default: 0 },
    commissionAmount: { type: Number, min: 0, default: 0 },

    paymentMethod: { type: String, enum: ["card", "cash", "card_on_delivery"], required: true },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "cancelled"], default: "pending" },
    stripePaymentIntentId: { type: String, default: null },

    status: {
      type: String,
      enum: ["new", "accepted", "cancelled", "delivered"],
      default: "new",
      index: true,
    },
  },
  { timestamps: true }
);

DeliveryOrderSchema.index({ restaurantId: 1, createdAt: -1 });
DeliveryOrderSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("DeliveryOrder", DeliveryOrderSchema);