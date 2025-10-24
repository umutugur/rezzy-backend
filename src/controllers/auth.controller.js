import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
import { ensureRestaurantForOwner } from "../services/restaurantOwner.service.js";

const GOOGLE_AUDIENCES = [
  process.env.GOOGLE_CLIENT_ID_ANDROID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,   // eski ad
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_IOS_CLIENT_ID,       // eski ad
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_WEB_CLIENT_ID,       // eski ad
  process.env.GOOGLE_CLIENT_ID            // tek ID kullandığın eski kurulumlar için
].filter(Boolean);

// Tek client yerine çoklu audience destekle
const googleClient = new OAuth2Client();

/** JWT imzalama — serbest payload */
function signTokenRaw(payload){
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES
  });
}

/** User dokümanından JWT üret */
function signToken(u){
  return signTokenRaw({
    id: u._id.toString(),
    role: u.role,
    name: u.name,
    restaurantId: u.restaurantId ? u.restaurantId.toString() : null,
  });
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
    id: u._id?.toString?.() ?? null,
    name: u.name,
    email: u.email ?? null,
    phone: u.phone ?? null,
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
    createdAt: u.createdAt ?? null,
    updatedAt: u.updatedAt ?? null,
  };
}

/** --------- GUEST (Misafir) --------- */
/** POST /auth/guest  => kayıt gerektirmeyen geçici token */
export const guestLogin = async (req, res, next) => {
  try {
    // DB kaydı oluşturmuyoruz; salt token
    const guestId = `guest:${Math.random().toString(36).slice(2, 10)}`;
    const token = signTokenRaw({
      id: guestId,
      role: "guest",
      name: "Misafir",
      restaurantId: null,
    });
    // Me tarafında guest için sentetik kullanıcı döndüreceğiz
    return res.json({
      token,
      user: {
        id: guestId,
        name: "Misafir",
        email: null,
        phone: null,
        role: "guest",
        restaurantId: null,
        avatarUrl: null,
        notificationPrefs: { push: true, sms: false, email: true },
        providers: ["guest"],
        noShowCount: 0,
        riskScore: 0,
        createdAt: null,
        updatedAt: null,
      }
    });
  } catch (e) { next(e); }
};

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
      audience: GOOGLE_AUDIENCES, // 👈 birden fazla client ID kabul
    });

    const payload = ticket.getPayload();
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

    const expectedAudience =
      process.env.IOS_BUNDLE_ID || process.env.APPLE_CLIENT_ID;

    if (!expectedAudience) {
      return next({
        status: 500,
        message: "Apple audience tanımlı değil. Render env’e IOS_BUNDLE_ID=com.rezzy.app ekleyin.",
      });
    }

    const tokenData = await appleSignin.verifyIdToken(identityToken, {
      audience: expectedAudience,
      ignoreExpiration: false,
    });

    const sub = tokenData?.sub;
    const email = tokenData?.email || null;
    if (!sub) return next({ status: 401, message: "Apple kimlik doğrulaması başarısız (sub yok)." });

    let user = await User.findOne({ providers: { $elemMatch: { name: "apple", sub } } });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: email ? email.split("@")[0] : "AppleUser",
        email: email || undefined,
        role: "customer",
        providers: [{ name: "apple", sub }],
      });
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
    if (e?.message?.toLowerCase?.().includes("audience")) {
      return next({
        status: 400,
        message:
          "Apple audience eşleşmedi. IOS_BUNDLE_ID env’inin bundleIdentifier ile birebir aynı olduğundan emin olun.",
      });
    }
    next(e);
  }
};

/** GET /auth/me */
export const me = async (req, res, next) => {
  try {
    // Misafir için sentetik profil döndür
    if (req.user?.role === "guest") {
      return res.json({
        id: req.user.id,           // guest:xxxx
        name: "Misafir",
        email: null,
        phone: null,
        role: "guest",
        restaurantId: null,
        avatarUrl: null,
        notificationPrefs: { push: true, sms: false, email: true },
        providers: ["guest"],
        noShowCount: 0,
        riskScore: 0,
        createdAt: null,
        updatedAt: null,
      });
    }

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
    if (req.user?.role === "guest") {
      return res.status(403).json({ message: "Misafir profili güncellenemez. Lütfen giriş yapın veya kayıt olun." });
    }

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
    if (req.user?.role === "guest") {
      return res.status(403).json({ message: "Misafir hesaplarında şifre değiştirilemez" });
    }

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