import mongoose from "mongoose";
import bcrypt from "bcrypt";

const ProviderSchema = new mongoose.Schema({
  name: { type: String, enum: ["password", "google", "apple"], required: true },
  sub:  { type: String, required: true }
}, { _id: false });

const PushTokenSchema = new mongoose.Schema({
  token:     { type: String, required: true },
  isActive:  { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  email:  { type: String, unique: true, sparse: true },
  phone:  { type: String, unique: true, sparse: true },
  password: { type: String, select: false }, // sosyal girişte boş olabilir
  role:   { type: String, enum: ["customer", "restaurant", "admin"], default: "customer" },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", default: null },
  noShowCount: { type: Number, default: 0 },
  riskScore:   { type: Number, default: 0 },
  providers:   { type: [ProviderSchema], default: [] },

  banned:      { type: Boolean, default: false },
  banReason:   { type: String },
  bannedAt:    { type: Date },
  bannedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  bannedUntil: { type: Date },
  avatarUrl: { type: String, default: null },

  notificationPrefs: {
    push:   { type: Boolean, default: true },
    sms:    { type: Boolean, default: false },
    email:  { type: Boolean, default: true },
  },

  // ✅ Expo push tokenları
  pushTokens: { type: [PushTokenSchema], default: [] },

}, { timestamps: true });

UserSchema.pre("save", async function(next){
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

UserSchema.methods.compare = function(pw){
  if (!this.password) return false;
  return bcrypt.compare(pw, this.password);
};

UserSchema.index({ "providers.name": 1, "providers.sub": 1 });

export default mongoose.model("User", UserSchema);
