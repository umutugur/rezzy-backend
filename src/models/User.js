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

const IncidentSchema = new mongoose.Schema({
  type: { type: String, enum: ["NO_SHOW", "LATE_CANCEL", "UNDER_ATTEND", "GOOD_ATTEND"], required: true },
  weight: { type: Number, required: true },          // 0..1 (GOOD_ATTEND negatif olabilir)
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation" },
  at: { type: Date, default: Date.now }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  email:  { type: String, unique: true, sparse: true },
  phone:  { type: String, unique: true, sparse: true },
  password: { type: String, select: false }, // sosyal girişte boş olabilir
  role:   { type: String, enum: ["customer", "restaurant", "admin"], default: "customer" },
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", default: null },

  // Risk & no-show
  noShowCount: { type: Number, default: 0 },
  riskScore:   { type: Number, default: 0 },
  riskIncidents: { type: [IncidentSchema], default: [] },
  consecutiveGoodShows: { type: Number, default: 0 },

  providers:   { type: [ProviderSchema], default: [] },

  banned:      { type: Boolean, default: false },
  banReason:   { type: String },
  bannedAt:    { type: Date },
  bannedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  bannedUntil: { type: Date },
  avatarUrl: { type: String, default: null },

  preferredRegion: {
    type: String,
    enum: ["CY", "UK"],
    default: "CY",
  },
  preferredLanguage: {
    type: String,
    enum: ["tr", "en"],
    default: "tr",
  },
  
  notificationPrefs: {
    push:   { type: Boolean, default: true },
    sms:    { type: Boolean, default: false },
    email:  { type: Boolean, default: true },
  },

  // ✅ Expo push tokenları
  pushTokens: { type: [PushTokenSchema], default: [] },

  // ✅ Favoriler (restaurant ObjectId listesi)
  favorites: { type: [mongoose.Schema.Types.ObjectId], ref: "Restaurant", default: [] },

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

// --- Yardımcı instance metodlar
UserSchema.methods._clampRisk = function() {
  if (this.riskScore < 0) this.riskScore = 0;
  if (this.riskScore > 100) this.riskScore = 100;
};

UserSchema.methods._autobanIfNeeded = function() {
  // Basit eşikler — ihtiyaca göre ayarla
  const tooManyNoShows = (this.noShowCount || 0) >= 3; // toplam
  const highRisk       = (this.riskScore   || 0) >= 75;

  if ((tooManyNoShows || highRisk) && !this.banned) {
    this.banned = true;
    this.banReason = tooManyNoShows ? "Çoklu no-show" : "Yüksek risk skoru";
    this.bannedAt = new Date();
    // İstersen bannedUntil = now + 7 gün vb. ayarlayabilirsin.
  }
};

UserSchema.index({ "providers.name": 1, "providers.sub": 1 });
// Favori aramalarını hızlandırmak için hafif bir index:
UserSchema.index({ _id: 1, favorites: 1 });

export default mongoose.model("User", UserSchema);