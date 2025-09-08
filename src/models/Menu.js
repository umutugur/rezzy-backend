import mongoose from "mongoose";
const MenuSchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
  title: { type: String, required: true },
  description: String,
  pricePerPerson: { type: Number, required: true },
  photoUrl: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Menu", MenuSchema);
