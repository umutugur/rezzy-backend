export type Role = "customer" | "restaurant" | "admin";

export type MeUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: Role;
  restaurantId?: string | null;  // normalize edilecek
  restaurantName?: string | null;
  avatarUrl?: string | null;
};

const TOKEN_KEY = "rezvix_token";
const USER_KEY  = "rezvix_user";

function extractObjectId(input: any): string | null {
  if (!input) return null;
  if (typeof input === "string") {
    const m = input.match(/[a-f0-9]{24}/i);
    return m ? m[0] : null;
  }
  if (typeof input === "object" && (input as any)._id) return String((input as any)._id);
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
    (u?.restaurant && typeof u.restaurant === "object" && (u.restaurant as any).name)
      ? String((u.restaurant as any).name)
      : (u.restaurantName ? String(u.restaurantName) : null);

  return {
    id: String(u.id ?? u._id ?? ""),
    name: String(u.name ?? ""),
    email: u.email ?? null,
    phone: u.phone ?? null,
    role: (u.role as Role) ?? "customer",
    restaurantId: rid,
    restaurantName,
    avatarUrl: u.avatarUrl ?? null,
  };
}

export const authStore = {
  getToken(): string | null { return localStorage.getItem(TOKEN_KEY); },
  setToken(t: string) { localStorage.setItem(TOKEN_KEY, t); window.dispatchEvent(new Event("auth:changed")); },
  clearToken() { localStorage.removeItem(TOKEN_KEY); window.dispatchEvent(new Event("auth:changed")); },

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
    } catch { return null; }
  },
  setUser(u: MeUser | any) {
    const sane = sanitizeUser(u);
    localStorage.setItem(USER_KEY, JSON.stringify(sane));
    window.dispatchEvent(new Event("auth:changed"));
  },
  clearUser() { localStorage.removeItem(USER_KEY); window.dispatchEvent(new Event("auth:changed")); },

  logout() { this.clearToken(); this.clearUser(); }
};
