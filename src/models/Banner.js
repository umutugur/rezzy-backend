import mongoose from "mongoose";

const BannerSchema = new mongoose.Schema(
  {
    placement: { type: String, required: true, default: "home_top" }, // home_top | home_mid | ...
    region: { type: String, default: null }, // TR, CY, etc. null = tüm bölgeler
    title: { type: String, default: null },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String, default: null }, // tıklanınca açılacak url/deep link (opsiyonel)

    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 }, // sıralama önceliği

    startAt: { type: Date, default: null }, // opsiyonel zaman aralığı
    endAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    targetType: { type: String, enum: ["delivery", "reservation"], required: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
},
  { timestamps: true }
);

BannerSchema.index({ placement: 1, region: 1, isActive: 1, order: 1, createdAt: -1 });

const Banner = mongoose.models.Banner || mongoose.model("Banner", BannerSchema);
export default Banner;