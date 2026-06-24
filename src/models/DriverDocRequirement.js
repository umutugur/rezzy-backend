import mongoose from "mongoose";

const I18N = { tr: String, en: String, ru: String, el: String };

const DriverDocRequirementSchema = new mongoose.Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, trim: true, index: true },
    key: { type: String, required: true, trim: true },
    i18n: { type: { ...I18N }, default: {} },
    file: { type: Boolean, default: true },
    number: { type: Boolean, default: false },
    numberLabel: { type: { ...I18N }, default: {} },
    expiry: { type: Boolean, default: false },
    required: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
DriverDocRequirementSchema.index({ countryCode: 1, key: 1 }, { unique: true });
DriverDocRequirementSchema.index({ countryCode: 1, order: 1 });

export default mongoose.model("DriverDocRequirement", DriverDocRequirementSchema);
