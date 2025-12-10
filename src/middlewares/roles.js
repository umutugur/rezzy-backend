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

// src/middlewares/roles.js

/**
 * Şube (restaurant) location_manager, staff veya global admin kontrolü.
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
 * - Değilse aşağıdaki senaryolarda geçer:
 *   1) Legacy: req.user.restaurantId === params[paramName]
 *   2) Yeni membership:
 *      req.user.restaurantMemberships içinde
 *        { restaurant | restaurantId | id: <params[paramName]>,
 *          role: "location_manager" | "staff" }
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

    const targetId = String(restaurantId);

    // 1) Legacy: user.restaurantId ile bağlanmış tek restoran kullanıcısı
    if (user.restaurantId && String(user.restaurantId) === targetId) {
      return next();
    }

    // 2) Yeni membership sistemi
    const memberships = Array.isArray(user.restaurantMemberships)
      ? user.restaurantMemberships
      : [];

    const allowedRoles = ["location_manager", "staff"];

    const isManager = memberships.some((m) => {
      if (!m) return false;

      // Membership içindeki restaurant referansını olabildiğince akıllı çöz
      const restRefRaw =
        m.restaurantId ||
        m.restaurant ||
        m.id ||
        (typeof m.restaurant === "object" && m.restaurant?._id
          ? m.restaurant._id
          : null);

      if (!restRefRaw) return false;

      const restRef = String(restRefRaw);
      const role = String(m.role || "");

      return restRef === targetId && allowedRoles.includes(role);
    });

    if (!isManager) {
      return next({ status: 403, message: "Forbidden" });
    }

    return next();
  };
}