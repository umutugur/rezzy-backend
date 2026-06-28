// src/models/MarketOrder.js
import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketProduct",
      required: true,
    },
    // Snapshot alanlar — sipariş anındaki değerleri saklar
    title: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    unit: { type: String, default: "piece" },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const MarketOrderSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MarketStore",
      required: true,
      index: true,
    },

    items: { type: [OrderItemSchema], required: true },

    type: {
      type: String,
      enum: ["pickup", "delivery"],
      required: true,
      index: true,
    },

    deliveryAddress: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAddress",
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },

    cancelReason: {
      type: String,
      enum: ["out_of_stock", "closed", "out_of_zone", "cannot_fulfill", "customer_request", "other", null],
      default: null,
    },
    cancelledBy: {
      type: String,
      enum: ["store", "customer", null],
      default: null,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
      index: true,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "card", "online"],
      default: "cash",
    },

    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    couponCampaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
    platformContribution: { type: Number, default: 0, min: 0 },
    businessContribution: { type: Number, default: 0, min: 0 },
    commission: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    note: { type: String, default: "" },

    // Stripe
    stripePaymentIntentId: { type: String, default: null },

    estimatedReadyAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

MarketOrderSchema.index(
  { customer: 1, createdAt: -1 },
  { name: "market_order_customer_date" }
);
MarketOrderSchema.index(
  { store: 1, status: 1, createdAt: -1 },
  { name: "market_order_store_status_date" }
);

export default mongoose.model("MarketOrder", MarketOrderSchema);
