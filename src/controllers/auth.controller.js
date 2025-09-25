// controllers/auth.controller.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
import { ensureRestaurantForOwner } from "../services/restaurantOwner.service.js";

const GOOGLE_AUDIENCES = [
  process.env.GOOGLE_CLIENT_ID_ANDROID,   // tercih edilen
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_CLIENT_ID,           // backward compat
  // olası alternatif adlar (yanlış yazılmış eski config’ler için)
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_WEB_CLIENT_ID,
].filter(Boolean);

// Tek client yerine çoklu audience destekle
const googleClient = new OAuth2Client();

function signToken(u){
  return jwt.sign(
    {
      id: u._id.toString(),
      role: u.role,
      name: u.name,
      restaurantId: u.restaurantId ? u.restaurantId.toString() : null,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES }
  );
}

function ensureProvider(user, providerName, sub) {
  const exists = user.providers?.some((p) => p.name === providerName && p.sub === sub);
  if (!exists) {
    user.providers = user.providers || [];
    user.providers.push({ name: providerName, sub });
  }
}

function toClientUser(u) {
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    restaurantId: u.restaurantId ? u.restaurantId.toString() : null,
    avatarUrl: u.avatarUrl ?? null,
    notificationPrefs: {
      push:  u.notificationPrefs?.push ?? true,
      sms:   u.notificationPrefs?.sms  ?? false,
      email: u.notificationPrefs?.email ?? true,
    },
    providers: Array.isArray(u.providers) ? u.providers.map(p => p.name) : [],
    noShowCount: u.noShowCount ?? 0,
    riskScore:   u.riskScore ?? 0,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/** POST /auth/register */
export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const user = await User.create({
      name,
      email,
      phone,
      password,
      role: role || "customer",
      providers: [{ name: "password", sub: email || phone || "local" }],
    });

    if (user.role === "restaurant") {
      await ensureRestaurantForOwner(user._id);
      await user.populate({ path: "restaurantId", select: "_id name" });
    }

    const token = signToken(user);
    res.json({ token, user: toClientUser(user) });
  } catch (e) {
    next(e);
  }
};

/** POST /auth/login */
export const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;
    const query = email ? { email } : { phone };
    const user = await User.findOne(query).select("+password");
    if (!user || !(await user.compare(password))) throw { status: 400, message: "Geçersiz bilgiler" };

    ensureProvider(user, "password", email || phone || "local");

    if (user.role === "restaurant") {
      await ensureRestaurantForOwner(user._id);
      await user.populate({ path: "restaurantId", select: "_id name" });
    }

    await user.save();
    const token = signToken(user);
    res.json({ token, user: toClientUser(user) });
  } catch (e) {
    next(e);
  }
};

/** POST /auth/google */
export const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return next({ status: 400, message: "idToken gerekli" });

    if (!GOOGLE_AUDIENCES.length) {
      return next({ status: 500, message: "Sunucuda Google client ID tanımlı değil" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_AUDIENCES,   // 👈 birden fazla client ID kabul
    });

    const payload = ticket.getPayload(); // sub, email, name, picture, aud, azp
    if (process.env.AUTH_DEBUG === "1") {
      console.log("[google] aud:", payload.aud, "azp:", payload.azp);
    }

    const sub = payload.sub;
    const email = payload.email;
    const name = payload.name || (email ? email.split("@")[0] : "GoogleUser");

    let user = await User.findOne({ providers: { $elemMatch: { name: "google", sub } } });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name, email, role: "customer",
        providers: [{ name: "google", sub }]
      });
    } else {
      const exists = user.providers?.some(p => p.name === "google" && p.sub === sub);
      if (!exists) {
        user.providers = user.providers || [];
        user.providers.push({ name: "google", sub });
      }
      if (!user.email && email) user.email = email;
      await user.save();
    }

    if (user.role === "restaurant") {
      await ensureRestaurantForOwner(user._id);
      await user.populate({ path: "restaurantId", select: "_id name" });
    }

    const token = signToken(user);
    res.json({ token, user: toClientUser(user) });
  } catch (e) {
    if (e?.message?.includes("audience") || e?.message?.includes("Wrong recipient")) {
      return next({
        status: 400,
        message: "Google client ID eşleşmiyor (audience). Sunucu .env içine Android/Web/iOS client ID'lerini ekleyin."
      });
    }
    next(e);
  }
};
/** POST /auth/apple */
export const appleLogin = async (req, res, next) => {
  try {
    const { identityToken } = req.body;
    if (!identityToken) return next({ status: 400, message: "identityToken gerekli" });

    // Not: RN native flow'da identityToken doğrulamak için audience = Service ID / Bundle ID
    const tokenData = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });

    const sub = tokenData.sub;
    const email = tokenData.email;
    const name = "AppleUser";

    let user = await User.findOne({ providers: { $elemMatch: { name: "apple", sub } } });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({ name, email, role: "customer", providers: [{ name: "apple", sub }] });
    } else {
      ensureProvider(user, "apple", sub);
      if (!user.email && email) user.email = email;
      await user.save();
    }

    if (user.role === "restaurant") {
      await ensureRestaurantForOwner(user._id);
      await user.populate({ path: "restaurantId", select: "_id name" });
    }

    const token = signToken(user);
    res.json({ token, user: toClientUser(user) });
  } catch (e) {
    next(e);
  }
};

/** GET /auth/me */
export const me = async (req, res, next) => {
  try {
    const u = await User.findById(req.user.id)
      .select("_id name email phone role restaurantId avatarUrl notificationPrefs providers noShowCount riskScore createdAt updatedAt");
    if (!u) return res.status(401).json({ message: "Unauthorized" });

    if (u.role === "restaurant" && !u.restaurantId) {
      await ensureRestaurantForOwner(u._id);
      await u.populate({ path: "restaurantId", select: "_id name" });
    }

    res.json(toClientUser(u));
  } catch (e) { next(e); }
};

/** PATCH /auth/me */
export const updateMe = async (req, res, next) => {
  try {
    const patch = {};
    const { name, email, phone, notificationPrefs, avatarUrl } = req.body;

    if (name != null)  patch.name  = String(name);
    if (email != null) patch.email = String(email);
    if (phone != null) patch.phone = String(phone);
    if (avatarUrl != null) patch.avatarUrl = String(avatarUrl);

    if (notificationPrefs && typeof notificationPrefs === "object") {
      patch.notificationPrefs = {
        push:  !!notificationPrefs.push,
        sms:   !!notificationPrefs.sms,
        email: !!notificationPrefs.email,
      };
    }

    const u = await User.findByIdAndUpdate(req.user.id, { $set: patch }, { new: true }).lean();
    if (!u) return res.status(404).json({ message: "User not found" });

    res.json(toClientUser(u));
  } catch (e) { next(e); }
};

/** POST /auth/change-password */
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "currentPassword ve newPassword zorunludur" });

    const u = await User.findById(req.user.id).select("+password +providers").exec();
    if (!u) return res.status(404).json({ message: "User not found" });

    const providerNames = (u.providers || []).map(p => p?.name);
    if (!providerNames.includes("password"))
      return res.status(400).json({ message: "Hesap şifre sağlayıcısına bağlı değil" });

    const ok = await u.compare(currentPassword);
    if (!ok) return res.status(400).json({ message: "Mevcut şifre hatalı" });

    u.password = newPassword; // pre('save') hash’ler
    await u.save();

    res.json({ ok: true });
  } catch (e) { next(e); }
};
