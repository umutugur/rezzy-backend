// src/middlewares/requireOrgAccess.js

/**
 * JWT payload shape (sende):
 * req.user.organizations: [{ organization: "<id>", role: "org_owner" | "org_admin" | "org_staff" | ... }]
 */
export function requireOrgAccess(allowedRoles = ["org_owner", "org_admin", "org_staff"]) {
  return (req, res, next) => {
    const orgId = String(req.params.organizationId || "");
    const memberships = Array.isArray(req.user?.organizations) ? req.user.organizations : [];

    const m = memberships.find((x) => String(x?.organization) === orgId);
    if (!m) return next({ status: 403, message: "Bu organizasyona erişiminiz yok." });

    const role = String(m?.role || "");
    if (!allowedRoles.includes(role)) {
      return next({ status: 403, message: "Bu işlem için organizasyon yetkiniz yok." });
    }

    req.orgMembership = m;
    return next();
  };
}