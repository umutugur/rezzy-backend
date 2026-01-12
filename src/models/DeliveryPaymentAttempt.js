// src/models/DeliveryPaymentAttempt.js
import mongoose from "mongoose";

const AttemptItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    title: { type: String, required: true }, // snapshot
    price: { type: Number, min: 0, required: true }, // snapshot
    qty: { type: Number, min: 1, required: true },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const DeliveryPaymentAttemptSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAddress", required: true, index: true },

    // Zone snapshot
    zoneId: { type: String, required: true, index: true },
    zoneIsActive: { type: Boolean, default: true },
    minOrderAmountSnapshot: { type: Number, min: 0, default: 0 },
    feeAmountSnapshot: { type: Number, min: 0, default: 0 },

    currency: { type: String, default: "TRY" },

    items: { type: [AttemptItemSchema], default: [] },

    subtotal: { type: Number, min: 0, default: 0 },
    deliveryFee: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },

    paymentMethod: { type: String, enum: ["card"], required: true }, // sadece online attempt
    stripePaymentIntentId: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "cancelled"],
      default: "pending",
      index: true,
    },

    // Webhook succeed olduğunda oluşan delivery order referansı
    deliveryOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "DeliveryOrder", default: null, index: true },
  },
  { timestamps: true }
);

DeliveryPaymentAttemptSchema.index({ userId: 1, createdAt: -1 });
DeliveryPaymentAttemptSchema.index({ restaurantId: 1, createdAt: -1 });

export default mongoose.model("DeliveryPaymentAttempt", DeliveryPaymentAttemptSchema);