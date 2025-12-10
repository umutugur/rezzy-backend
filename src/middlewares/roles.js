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

/**
 * Şube (restaurant) location_manager veya global admin kontrolü.
 *
 * Kullanım:
 *   router.get(
 *     "/admin/restaurants/:rid",
 *     auth(),
 *     allowLocationManagerOrAdmin("rid"),
 *     handler
 *   );
 *
 * - Eğer req.user.role === "admin" ise her zaman geçer.
 * - Değilse req.user.restaurantMemberships içinde:
 *     { restaurant: <params[paramName]>, role: "location_manager" }
 *   kaydı var mı diye bakar.
 */
export function allowLocationManagerOrAdmin(paramName = "rid") {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return next({ status: 401, message: "Unauthorized" });
    }

    // Global admin ise direkt geç
    if (user.role === "admin") {
      return next();
    }

    const restaurantId = req.params?.[paramName];
    if (!restaurantId) {
      return next({ status: 403, message: "Forbidden" });
    }

    const memberships = Array.isArray(user.restaurantMemberships)
      ? user.restaurantMemberships
      : [];

    const isManager = memberships.some((m) => {
      if (!m || !m.restaurant) return false;
      const restRef =
        typeof m.restaurant === "object" && m.restaurant._id
          ? m.restaurant._id
          : m.restaurant;
      return (
        String(restRef) === String(restaurantId) &&
        m.role === "location_manager"
      );
    });

    if (!isManager) {
      return next({ status: 403, message: "Forbidden" });
    }

    return next();
  };
}