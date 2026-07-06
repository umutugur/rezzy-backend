// src/controllers/auth.controller.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
import { normalizeLang } from "../utils/i18n.js";
import TaxiDriver from "../models/TaxiDriver.js";
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


const BASE_USER_SELECT =
  "_id name email phone role restaurantId avatarUrl notificationPrefs providers noShowCount riskScore preferredRegion preferredLanguage createdAt updatedAt organizations restaurantMemberships marketMemberships";

const USER_POPULATE = [
  { path: "restaurantId", select: "_id name preferredLanguage" },
  { path: "organizations.organization", select: "_id name region defaultLanguage" },
  {
    path: "restaurantMemberships.restaurant",
    select: "_id name organizationId status preferredLanguage",
  },
  {
    path: "marketMemberships.store",
    select: "_id name",
  },
];

const googleClient = new OAuth2Client();

const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/**
 * Google ID token doğrulama — dayanıklı (resilient) sürüm.
 *
 * Normalde `googleClient.verifyIdToken` Google'ın imza sertifikalarını
 * `www.googleapis.com/oauth2/v1/certs` adresinden çeker. Render free tier'ın
 * PAYLAŞIMLI çıkış IP'si zaman zaman Google tarafından bu uç noktada 403 ile
 * engellenir → "Failed to retrieve verification certificates". Bu durumda
 * kod tamamen sağlamdır; sunucu sadece public key'leri çekemiyordur.
 *
 * Fallback: sertifika çekimi başarısız olursa token'ı Google'ın `tokeninfo`
 * uç noktasıyla (farklı host/yol: oauth2.googleapis.com) doğrularız ve
 * audience/issuer/expiry kontrollerini manuel yaparız.
 */
