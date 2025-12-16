// src/middlewares/auth.js
import jwt from "jsonwebtoken";

function toIdString(v) {
  if (!v) return null;
  // mongoose ObjectId
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.$oid) return String(v.$oid);
    if (v.id) return String(v.id);
  }
  return String(v);
}

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

      const payload = jwt.verify(token, process.env.JWT_SECRET, { clockTolerance: 5 });
      if (dbg) console.log("[auth] jwt ok:", payload);

      const orgs = Array.isArray(payload.organizations) ? payload.organizations : [];
      const rms = Array.isArray(payload.restaurantMemberships) ? payload.restaurantMemberships : [];

      req.user = {
        id: toIdString(payload.id || payload._id),
        role: payload.role || "customer",
        name: payload.name || null,
        restaurantId: toIdString(payload.restaurantId),

        organizations: orgs.map((o) => ({
          ...o,
          organization: toIdString(o?.organization) || o?.organization,
        })),

        restaurantMemberships: rms.map((m) => ({
          ...m,
          restaurant: toIdString(m?.restaurantId || m?.restaurant || m?.id),
          // restaurantId gibi legacy alanlar varsa da normalize et
          restaurantId: toIdString(m?.restaurantId),
        })),
      };

      return next();
    } catch (e) {
      if (process.env.AUTH_DEBUG === "1") {
        console.log("[auth] verify error:", e?.name, e?.message);
      }
      if (e?.name === "TokenExpiredError") return next({ status: 401, message: "Token expired" });
      if (e?.name === "JsonWebTokenError") return next({ status: 401, message: "Invalid token" });
      return next({ status: 401, message: "Unauthorized" });
    }
  };
}

export const authOptional = () => auth(false);

function extractBearer(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return null;
  const parts = headerValue.trim().split(/\s+/);
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
  if (parts.length === 1 && parts[0].length > 20) return parts[0];
  return null;
}