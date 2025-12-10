// src/controllers/auth.controller.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
// ❌ ensureRestaurantForOwner kaldırıldı – tüm restoran sahipliği artık admin + membership akışlarıyla yönetiliyor

const GOOGLE_AUDIENCES = [
  process.env.GOOGLE_CLIENT_ID_ANDROID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID,
].filter(Boolean);

const googleClient = new OAuth2Client();

/* ========== TOKENS ========== */
// .env ÖNERİ: ACCESS_EXPIRES=2h, REFRESH_EXPIRES=30d
const ACCESS_EXPIRES = process.env.JWT_EXPIRES || "2h";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "30d";
const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + ".refresh";

/** Sadece access için (multi-org + memberships dahil) */
function signAccessToken(uOrPayload) {
  // Eğer elimizde gerçek User dokümanı varsa
  if (typeof uOrPayload === "object" && uOrPayload._id) {
    // 🔹 Legacy destek: token içinde restaurantId’yi hala taşıyoruz (okuma amaçlı)
    let restaurantId = null;
    if (uOrPayload.restaurantId) {
      if (uOrPayload.restaurantId._id) {
        restaurantId = uOrPayload.restaurantId._id.toString();
      } else {
        restaurantId = uOrPayload.restaurantId.toString?.() || null;
      }
    }

    // 🔹 organizations → { organization: <id>, role }
    const organizations = Array.isArray(uOrPayload.organizations)
      ? uOrPayload.organizations
          .map((entry) => {
            if (!entry) return null;
            const role = entry.role || null;
            if (!role) return null;

            const org = entry.organization;
            if (!org) return null;

            const orgId = org._id
              ? org._id.toString()
              : org.toString?.() || null;

            if (!orgId) return null;
            return { organization: orgId, role };
          })
          .filter(Boolean)
      : [];

    // 🔹 restaurantMemberships → { restaurant: <id>, role }
    const restaurantMemberships = Array.isArray(
      uOrPayload.restaurantMemberships
    )
      ? uOrPayload.restaurantMemberships
          .map((entry) => {
            if (!entry) return null;
            const role = entry.role || null;
            if (!role) return null;

            const rest = entry.restaurant;
            if (!rest) return null;

            const restId = rest._id
              ? rest._id.toString()
              : rest.toString?.() || null;

            if (!restId) return null;
            return { restaurant: restId, role };
          })
          .filter(Boolean)
      : [];

    const p = {
      id: uOrPayload._id.toString(),
      role: uOrPayload.role,
      name: uOrPayload.name,
      restaurantId,
      organizations,
      restaurantMemberships,
    };

    return jwt.sign(p, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
  }

  // Guest veya özel payload gibi durumlarda ham payload’ı aynen imzala
  return jwt.sign(uOrPayload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

/** Refresh için (payload minimal tut) */
function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id.toString(), v: 1 }, // v: ileride versiyonlamak istersen
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES }
  );
}

