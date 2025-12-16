// src/middlewares/roles.js

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
 * Şu an admin router’ında zaten allow("admin") kullanılıyor,
 * bunu istersen orada kullanabilirsin.
 */
export function allowAdmin() {
  return allow("admin");
}

/**
 * Organizasyon owner’ı veya global admin kontrolü.
 *
 * Kullanım:
 *   router.get(
 *     "/admin/organizations/:oid",
 *     auth(),
 *     allowOrgOwnerOrAdmin("oid"),
 *     handler
 *   );
 *
 * - Eğer req.user.role === "admin" ise her zaman geçer.
 * - Değilse req.user.organizations içinde:
 *     { organization: <params[paramName]>, role: "org_owner" }
 *   kaydı var mı diye bakar.
 */
export function allowOrgOwnerOrAdmin(paramName = "oid") {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return next({ status: 401, message: "Unauthorized" });
    }

    // Global admin ise direkt geç
    if (user.role === "admin") {
      return next();
    }

    const orgId = req.params?.[paramName];
    if (!orgId) {
      // Parametre yoksa bu guard’ı yanlış kullanıyoruz demektir
      return next({ status: 403, message: "Forbidden" });
    }

    const orgs = Array.isArray(user.organizations)
      ? user.organizations
      : [];

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

export function allowLocationManagerOrAdmin(paramName = "rid") {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return next({ status: 401, message: "Unauthorized" });

    if (user.role === "admin") return next();

    const restaurantId = req.params?.[paramName];
    if (!restaurantId) return next({ status: 403, message: "Forbidden" });

    const targetId = String(restaurantId);

    // 1) Legacy
    if (user.restaurantId && toIdString(user.restaurantId) === targetId) {
      return next();
    }

    // 2) Membership
    const memberships = Array.isArray(user.restaurantMemberships)
      ? user.restaurantMemberships
      : [];

    const allowedRoles = ["location_manager", "staff"];

    const ok = memberships.some((m) => {
      const restRef = toIdString(m?.restaurantId || m?.restaurant || m?.id);
      const role = String(m?.role || "");
      return restRef === targetId && allowedRoles.includes(role);
    });

    // ⬇⬇⬇ TAM OLARAK BURAYA EKLİYORSUN ⬇⬇⬇
   
      console.log("---- allowLocationManagerOrAdmin DEBUG ----");
      console.log("targetId:", targetId);
      console.log("user.restaurantId:", user.restaurantId);
      console.log("memberships:", memberships);
      console.log("allowedRoles:", allowedRoles);
      console.log("ok:", ok);
      console.log("------------------------------------------");
    
    // ⬆⬆⬆ BURAYA ⬆⬆⬆

    if (!ok) return next({ status: 403, message: "Forbidden" });
    return next();
  };
}