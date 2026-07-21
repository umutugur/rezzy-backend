import mongoose from "mongoose";

const AssistantMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    text: { type: String, required: true },
    ts: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Signed write-draft awaiting user confirmation (spec §3 / A3). Distinct from
// the legacy `memory.pending` intent-flow state above — this is the LLM
// function-calling draft/execute safety envelope: draftId+hash+TTL bind the
// server-recomputed params so /execute can never run attacker-supplied values.
const AssistantPendingDraftSchema = new mongoose.Schema(
  {
    draftId: { type: String, required: true },
    hash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    kind: { type: String, required: true },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    serverTotals: { type: mongoose.Schema.Types.Mixed, default: {} },
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
    pending: { type: AssistantPendingDraftSchema, default: null },
  },
  { timestamps: true }
);

AssistantThreadSchema.index({ userId: 1, sessionId: 1 });

export default mongoose.model("AssistantThread", AssistantThreadSchema);
