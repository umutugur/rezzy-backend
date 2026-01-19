// src/models/Order.js
import mongoose from "mongoose";

const SelectedModifierOptionSchema = new mongoose.Schema(
  {
    optionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    optionTitle: { type: String, required: true }, // snapshot
    priceDelta: { type: Number, default: 0 }, // snapshot
  },
  { _id: false }
);

const SelectedModifierGroupSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, required: true },
    groupTitle: { type: String, required: true }, // snapshot
    options: { type: [SelectedModifierOptionSchema], default: [] },
  },
  { _id: false }
);

const OrderItemSchema = new mongoose.Schema(
  {
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },

    itemTitle: { type: String, required: true }, // snapshot
    basePrice: { type: Number, min: 0, required: true }, // snapshot

    quantity: { type: Number, min: 1, default: 1 },

    // order-time snapshot
    selectedModifiers: { type: [SelectedModifierGroupSchema], default: [] },

    // tek ürün notu (opsiyonlardan bağımsız)
    note: { type: String, default: "" },

    // hesap kolaylığı için snapshot totals
    unitModifiersTotal: { type: Number, min: 0, default: 0 },
    unitTotal: { type: Number, min: 0, default: 0 },
    lineTotal: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrderSession",
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    tableId: { type: String, required: true, index: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isGuest: { type: Boolean, default: false },
    guestName: { type: String, default: "" },

    items: { type: [OrderItemSchema], default: [] },

    currency: { type: String, default: "TRY" },
    total: { type: Number, min: 0, default: 0 },

    source: {
      type: String,
      enum: ["qr", "rezvix", "walk_in"],
      default: "qr",
      index: true,
    },

    paymentMethod: { type: String, enum: ["card", "venue"], required: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "not_required"],
      default: "pending",
    },
    stripePaymentIntentId: { type: String, default: null },
    stripeCustomerId: { type: String, default: null },

    status: {
      type: String,
      enum: ["new", "accepted", "cancelled"],
      default: "new",
      index: true,
    },

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