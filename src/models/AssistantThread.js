import mongoose from "mongoose";

const AssistantMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    text: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AssistantThreadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    sessionId: { type: String, index: true },
    language: { type: String, default: "tr" },
    memory: { type: mongoose.Schema.Types.Mixed, default: {} },
    messages: { type: [AssistantMessageSchema], default: [] },
  },
  { timestamps: true }
);

AssistantThreadSchema.index({ userId: 1, sessionId: 1 });

export default mongoose.model("AssistantThread", AssistantThreadSchema);
