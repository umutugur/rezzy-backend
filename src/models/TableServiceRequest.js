// models/TableServiceRequest.js
import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    tableId: { type: String },
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "OrderSession" },
    type: { type: String, enum: ["waiter", "bill","order_ready"], required: true },
    status: { type: String, enum: ["open", "handled"], default: "open" },
  },
  { timestamps: true }
);

export default mongoose.model("TableServiceRequest", schema);