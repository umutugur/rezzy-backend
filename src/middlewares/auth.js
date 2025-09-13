// src/middlewares/auth.js
import jwt from "jsonwebtoken";

/**
 * Authorization: Bearer <token>
 * required=true -> token yoksa 401
 * required=false -> token yoksa user=null ile devam
 */
export function auth(required = true) {
  return (req, res, next) => {
    const dbg = process.env.AUTH_DEBUG === "1";
    try {
      const raw = req.headers.authorization || req.headers.Authorization || "";
      if (dbg) console.log("[auth] raw header:", raw);

      const token = extractBearer(raw);
      if (!token) {
        if (required) return next({ status: 401, message: "No token" });
        req.user = null;
        return next();
      }

      // verify throws on invalid/expired
      const payload = jwt.verify(token, process.env.JWT_SECRET, {
        // opsiyonel tolerans: clock skew durumlarına karşı
        clockTolerance: 5,
      });

      if (dbg) console.log("[auth] jwt ok:", payload);

      // Beklenen claim’leri normalize et
      req.user = {
        id: payload.id || payload._id || null,
        role: payload.role || "customer",
        name: payload.name || null,
        restaurantId: payload.restaurantId ?? null,
        // istersen token’ı da taşı
        // token,
      };

      return next();
    } catch (e) {
      if (process.env.AUTH_DEBUG === "1") {
        console.log("[auth] verify error:", e?.name, e?.message);
      }

      // jwt hataları için daha açıklayıcı cevaplar üret
      if (e?.name === "TokenExpiredError") {
        return next({ status: 401, message: "Token expired" });
      }
      if (e?.name === "JsonWebTokenError") {
        return next({ status: 401, message: "Invalid token" });
      }
      return next({ status: 401, message: "Unauthorized" });
    }
  };
}

/**
 * Sadece token’ı doğrular ama yoksa 401 vermez.
 * `req.user` ya payload olur, ya da null.
 */
export const authOptional = () => auth(false);

/** Yardımcı: header’dan Bearer token’ı güvenle ayıkla */
function extractBearer(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return null;

  // "Bearer <token>" ya da "bearer <token>" gibi varyasyonları yakala
  const parts = headerValue.trim().split(/\s+/);
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1];
  }

  // Bazı durumlarda doğrudan token gönderilebilir
  if (parts.length === 1 && parts[0].length > 20) {
    return parts[0];
  }
  return null;
}
