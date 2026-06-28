import mongoose from "mongoose";

const CampaignParticipationSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", required: true, index: true },
    surface: { type: String, enum: ["market", "restaurant"], required: true },
    store: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
    status: { type: String, enum: ["joined", "left"], default: "joined", index: true },
    joinedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CampaignParticipationSchema.index({ campaign: 1, store: 1 }, { unique: true });

export default mongoose.model("CampaignParticipation", CampaignParticipationSchema);
