import mongoose from "mongoose";

const UserAddressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: { type: String, default: "Ev" },
    fullAddress: { type: String, required: true },

    googleMapsUrl: { type: String, default: null },
    placeId: { type: String, default: null },

    // GeoJSON Point (delivery match için zorunlu)
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
        index: "2dsphere",
      },
    },

    note: { type: String, default: "" },

    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

UserAddressSchema.index({ userId: 1, isActive: 1, isDefault: -1, updatedAt: -1 }, { name: "user_active_default_sort" });

export default mongoose.model("UserAddress", UserAddressSchema);