/** Client’a dönecek user şekli */
function toClientUser(u) {
  const preferredRegion = u.preferredRegion || "CY";
  const preferredLanguage =
    u.preferredLanguage || (preferredRegion === "UK" ? "en" : "tr");

  // restaurantId hem ObjectId hem populate edilmiş obje olabilir
  let restaurantId = null;
  let restaurantName = null;
  if (u.restaurantId) {
    if (u.restaurantId._id) {
      restaurantId = u.restaurantId._id.toString();
      restaurantName = u.restaurantId.name || null;
    } else {
      restaurantId = u.restaurantId.toString?.() || null;
    }
  }

  // 🔹 organizations[] → { id, name, role }
  let organizations = [];
  if (Array.isArray(u.organizations)) {
    organizations = u.organizations.map((entry) => {
      const role = entry?.role ?? null;
      let orgId = null;
      let orgName = null;

      const org = entry?.organization;
      if (org) {
        if (org._id) {
          orgId = org._id.toString();
          orgName = org.name || null;
        } else {
          orgId = org.toString?.() || null;
        }
      }

      return {
        id: orgId,
        name: orgName,
        role,
      };
    });
  }

  // 🔹 restaurantMemberships[] → { id, name, organizationId, status, role }
  let restaurantMemberships = [];
  if (Array.isArray(u.restaurantMemberships)) {
    restaurantMemberships = u.restaurantMemberships.map((entry) => {
      const role = entry?.role ?? null;

      let restId = null;
      let restName = null;
      let organizationId = null;
      let status = null;

      const rest = entry?.restaurant;
      if (rest) {
        if (rest._id) {
          restId = rest._id.toString();
          restName = rest.name || null;

          // organizationId populate edilmiş veya sadece ObjectId olabilir
          if (rest.organizationId) {
            if (rest.organizationId._id) {
              organizationId = rest.organizationId._id.toString();
            } else {
              organizationId = rest.organizationId.toString?.() || null;
            }
          }

          status = rest.status || null;
        } else {
          // populate edilmemişse sadece id
          restId = rest.toString?.() || null;
        }
      }

      return {
        id: restId,
        name: restName,
        organizationId,
        status,
        role,
      };
    });
  }

  return {
    id: u._id?.toString?.() ?? null,
    name: u.name,
    email: u.email ?? null,
    phone: u.phone ?? null,
    role: u.role,
    // 🔹 Legacy alanlar — DOKUNMUYORUZ
    restaurantId,
    restaurantName,
    avatarUrl: u.avatarUrl ?? null,
    notificationPrefs: {
      push: u.notificationPrefs?.push ?? true,
      sms: u.notificationPrefs?.sms ?? false,
      email: u.notificationPrefs?.email ?? true,
    },
    providers: Array.isArray(u.providers)
      ? u.providers.map((p) => p.name)
      : [],
    noShowCount: u.noShowCount ?? 0,
    riskScore: u.riskScore ?? 0,
    preferredRegion,
    preferredLanguage,
    createdAt: u.createdAt ?? null,
    updatedAt: u.updatedAt ?? null,

    // 🔹 Yeni multi-organization alanları
    organizations,
    restaurantMemberships,
  };
}

function ensureProvider(user, providerName, sub) {
  const exists = user.providers?.some(
    (p) => p.name === providerName && p.sub === sub
  );
  if (!exists) {
    user.providers = user.providers || [];
    user.providers.push({ name: providerName, sub });
  }
}

