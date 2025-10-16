import mongoose from "mongoose";

const NotificationLogSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true }, // idempotency
  type: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
  payload: { type: Object },
  sentAt: { type: Date, default: Date.now },
  readAt: { type: Date, default: null },
  readBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

export default mongoose.model("NotificationLog", NotificationLogSchema);