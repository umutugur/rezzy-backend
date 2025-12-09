// src/models/BranchRequest.js
import mongoose from "mongoose";

const BranchRequestSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    // Yeni şube için talep edilen restoran bilgileri
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Owner’ın admin’e yazdığı açıklama
    notes: {
      type: String,
    },

    // Onaylandığında oluşturulan gerçek restoran kaydı
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },

    // Talebi çözen admin bilgisi
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolvedAt: {
      type: Date,
    },

    // Reddedilme sebebi
    rejectReason: {
      type: String,
    },
  },
  { timestamps: true }
);

// Admin listeleri için pratik indexler
BranchRequestSchema.index(
  { organizationId: 1, status: 1, createdAt: -1 },
  { name: "branch_request_org_status_created" }
);

BranchRequestSchema.index(
  { requestedBy: 1, createdAt: -1 },
  { name: "branch_request_requestedBy_created" }
);

export default mongoose.model("BranchRequest", BranchRequestSchema);