/* ========== GUEST ========== */
export const guestLogin = async (req, res, next) => {
  try {
    const guestId = `guest:${Math.random().toString(36).slice(2, 10)}`;
    // guest için access (kısa ömür) + refresh döndürmüyoruz (misafir kalıcı olmasın)
    const accessToken = jwt.sign(
      { id: guestId, role: "guest", name: "Misafir", restaurantId: null },
      ACCESS_SECRET,
      { expiresIn: ACCESS_EXPIRES }
    );
    return res.json({
      token: accessToken,
      refreshToken: null,
      user: {
        id: guestId,
        name: "Misafir",
        email: null,
        phone: null,
        role: "guest",
        restaurantId: null,
        restaurantName: null,
        avatarUrl: null,
        notificationPrefs: { push: true, sms: false, email: true },
        providers: ["guest"],
        noShowCount: 0,
        riskScore: 0,
        createdAt: null,
        updatedAt: null,
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ========== REGISTER ========== */
export const register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    // 🔒 Güvenlik + mimari: public register her zaman "customer"
    const safeRole = "customer";

    const user = await User.create({
      name,
      email,
      phone,
      password,
      role: safeRole,
      providers: [{ name: "password", sub: email || phone || "local" }],
    });

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({ token, refreshToken, user: toClientUser(user) });
  } catch (e) {
    next(e);
  }
};

/* ========== LOGIN (Password) ========== */
export const login = async (req, res, next) => {
  try {
    const { email, phone, password } = req.body;
    const query = email ? { email } : { phone };
    const user = await User.findOne(query).select("+password");
    if (!user || !(await user.compare(password))) {
      throw { status: 400, message: "Geçersiz bilgiler" };
    }

    ensureProvider(user, "password", email || phone || "local");

    await user.save();
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.json({ token, refreshToken, user: toClientUser(user) });
  } catch (e) {
    next(e);
  }
};

/* ========== LOGIN (Google) ========== */
export const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken)
      return next({ status: 400, message: "idToken gerekli" });
    if (!GOOGLE_AUDIENCES.length)
      return next({
        status: 500,
        message: "Sunucuda Google client ID tanımlı değil",
      });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_AUDIENCES,
    });
    const payload = ticket.getPayload();

    const sub = payload.sub;
    const email = payload.email;
    const name =
      payload.name ||
      (email ? email.split("@")[0] : "GoogleUser");

    let user = await User.findOne({
      providers: { $elemMatch: { name: "google", sub } },
    });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        role: "customer",
        providers: [{ name: "google", sub }],
      });
    } else {
      ensureProvider(user, "google", sub);
      if (!user.email && email) user.email = email;
      await user.save();
    }

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.json({ token, refreshToken, user: toClientUser(user) });
  } catch (e) {
    if (
      e?.message?.includes("audience") ||
      e?.message?.includes("Wrong recipient")
    ) {
      return next({
        status: 400,
        message:
          "Google client ID eşleşmiyor (audience). Sunucu .env içine Android/Web/iOS client ID'lerini ekleyin.",
      });
    }
    next(e);
  }
};

