// src/middlewares/roles.js
import mongoose from "mongoose";
import Reservation from "../models/Reservation.js"; // ✅ reservationId → restaurantId resolve için

/**
 * Basit global role kontrolü.
 * Örn: allow("admin"), allow("admin", "restaurant")
 */
export function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next({ status: 401, message: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return next({ status: 403, message: "Forbidden" });
    }
    next();
  };
}

/**
 * Kısayol: Sadece global admin’e izin ver.
 */
export function allowAdmin() {
  return allow("admin");
}

/**
 * Organizasyon owner’ı veya global admin kontrolü.
 */
export function allowOrgOwnerOrAdmin(paramName = "oid") {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return next({ status: 401, message: "Unauthorized" });
    }

    if (user.role === "admin") {
      return next();
    }

    const orgId = req.params?.[paramName];
    if (!orgId) {
      return next({ status: 403, message: "Forbidden" });
    }

    const orgs = Array.isArray(user.organizations) ? user.organizations : [];

    const isOwner = orgs.some((o) => {
      if (!o || !o.organization) return false;
      const orgRef =
        typeof o.organization === "object" && o.organization._id
          ? o.organization._id
          : o.organization;
      return String(orgRef) === String(orgId) && o.role === "org_owner";
    });

    if (!isOwner) {
      return next({ status: 403, message: "Forbidden" });
    }

    return next();
  };
}

function toIdString(v) {
  if (!v) return null;
  if (typeof v === "object") {
    if (v._id) return String(v._id);
    if (v.$oid) return String(v.$oid);
    if (v.id) return String(v.id);
  }
  return String(v);
}

/**
 * Location manager / staff veya global admin kontrolü.
 *
 * ✅ opts.type:
 *  - "restaurant" (default): param doğrudan restaurantId’dir
 *  - "reservation": param reservationId’dir, önce Reservation’dan restaurantId resolve edilir
 *
 * Kullanım örnekleri:
 *  allowLocationManagerOrAdmin("rid") // rid = restaurantId
 *  allowLocationManagerOrAdmin("rid", { type: "reservation" }) // rid = reservationId
 */
export function allowLocationManagerOrAdmin(
  paramName = "rid",
  opts = {}
) {
  const type = opts.type || "restaurant";
  const allowedRoles = opts.allowedRoles || ["location_manager", "staff"];

  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return next({ status: 401, message: "Unauthorized" });

      if (user.role === "admin") return next();

      const raw = req.params?.[paramName];
      if (!raw) return next({ status: 403, message: "Forbidden" });

      // param geçerli ObjectId mi? (reservationId / restaurantId ikisi için de)
      if (!mongoose.Types.ObjectId.isValid(String(raw))) {
        return next({ status: 400, message: "Invalid id" });
      }

      let targetRestaurantId = String(raw);

      // ✅ Eğer reservationId geldiyse restaurantId resolve et
      if (type === "reservation") {
        const r = await Reservation.findById(raw).select("restaurantId").lean();
        if (!r) return next({ status: 404, message: "Reservation not found" });

        const rid =
          r.restaurantId && typeof r.restaurantId === "object" && r.restaurantId._id
            ? String(r.restaurantId._id)
            : String(r.restaurantId || "");

        if (!rid || !mongoose.Types.ObjectId.isValid(rid)) {
          return next({ status: 400, message: "Reservation has no valid restaurantId" });
        }

        targetRestaurantId = rid;
      }

      // 1) Legacy
      if (user.restaurantId && toIdString(user.restaurantId) === targetRestaurantId) {
        return next();
      }

      // 2) Membership
      const memberships = Array.isArray(user.restaurantMemberships)
        ? user.restaurantMemberships
        : [];

      const ok = memberships.some((m) => {
        const restRef = toIdString(m?.restaurantId || m?.restaurant || m?.id);
        const role = String(m?.role || "");
        return restRef === targetRestaurantId && allowedRoles.includes(role);
      });

      // Debug istersen açık kalsın (istersen __DEV__ benzeri env ile sararsın)
      console.log("---- allowLocationManagerOrAdmin DEBUG ----");
      console.log("type:", type);
      console.log("param:", raw);
      console.log("resolvedRestaurantId:", targetRestaurantId);
      console.log("user.restaurantId:", user.restaurantId);
      console.log("memberships:", memberships);
      console.log("allowedRoles:", allowedRoles);
      console.log("ok:", ok);
      console.log("------------------------------------------");

      if (!ok) return next({ status: 403, message: "Forbidden" });
      return next();
    } catch (e) {
      return next(e);
    }
  };
}