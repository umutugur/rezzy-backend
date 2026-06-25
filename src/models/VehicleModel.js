import mongoose from "mongoose";
const VehicleModelSchema = new mongoose.Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    make: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
VehicleModelSchema.index({ countryCode: 1, make: 1, name: 1 }, { unique: true });
VehicleModelSchema.index({ countryCode: 1, make: 1, order: 1 });
export default mongoose.model("VehicleModel", VehicleModelSchema);