/* ========== LOGIN (Apple) ========== */
export const appleLogin = async (req, res, next) => {
  try {
    const { identityToken } = req.body;
    if (!identityToken)
      return next({ status: 400, message: "identityToken gerekli" });

    const expectedAudience =
      process.env.IOS_BUNDLE_ID || process.env.APPLE_CLIENT_ID;
    if (!expectedAudience) {
      return next({
        status: 500,
        message:
          "Apple audience tanımlı değil. Render env’e IOS_BUNDLE_ID=com.rezzy.app ekleyin.",
      });
    }

    const tokenData = await appleSignin.verifyIdToken(identityToken, {
      audience: expectedAudience,
      ignoreExpiration: false,
    });

    const sub = tokenData?.sub;
    const email = tokenData?.email || null;
    if (!sub)
      return next({
        status: 401,
        message: "Apple kimlik doğrulaması başarısız (sub yok).",
      });

    let user = await User.findOne({
      providers: { $elemMatch: { name: "apple", sub } },
    });
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

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.json({ token, refreshToken, user: toClientUser(user) });
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

/* ========== ME / UPDATE / PASSWORD ========== */
export const me = async (req, res, next) => {
  try {
    if (req.user?.role === "guest") {
      return res.json({
        id: req.user.id,
        name: "Misafir",
        email: null,
        phone: null,
        role: "guest",
        restaurantId: null,
        restaurantName: null,
        avatarUrl: null,
        notificationPrefs: { push: true, sms: false, email: true },
        providers: ["guest"],
        noShowCount: 0,
        riskScore: 0,
        createdAt: null,
        updatedAt: null,
      });
    }

    const baseSelect =
      "_id name email phone role restaurantId avatarUrl notificationPrefs providers noShowCount riskScore preferredRegion preferredLanguage createdAt updatedAt organizations restaurantMemberships";

    // Kullanıcıyı membership’leriyle birlikte çek
    const u = await User.findById(req.user.id)
      .select(baseSelect)
      .populate([
        { path: "restaurantId", select: "_id name" },
        { path: "organizations.organization", select: "_id name" },
        {
          path: "restaurantMemberships.restaurant",
          select: "_id name organizationId status",
        },
      ]);

    if (!u) return res.status(401).json({ message: "Unauthorized" });

    return res.json(toClientUser(u));
  } catch (e) {
    next(e);
  }
};

export const updateMe = async (req, res, next) => {
  try {
    if (req.user?.role === "guest") {
      return res.status(403).json({
        message:
          "Misafir profili güncellenemez. Lütfen giriş yapın veya kayıt olun.",
      });
    }

    const patch = {};
    const {
      name,
      email,
      phone,
      notificationPrefs,
      avatarUrl,
      preferredRegion,
      preferredLanguage,
    } = req.body;

    if (name != null) patch.name = String(name);
    if (email != null) patch.email = String(email);
    if (phone != null) patch.phone = String(phone);
    if (avatarUrl != null) patch.avatarUrl = String(avatarUrl);

    if (notificationPrefs && typeof notificationPrefs === "object") {
      patch.notificationPrefs = {
        push: !!notificationPrefs.push,
        sms: !!notificationPrefs.sms,
        email: !!notificationPrefs.email,
      };
    }

    // 🔹 Bölge: CY / UK
    if (preferredRegion && ["CY", "UK"].includes(preferredRegion)) {
      patch.preferredRegion = preferredRegion;
    }

    // 🔹 Dil: tr / en / ru / el
    const ALLOWED_LANGS = ["tr", "en", "ru", "el"];
    if (
      preferredLanguage &&
      ALLOWED_LANGS.includes(preferredLanguage)
    ) {
      patch.preferredLanguage = preferredLanguage;
    }

    const baseSelect =
      "_id name email phone role restaurantId avatarUrl notificationPrefs providers noShowCount riskScore preferredRegion preferredLanguage createdAt updatedAt organizations restaurantMemberships";

    const u = await User.findByIdAndUpdate(
      req.user.id,
      { $set: patch },
      { new: true }
    )
      .select(baseSelect)
      .populate([
        { path: "restaurantId", select: "_id name" },
        { path: "organizations.organization", select: "_id name" },
        {
          path: "restaurantMemberships.restaurant",
          select: "_id name organizationId status",
        },
      ]);

    if (!u) return res.status(404).json({ message: "User not found" });

    res.json(toClientUser(u));
  } catch (e) {
    next(e);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    if (req.user?.role === "guest") {
      return res.status(403).json({
        message: "Misafir hesaplarında şifre değiştirilemez",
      });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword)
      return res.status(400).json({
        message: "currentPassword ve newPassword zorunludur",
      });

    const u = await User.findById(req.user.id)
      .select("+password +providers")
      .exec();
    if (!u) return res.status(404).json({ message: "User not found" });

    const providerNames = (u.providers || []).map((p) => p?.name);
    if (!providerNames.includes("password"))
      return res.status(400).json({
        message: "Hesap şifre sağlayıcısına bağlı değil",
      });

    const ok = await u.compare(currentPassword);
    if (!ok)
      return res
        .status(400)
        .json({ message: "Mevcut şifre hatalı" });

    u.password = newPassword;
    await u.save();
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/* ========== REFRESH / LOGOUT ========== */
/** POST /auth/refresh  { refreshToken } */
export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken)
      return res
        .status(400)
        .json({ message: "refreshToken gerekli" });

    const payload = jwt.verify(refreshToken, REFRESH_SECRET); // { id, v, iat, exp }

    // kullanıcı silinmiş olabilir
    const u = await User.findById(payload.id).select(
      "_id role name restaurantId organizations restaurantMemberships"
    );
    if (!u)
      return res.status(401).json({ message: "Unauthorized" });

    // yeni access üret (membership’lar token’a tekrar yazılıyor)
    const token = signAccessToken(u);
    // istersen rotation yap (yeni refresh üret):
    const newRefresh = signRefreshToken(u);

    res.json({ token, refreshToken: newRefresh });
  } catch (e) {
    // invalid/expired refresh => 401
    return next({ status: 401, message: "Invalid refresh token" });
  }
};

/** POST /auth/logout  — client refresh’ini silecek, server tarafı stateless */
export const logout = async (req, res) => {
  res.json({ ok: true });
};