async function verifyGoogleIdToken(idToken) {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_AUDIENCES,
    });
    return ticket.getPayload();
  } catch (e) {
    const certFetchFailed =
      e?.message?.includes("verification certificates") ||
      e?.message?.includes("oauth2/v1/certs") ||
      e?.code === 403 ||
      e?.status === 403 ||
      e?.code === "ECONNRESET" ||
      e?.code === "ETIMEDOUT" ||
      e?.code === "ENOTFOUND";

    // Audience/imza gibi gerçek doğrulama hatalarını olduğu gibi fırlat.
    if (!certFetchFailed) throw e;

    // ── Fallback: tokeninfo ile doğrula ──────────────────────────────────
    const resp = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" +
        encodeURIComponent(idToken),
    );
    if (!resp.ok) {
      // tokeninfo geçersiz token'a 400 döner → token sahte/expired.
      throw { status: 401, message: "Google token doğrulanamadı" };
    }
    const payload = await resp.json();

    // Manuel güvenlik kontrolleri (verifyIdToken'ın yaptıklarının dengi).
    if (!GOOGLE_AUDIENCES.includes(payload.aud)) {
      throw { message: "Wrong recipient (audience)" };
    }
    if (!GOOGLE_ISSUERS.includes(payload.iss)) {
      throw { status: 401, message: "Geçersiz Google issuer" };
    }
    if (Number(payload.exp) * 1000 < Date.now()) {
      throw { status: 401, message: "Google token süresi dolmuş" };
    }
    if (payload.email && payload.email_verified === "false") {
      throw { status: 401, message: "Google e-postası doğrulanmamış" };
    }
    return payload;
  }
}

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

    // 🔹 marketMemberships → { store: <id>, role }
    const marketMemberships = Array.isArray(uOrPayload.marketMemberships)
      ? uOrPayload.marketMemberships
          .map((m) => ({ store: String(m.store?._id ?? m.store ?? ""), role: String(m.role ?? "") }))
          .filter((m) => m.store && m.role)
      : [];

    const p = {
      id: uOrPayload._id.toString(),
      role: uOrPayload.role,
      name: uOrPayload.name,
      restaurantId,
      organizations,
      restaurantMemberships,
      marketMemberships,
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
  const preferredRegion = u.preferredRegion ?? null;
  const preferredLanguage =
    normalizeLang(u.preferredLanguage, null);

  // restaurantId hem ObjectId hem populate edilmiş obje olabilir
  let restaurantId = null;
  let restaurantName = null;
  let restaurantPreferredLanguage = null;
  if (u.restaurantId) {
    if (u.restaurantId._id) {
      restaurantId = u.restaurantId._id.toString();
      restaurantName = u.restaurantId.name || null;
      restaurantPreferredLanguage = normalizeLang(
        u.restaurantId.preferredLanguage,
        null
      );
    } else {
      restaurantId = u.restaurantId.toString?.() || null;
    }
  }

 // 🔹 organizations[] → { id, name, region, role }
let organizations = [];
if (Array.isArray(u.organizations)) {
  organizations = u.organizations.map((entry) => {
    const role = entry?.role ?? null;
    let orgId = null;
    let orgName = null;
    let orgRegion = null;
    let orgDefaultLanguage = null;

    const org = entry?.organization;
    if (org) {
      if (org._id) {
        orgId = org._id.toString();
        orgName = org.name || null;
        orgRegion = org.region || null; // ✅ EKLENDİ
        orgDefaultLanguage = normalizeLang(org.defaultLanguage, null);
      } else {
        orgId = org.toString?.() || null;
      }
    }

    return {
      id: orgId,
      name: orgName,
      region: orgRegion, // ✅ EKLENDİ
      defaultLanguage: orgDefaultLanguage,
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
      let preferredLanguage = null;
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
          preferredLanguage = normalizeLang(rest.preferredLanguage, null);
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
        preferredLanguage,
        role,
      };
    });
  }

  // 🔹 marketMemberships[] → { id, name, role }
  let marketMemberships = [];
  if (Array.isArray(u.marketMemberships)) {
    marketMemberships = u.marketMemberships.map((entry) => {
      const role = entry?.role ?? null;

      let storeId = null;
      let storeName = null;

      const store = entry?.store;
      if (store) {
        if (store._id) {
          storeId = store._id.toString();
          storeName = store.name || null;
        } else {
          storeId = store.toString?.() || null;
        }
      }

      return {
        id: storeId,
        store: storeId, // webpanel/mobil { store, role } bekler — eşleşme alanı
        name: storeName,
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
    restaurantPreferredLanguage,
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
    marketMemberships,
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
        region: "CY",
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

    const created = await User.create({
      name,
      email,
      phone,
      password,
      role: safeRole,
      providers: [{ name: "password", sub: email || phone || "local" }],
    });

    const user = await User.findById(created._id)
      .select(BASE_USER_SELECT)
      .populate(USER_POPULATE);

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

    const userWithPassword = await User.findOne(query).select("+password");
    if (!userWithPassword || !(await userWithPassword.compare(password))) {
      throw { status: 400, message: "Geçersiz bilgiler" };
    }

    ensureProvider(
      userWithPassword,
      "password",
      email || phone || "local"
    );

    await userWithPassword.save();

    const user = await User.findById(userWithPassword._id)
      .select(BASE_USER_SELECT)
      .populate(USER_POPULATE);

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

    const payload = await verifyGoogleIdToken(idToken);

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

    const populated = await User.findById(user._id)
      .select(BASE_USER_SELECT)
      .populate(USER_POPULATE);

    const token = signAccessToken(populated);
    const refreshToken = signRefreshToken(populated);
    res.json({ token, refreshToken, user: toClientUser(populated) });
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

    const populated = await User.findById(user._id)
      .select(BASE_USER_SELECT)
      .populate(USER_POPULATE);

    const token = signAccessToken(populated);
    const refreshToken = signRefreshToken(populated);
    res.json({ token, refreshToken, user: toClientUser(populated) });
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

    // Kullanıcıyı membership’leriyle birlikte çek
    const u = await User.findById(req.user.id)
      .select(BASE_USER_SELECT)
      .populate(USER_POPULATE);

    if (!u) return res.status(401).json({ message: "Unauthorized" });

    const taxiDriver = await TaxiDriver.findOne({ user: u._id }).lean();
    return res.json({ ...toClientUser(u), isDriver: !!taxiDriver });
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
    if (preferredLanguage) {
      const lang = normalizeLang(preferredLanguage, null);
      if (lang) patch.preferredLanguage = lang;
    }

    const u = await User.findByIdAndUpdate(
      req.user.id,
      { $set: patch },
      { new: true }
    )
      .select(BASE_USER_SELECT)
      .populate(USER_POPULATE);

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
      "_id role name restaurantId organizations restaurantMemberships marketMemberships"
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
