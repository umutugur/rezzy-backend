// rezzy-backend/src/models/Review.js
import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["restaurant", "market", "delivery", "taxi_driver"],
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },
    verifiedPurchase: { type: Boolean, default: false },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    orderModel: {
      type: String,
      enum: ["Order", "DeliveryOrder", "MarketOrder", "TaxiRide", null],
      default: null,
    },
    status: {
      type: String,
      enum: ["visible", "hidden", "removed"],
      default: "visible",
      index: true,
    },
  },
  { timestamps: true }
);

ReviewSchema.index(
  { entityType: 1, entityId: 1, userId: 1 },
  { unique: true, name: "review_entity_user_unique" }
);

ReviewSchema.index(
  { entityType: 1, entityId: 1, status: 1, createdAt: -1 },
  { name: "review_entity_status_date" }
);

export default mongoose.model("Review", ReviewSchema);
