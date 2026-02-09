import type { MeUser } from "../store/auth";
import { DEFAULT_LANGUAGE } from "../utils/languages";
import { normalizeLanguage } from "./index";

const ACTIVE_ORG_KEY = "rezvix_active_org_id";

export function setActiveOrgId(id?: string | null) {
  if (typeof window === "undefined") return;
  const v = String(id ?? "").trim();
  if (!v) return;
  try {
    window.localStorage.setItem(ACTIVE_ORG_KEY, v);
  } catch {}
}

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

function extractOrgIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/org\/organizations\/([^/]+)/);
  return m?.[1] ?? null;
}

function resolveOrgLanguage(user: MeUser | null, pathname: string) {
  if (!user) return DEFAULT_LANGUAGE;
  const fromPath = extractOrgIdFromPath(pathname);
  const stored = getActiveOrgId();
  const targetId = fromPath || stored || user.organizations?.[0]?.id || null;
  const org = targetId
    ? user.organizations?.find((o) => String(o?.id ?? "") === String(targetId))
    : user.organizations?.[0] || null;
  return normalizeLanguage(org?.defaultLanguage || DEFAULT_LANGUAGE);
}

function resolveRestaurantLanguage(user: MeUser | null) {
  if (!user) return DEFAULT_LANGUAGE;
  const lang =
    user.restaurantPreferredLanguage ||
    user.restaurantMemberships?.[0]?.preferredLanguage ||
    user.preferredLanguage ||
    DEFAULT_LANGUAGE;
  return normalizeLanguage(lang);
}

export function resolvePanelLanguage(user: MeUser | null, pathname: string) {
  const path = String(pathname || "");
  if (!user) return normalizeLanguage(DEFAULT_LANGUAGE);

  if (path.startsWith("/admin")) {
    return normalizeLanguage(user.preferredLanguage || DEFAULT_LANGUAGE);
  }

  if (path.startsWith("/org")) {
    return resolveOrgLanguage(user, path);
  }

  if (
    path.startsWith("/restaurant") ||
    path.startsWith("/panel/restaurant") ||
    path.startsWith("/restaurant-desktop")
  ) {
    return resolveRestaurantLanguage(user);
  }

  return normalizeLanguage(user.preferredLanguage || DEFAULT_LANGUAGE);
}
