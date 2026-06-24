import mongoose from "mongoose";

const AppDocSchema = new mongoose.Schema(
  {
    requirementKey: { type: String, required: true },
    fileUrl: { type: String, default: "" },
    number: { type: String, default: "" },
    expiry: { type: Date, default: null },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    rejectReason: { type: String, default: null },
  },
  { _id: false }
);

const DriverApplicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    countryCode: { type: String, required: true, uppercase: true, trim: true },
    vehicle: {
      plate: { type: String, default: "", uppercase: true, trim: true },
      brand: { type: String, default: "" },
      model: { type: String, default: "" },
      color: { type: String, default: "" },
      type: { type: String, enum: ["sedan", "van", "luxury", "pet"], default: "sedan" },
    },
    selfieUrl: { type: String, default: "" },
    documents: { type: [AppDocSchema], default: [] },
    status: { type: String, enum: ["draft", "pending", "approved", "rejected"], default: "draft", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("DriverApplication", DriverApplicationSchema);
