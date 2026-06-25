import mongoose from "mongoose";
const VehicleMakeSchema = new mongoose.Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
VehicleMakeSchema.index({ countryCode: 1, name: 1 }, { unique: true });
VehicleMakeSchema.index({ countryCode: 1, order: 1 });
export default mongoose.model("VehicleMake", VehicleMakeSchema);
