// src/store/auth.ts

export type Role = "customer" | "restaurant" | "admin" | "guest";

export type OrgMembershipRole = "org_owner" | "org_admin" | "org_finance";
export type RestaurantMembershipRole = "location_manager" | "staff";

export type OrgMembership = {
  id: string | null;
  name: string | null;
  region: string | null;
  role: OrgMembershipRole | null;
};

export type RestaurantMembership = {
  id: string | null;
  restaurantId?: string | null;
  name: string | null;
  organizationId: string | null;
  status: string | null;
  role: RestaurantMembershipRole | null;
};

export type MeUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: Role;
  region?: string | null;

  // Legacy
  restaurantId?: string | null;
  restaurantName?: string | null;
  avatarUrl?: string | null;

  // ✅ Multi-organization
  organizations?: OrgMembership[];
  restaurantMemberships?: RestaurantMembership[];
};

const TOKEN_KEY = "rezvix_token";
const USER_KEY = "rezvix_user";

function extractObjectId(input: any): string | null {
  if (!input) return null;
  if (typeof input === "string") {
    const m = input.match(/[a-f0-9]{24}/i);
    return m ? m[0] : null;
  }
  if (typeof input === "object" && (input as any)._id)
    return String((input as any)._id);
  try {
    const j = JSON.stringify(input);
    const m = j.match(/[a-f0-9]{24}/i);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

function sanitizeUser(u: any): MeUser {
  // restaurantId hem doğrudan string/ObjectId, hem de populate edilmiş restaurant objesinden gelebilir
  const rid = extractObjectId(u?.restaurantId ?? u?.restaurant);

  const restaurantName: string | null =
    u?.restaurant && typeof u.restaurant === "object" && (u.restaurant as any).name
      ? String((u.restaurant as any).name)
      : u?.restaurantName
      ? String(u.restaurantName)
      : null;

  // organizations[] → { id, name, region, role }
  const organizationsRaw = Array.isArray(u?.organizations) ? u.organizations : [];
  const organizations: OrgMembership[] = organizationsRaw.map((entry: any) => {
    const id =
      entry?.id ??
      entry?._id ??
      entry?.organization?._id ??
      entry?.organization ??
      null;

    const name =
      entry?.name ??
      entry?.organization?.name ??
      null;

    const region =
      entry?.region ??
      entry?.organization?.region ??
      null;

    const role = (entry?.role as OrgMembershipRole) ?? null;

    return { id: id ? String(id) : null, name, region: region ? String(region) : null, role };
  });

  // restaurantMemberships[] → { id, name, organizationId, status, role }
  const membershipsRaw = Array.isArray(u?.restaurantMemberships)
    ? u.restaurantMemberships
    : [];
  const restaurantMemberships: RestaurantMembership[] = membershipsRaw.map(
    (entry: any) => {
      const rest =
        entry?.restaurant && typeof entry.restaurant === "object"
          ? entry.restaurant
          : entry?.restaurantId && typeof entry.restaurantId === "object"
          ? entry.restaurantId
          : entry;

      const restaurantIdRaw =
        extractObjectId(entry?.restaurantId) ||
        extractObjectId(entry?.restaurant) ||
        (typeof entry?.restaurantId === "string" ? entry.restaurantId : null) ||
        (typeof entry?.restaurant === "string" ? entry.restaurant : null) ||
        null;

      const idRaw =
        restaurantIdRaw ||
        extractObjectId(entry?.id) ||
        extractObjectId(entry?._id) ||
        extractObjectId(rest?._id) ||
        (typeof entry?.id === "string" ? entry.id : null) ||
        null;

      const name = entry?.name ?? rest?.name ?? null;

      const organizationId =
        entry?.organizationId ??
        (rest?.organizationId && rest.organizationId._id
          ? String(rest.organizationId._id)
          : rest?.organizationId ?? null);

      const status =
        entry?.status ??
        rest?.status ??
        null;

      const role = (entry?.role as RestaurantMembershipRole) ?? null;

      return {
        id: idRaw ? String(idRaw) : null,
        restaurantId: restaurantIdRaw
          ? String(restaurantIdRaw)
          : idRaw
          ? String(idRaw)
          : null,
        name,
        organizationId: organizationId ? String(organizationId) : null,
        status,
        role,
      };
    }
  );

  // ✅ region (user seviyesinde zorunlu alan)
  // Öncelik: user.region → populated restaurant.region → org entry region (organizations[0])
  // Not: organizations[] sanitize aşamasında region normalize ediliyor.
  const rawRegion =
    u?.region ??
    (u?.restaurant && typeof u.restaurant === "object" ? (u.restaurant as any).region : null) ??
    (Array.isArray(u?.organizations) && u.organizations[0]
      ? u.organizations[0]?.region ?? u.organizations[0]?.organization?.region
      : null) ??
    organizations?.[0]?.region ??
    null;

  const region = rawRegion == null ? null : String(rawRegion).trim().toUpperCase();

  return {
    id: String(u.id ?? u._id ?? ""),
    name: String(u.name ?? ""),
    email: u.email ?? null,
    phone: u.phone ?? null,
    role: (u.role as Role) ?? "customer",
    region,
    restaurantId: rid,
    restaurantName,
    avatarUrl: u.avatarUrl ?? null,
    organizations,
    restaurantMemberships,
  };
}

export const authStore = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
    window.dispatchEvent(new Event("auth:changed"));
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event("auth:changed"));
  },

  getUser(): MeUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const sane = sanitizeUser(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(sane)) {
        localStorage.setItem(USER_KEY, JSON.stringify(sane));
      }
      return sane;
    } catch {
      return null;
    }
  },

  setUser(u: MeUser | any) {
    const sane = sanitizeUser(u);
    localStorage.setItem(USER_KEY, JSON.stringify(sane));
    window.dispatchEvent(new Event("auth:changed"));
  },

  clearUser() {
    localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new Event("auth:changed"));
  },

  logout() {
    this.clearToken();
    this.clearUser();
  },
};
