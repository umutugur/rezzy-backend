import axios from "axios";
import { authStore } from "../store/auth";
import { showToast } from "../ui/Toast";
import { t as i18nT } from "../i18n";

const baseURL = import.meta.env.VITE_API_BASE || "/api";

// src/api/client.ts
function normalizeMapsUrl(raw?: string): string | undefined {
  const v = String(raw ?? "").trim();
  if (!v) return undefined;

  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const encoded = encodeURI(withProto);

  try {
    const u = new URL(encoded);
    if (!/^https?:$/i.test(u.protocol)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export const api = axios.create({
  baseURL,
  withCredentials: false,
});

// ---- Request interceptor: Auth + GET cache-buster
api.interceptors.request.use((config) => {
  const t = authStore.getToken();
  if (t) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${t}`;
  }

  // ✅ FormData ise Content-Type set ETME / boundary'yi axios koysun
  if (config.data instanceof FormData) {
    if (config.headers) {
      delete (config.headers as any)["Content-Type"];
      delete (config.headers as any)["content-type"];
    }
  }

  const method = (config.method || "get").toLowerCase();
  const url = String(config.url || "");

  // ✅ Cache-buster: SADECE /auth/me (token yenilenince eski user cache'ini kırmak için)
  if (method === "get" && url.includes("/auth/me")) {
    config.params = { ...(config.params || {}), _ts: Date.now() };
  }

  return config;
});

// ---- Response interceptor: 304 normalize + 401 logout + toast
api.interceptors.response.use(
  (res) => {
    if (res.status === 304 && (res.data == null || res.data === "")) {
      return { ...res, status: 200, data: {} };
    }
    return res;
  },
  (err) => {
    const status = err?.response?.status;
    const url = String(err?.config?.url || "");
    const method = String(err?.config?.method || "get").toLowerCase();

    // ✅ 1) Bu istek "toast basma" diye işaretlenmişse sessiz geç
    const noToast = !!(err?.config as any)?.__noToast;

    // ✅ 2) delivery-settings GET 404 -> bazı env'lerde endpoint yok, normal kabul
    const isDeliverySettingsGet404 =
      status === 404 && method === "get" && url.includes("/delivery-settings");

    if (status === 401) {
      authStore.logout();
    }

    if (!noToast && !isDeliverySettingsGet404) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        i18nT("İstek başarısız");
      showToast(msg, "error");
    }

    return Promise.reject(err);
  }
);

// =========================
// Auth
// =========================
export async function loginWithEmail(input: {
  email?: string;
  phone?: string;
  password: string;
}) {
  const { data } = await api.post("/auth/login", input);
return data as { token: string; refreshToken: string | null; user: any };
}

export async function fetchMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function updateMe(patch: {
  name?: string;
  phone?: string;
  email?: string;
  avatarUrl?: string | null;
  notificationPrefs?: { push?: boolean; sms?: boolean; email?: boolean };
  preferredRegion?: string;
  preferredLanguage?: string;
}) {
  const { data } = await api.patch("/auth/me", patch);
  return data;
}

// =========================
// ADMIN — Notifications
// =========================
export type AdminSendTargets = "all" | "customers" | "restaurants" | "email";

export interface AdminSendResponse {
  ok: boolean;
  targetedUsers: number;
  targetedTokens: number;
  sent: number;
}

export async function adminSendNotification(input: {
  targets: AdminSendTargets;
  email?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<AdminSendResponse> {
  const { data } = await api.post("/notifications/admin/send", input);
  return data as AdminSendResponse;
}

// =========================
// ADMIN — Organizations
// =========================

export interface AdminOrganization {
  _id: string;
  name: string;
  region?: string;
  logoUrl?: string;
  taxNumber?: string;
  defaultLanguage?: string;
  createdAt?: string;
  updatedAt?: string;
  // Backend tarafında ek alanlar varsa onları da taşıyabilirsin
  [key: string]: any;
}

/**
 * GET /admin/organizations
 * - Liste + opsiyonel arama/paging
 */
export async function adminListOrganizations(params?: {
  query?: string;
  page?: number;
  limit?: number;
}) {
  const { data } = await api.get("/admin/organizations", { params });
  const items = Array.isArray(data) ? data : data?.items ?? [];
  return items as AdminOrganization[];
}

/**
 * POST /admin/organizations
 * - Yeni organization oluşturma
 */
export async function adminCreateOrganization(input: {
  name: string;
  region?: string;
  logoUrl?: string;
  taxNumber?: string;
  ownerId?:string;
  defaultLanguage?: string;
}) {
  const { data } = await api.post("/admin/organizations", input);
  return data as AdminOrganization;
}
/**
 * GET /admin/organizations/:id
 * - Detay + muhtemelen bağlı restoranlar, üyeler vs.
 */
export async function adminGetOrganization(id: string) {
  const { data } = await api.get(`/admin/organizations/${id}`);
  return data as AdminOrganization;
}

/**
 * POST /admin/organizations/:id/members
 * - Organizasyona yeni üye ekleme
 */
export async function adminAddOrganizationMember(
  orgId: string,
  input: { userId: string; role: string }
) {
  const { data } = await api.post(
    `/admin/organizations/${orgId}/members`,
    input
  );
  return data;
}

/**
 * DELETE /admin/organizations/:id/members/:userId
 * - Organizasyon üyeliği kaldırma
 */
export async function adminRemoveOrganizationMember(
  orgId: string,
  userId: string
) {
  const { data } = await api.delete(
    `/admin/organizations/${orgId}/members/${userId}`
  );
  return data;
}
// =========================
// ADMIN — Restaurant Memberships
// =========================

export async function adminAddRestaurantMember(
  rid: string,
  input: { userId: string; role: string }
) {
  const { data } = await api.post(
    `/admin/restaurants/${rid}/members`,
    input
  );
  return data as {
    ok: boolean;
    userId: string;
    restaurantId: string;
    role: string;
  };
}

export async function adminRemoveRestaurantMember(
  rid: string,
  userId: string
) {
  const { data } = await api.delete(
    `/admin/restaurants/${rid}/members/${userId}`
  );
  return data as {
    ok: boolean;
    userId: string;
    restaurantId: string;
    removed?: boolean;
  };
}

// =========================
// ADMIN — Restaurants
// =========================
export async function adminGetRestaurant(rid: string) {
  const { data } = await api.get(`/admin/restaurants/${rid}`);
  return data;
}

export async function adminUpdateRestaurantCommission(
  rid: string,
  commissionRate: number
) {
  const { data } = await api.patch(`/admin/restaurants/${rid}/commission`, {
    commissionRate,
  });
  return data;
}

export async function adminListReservationsByRestaurant(
  rid: string,
  params: {
    from?: string;
    to?: string;
    status?: string;
    page?: number;
    limit?: number;
  }
) {
  const { data } = await api.get(`/restaurants/${rid}/reservations`, { params });
  return data;
}

// ✅ owner seçimi için user arama
export async function adminSearchUsers(
  query: string
): Promise<Array<{ _id: string; name?: string; email?: string; role?: string }>> {
  const { data } = await api.get("/admin/users", {
    params: { query, limit: 20 },
  });
  const items = Array.isArray(data) ? data : data?.items || [];
  return items;
}

// ✅ Admin — Create user
export async function adminCreateUser(input: {
  name: string;
  email?: string;
  phone?: string;
  password?: string;
}) {
  const { data } = await api.post("/admin/users", input);
  return data;
}

// ✅ Admin — Create restaurant
export async function adminCreateRestaurant(input: {
  ownerId: string;
  name: string;
  region?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;

  businessType?: string;
  categorySet?: string;

  commissionRate?: number;
  depositRequired?: boolean;
  depositAmount?: number;
  checkinWindowBeforeMinutes?: number;
  checkinWindowAfterMinutes?: number;
  underattendanceThresholdPercent?: number;

  mapAddress?: string;
  placeId?: string;
  googleMapsUrl?: string;
  location?: { type: "Point"; coordinates: [number, number] };
}) {
  const lng = Number(input?.location?.coordinates?.[0]);
  const lat = Number(input?.location?.coordinates?.[1]);
  const hasCoords = Number.isFinite(lng) && Number.isFinite(lat);

  const payload: any = {
    ...input,
    mapAddress: input.mapAddress ?? "",
    placeId: input.placeId ?? "",
  };

  const gm = normalizeMapsUrl(input.googleMapsUrl);
  if (gm) payload.googleMapsUrl = gm;
  else delete payload.googleMapsUrl;

  if (hasCoords) {
    payload.location = {
      type: "Point",
      coordinates: [lng, lat] as [number, number],
    };
  } else {
    delete payload.location;
  }

  const { data } = await api.post("/admin/restaurants", payload);
  return data;
}
// ✅ Admin — Single Restaurant Create (auto-organization)
export async function adminCreateSingleRestaurant(input: {
  ownerId: string;
  name: string;
  region?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;

  businessType?: string;
  categorySet?: string;

  commissionRate?: number;
  depositRequired?: boolean;
  depositAmount?: number;
  checkinWindowBeforeMinutes?: number;
  checkinWindowAfterMinutes?: number;
  underattendanceThresholdPercent?: number;

  mapAddress?: string;
  placeId?: string;
  googleMapsUrl?: string;
  location?: { type: "Point"; coordinates: [number, number] };

  // opsiyonel: org adını override etmek istersen
  organizationName?: string;
}) {
  const lng = Number(input?.location?.coordinates?.[0]);
  const lat = Number(input?.location?.coordinates?.[1]);
  const hasCoords = Number.isFinite(lng) && Number.isFinite(lat);

  const payload: any = {
    ...input,
    mapAddress: input.mapAddress ?? "",
    placeId: input.placeId ?? "",
  };

  const gm = normalizeMapsUrl(input.googleMapsUrl);
  if (gm) payload.googleMapsUrl = gm;
  else delete payload.googleMapsUrl;

  if (hasCoords) {
    payload.location = {
      type: "Point",
      coordinates: [lng, lat] as [number, number],
    };
  } else {
    delete payload.location;
  }

  // 🔴 Backend'de eklenecek endpoint:
  // POST /admin/restaurants/single
  const { data } = await api.post("/admin/restaurants/single", payload);
  return data;
}

/**
 * POST /admin/organizations/:orgId/restaurants
 * - Organization’a bağlı yeni şube (restaurant) oluşturma
 * - Payload, adminCreateRestaurant ile AYNI mantıkta hazırlanıyor
 */
export async function adminCreateOrganizationRestaurant(
  orgId: string,
  input: {
    ownerId: string;
    name: string;
    region?: string;
    city?: string;
    address?: string;
    phone?: string;
    email?: string;

    businessType?: string;
    categorySet?: string;

    commissionRate?: number;
    depositRequired?: boolean;
    depositAmount?: number;
    checkinWindowBeforeMinutes?: number;
    checkinWindowAfterMinutes?: number;
    underattendanceThresholdPercent?: number;

    mapAddress?: string;
    placeId?: string;
    googleMapsUrl?: string;
    location?: { type: "Point"; coordinates: [number, number] };
  }
) {
  const lng = Number(input?.location?.coordinates?.[0]);
  const lat = Number(input?.location?.coordinates?.[1]);
  const hasCoords = Number.isFinite(lng) && Number.isFinite(lat);

  const payload: any = {
    ...input,
    mapAddress: input.mapAddress ?? "",
    placeId: input.placeId ?? "",
  };

  const gm = normalizeMapsUrl(input.googleMapsUrl);
  if (gm) payload.googleMapsUrl = gm;
  else delete payload.googleMapsUrl;

  if (hasCoords) {
    payload.location = {
      type: "Point",
      coordinates: [lng, lat] as [number, number],
    };
  } else {
    delete payload.location;
  }

  const { data } = await api.post(
    `/admin/organizations/${orgId}/restaurants`,
    payload
  );
  return data;
}

// =========================
// ADMIN — Users
// =========================
export async function adminGetUser(uid: string) {
  const { data } = await api.get(`/admin/users/${uid}`);
  return data?.user ?? data;
}

export async function adminBanUser(
  uid: string,
  input: { reason: string; bannedUntil?: string }
) {
  const { data } = await api.post(`/admin/users/${uid}/ban`, input);
  return data as { ok: boolean; user: { _id: string; banned: boolean } };
}

export async function adminUnbanUser(uid: string) {
  const { data } = await api.post(`/admin/users/${uid}/unban`);
  return data;
}

export async function adminUpdateUserRole(
  uid: string,
  role: "customer" | "restaurant" | "admin"
) {
  const { data } = await api.post(`/admin/users/${uid}/role`, { role });
  return data;
}

export async function adminResetUserPassword(
  uid: string,
  password: string
) {
  const { data } = await api.post(
    `/admin/users/${uid}/reset-password`,
    { password }
  );
  return data;
}

// ✅ Risk history
export type RiskIncidentType =
  | "NO_SHOW"
  | "LATE_CANCEL"
  | "UNDER_ATTEND"
  | "GOOD_ATTEND";

export interface AdminUserRiskIncident {
  type: RiskIncidentType;
  weight: number;
  at: string;
  reservationId: string | null;
}

export interface AdminUserRiskSnapshot {
  riskScore: number;
  noShowCount: number;
  banned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  consecutiveGoodShows: number;
  windowDays: number;
  weights: Record<
    "NO_SHOW" | "LATE_CANCEL" | "UNDER_ATTEND" | "GOOD_ATTEND",
    number
 >;
  multiplier: number;
}

export async function adminGetUserRiskHistory(
  uid: string,
  params?: { start?: string; end?: string; limit?: number }
): Promise<{
  user: { _id: string; name: string; email: string; createdAt: string };
  snapshot: AdminUserRiskSnapshot;
  incidents: AdminUserRiskIncident[];
  range: { start: string | null; end: string | null; limit: number };
}> {
  const { data } = await api.get(`/admin/users/${uid}/risk`, { params });
  return data;
}

export async function adminGetUserStats(): Promise<{
  ok: boolean;
  total: number;
  banned: number;
  highRisk: number;
  avgRisk: number;
}> {
  const { data } = await api.get("/admin/users/stats");
  return data;
}

export async function adminExportUsers(): Promise<void> {
  const resp = await api.get("/admin/users/export", { responseType: "blob" });
  const blob = new Blob([resp.data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "users.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =========================
// ADMIN — Moderation
// =========================
export async function adminListReviews(params?: {
  page?: number;
  limit?: number;
}) {
  const { data } = await api.get(`/admin/reviews`, { params });
  return data;
}

export async function adminHideReview(id: string) {
  const { data } = await api.post(`/admin/reviews/${id}/hide`);
  return data;
}

export async function adminUnhideReview(id: string) {
  const { data } = await api.post(`/admin/reviews/${id}/unhide`);
  return data;
}

export async function adminDeleteReview(id: string) {
  const { data } = await api.delete(`/admin/reviews/${id}`);
  return data;
}

export async function adminListComplaints(params?: {
  page?: number;
  limit?: number;
}) {
  const { data } = await api.get(`/admin/complaints`, { params });
  return data;
}

export async function adminResolveComplaint(id: string) {
  const { data } = await api.post(`/admin/complaints/${id}/resolve`);
  return data;
}

export async function adminDismissComplaint(id: string) {
  const { data } = await api.post(`/admin/complaints/${id}/dismiss`);
  return data;
}

// =========================
// ADMIN — Banners
// =========================
export type AdminBannerTargetType = "delivery" | "reservation";

export type AdminBanner = {
  _id: string;
  placement: string; // home_top | home_mid | ...
  region: string | null; // TR, CY ... null = all
  title: string | null;
  imageUrl: string;
  linkUrl: string | null;
  isActive: boolean;
  order: number;
  startAt: string | null;
  endAt: string | null;

  // ✅ new
  targetType: AdminBannerTargetType;
  restaurantId: string;

  createdAt?: string;
  updatedAt?: string;
};

export async function adminListBanners(params?: {
  placement?: string;
  region?: string;
  active?: "true" | "false";
}) {
  const { data } = await api.get("/admin/banners", { params });
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return { items: items as AdminBanner[] };
}

export async function adminCreateBanner(input: {
  placement: string;
  region?: string | null;
  title?: string | null;
  linkUrl?: string | null;
  order?: number;
  isActive?: boolean;
  startAt?: string | null; // ISO
  endAt?: string | null;   // ISO

  targetType: AdminBannerTargetType;
  restaurantId: string;

  imageFile: File; // ✅ required
}) {
  const fd = new FormData();
  fd.append("placement", input.placement);
  if (input.region != null) fd.append("region", input.region || "");
  if (input.title != null) fd.append("title", input.title || "");
  if (input.linkUrl != null) fd.append("linkUrl", input.linkUrl || "");
  if (input.order != null) fd.append("order", String(input.order));
  if (input.isActive != null) fd.append("isActive", String(input.isActive));
  if (input.startAt != null) fd.append("startAt", input.startAt || "");
  if (input.endAt != null) fd.append("endAt", input.endAt || "");

  // ✅ action mapping
  fd.append("targetType", input.targetType);
  fd.append("restaurantId", input.restaurantId);

  // ✅ backend upload.single("image")
  fd.append("image", input.imageFile);

  const { data } = await api.post("/admin/banners", fd);
  return data as { ok: boolean; banner: AdminBanner };
}

export async function adminUpdateBanner(
  id: string,
  input: {
    placement?: string;
    region?: string | null;
    title?: string | null;
    linkUrl?: string | null;
    order?: number;
    isActive?: boolean;
    startAt?: string | null;
    endAt?: string | null;

    targetType?: AdminBannerTargetType;
    restaurantId?: string;

    imageFile?: File | null; // optional replace
  }
) {
  const fd = new FormData();
  if (input.placement != null) fd.append("placement", input.placement);
  if (input.region != null) fd.append("region", input.region || "");
  if (input.title != null) fd.append("title", input.title || "");
  if (input.linkUrl != null) fd.append("linkUrl", input.linkUrl || "");
  if (input.order != null) fd.append("order", String(input.order));
  if (input.isActive != null) fd.append("isActive", String(input.isActive));
  if (input.startAt != null) fd.append("startAt", input.startAt || "");
  if (input.endAt != null) fd.append("endAt", input.endAt || "");

  if (input.targetType != null) fd.append("targetType", input.targetType);
  if (input.restaurantId != null) fd.append("restaurantId", input.restaurantId);

  if (input.imageFile instanceof File) {
    fd.append("image", input.imageFile);
  }

  const { data } = await api.patch(`/admin/banners/${id}`, fd);
  return data as { ok: boolean; banner: AdminBanner };
}

export async function adminDeleteBanner(id: string) {
  const { data } = await api.delete(`/admin/banners/${id}`);
  return data as { ok: boolean };
}

// =========================
// RESTAURANT — Genel
// =========================
export async function restaurantGet(rid: string) {
  // ✅ Restaurant detail endpoint
  // NOTE: /api/panel/restaurants/:id is currently returning 404 in backend logs,
  // so we fall back to the public restaurant resource path.
  const { data } = await api.get(`/restaurants/${rid}`);
  return data;
}

export async function restaurantUpdateProfile(rid: string, form: any) {
  const lng = Number(form?.location?.coordinates?.[0]);
  const lat = Number(form?.location?.coordinates?.[1]);
  const hasCoords = Number.isFinite(lng) && Number.isFinite(lat);

  const payload: any = {
    name: form.name ?? "",
    email: form.email ?? "",
    phone: form.phone ?? "",
    city: form.city ?? "",
    address: form.address ?? "",
    description: form.description ?? "",
    iban: form.iban ?? "",
    ibanName: form.ibanName ?? "",
    bankName: form.bankName ?? "",
    priceRange: form.priceRange ?? "₺₺",
    mapAddress: form.mapAddress ?? "",
    placeId: form.placeId ?? "",
    preferredLanguage: form.preferredLanguage ?? undefined,
  };

  if (typeof form.region === "string") {
    const r = form.region.trim().toUpperCase();
    if (r) payload.region = r;
  }

  const gm = normalizeMapsUrl(form.googleMapsUrl);
  if (gm) payload.googleMapsUrl = gm;

  if (hasCoords) {
    payload.location = {
      type: "Point",
      coordinates: [lng, lat] as [number, number],
    };
  }

  const { data } = await api.put(`/restaurants/${rid}`, payload);
  return data;
}

export async function restaurantGetInsights(
  rid: string,
  p?: { from?: string; to?: string }
) {
  const { data } = await api.get(`/restaurants/${rid}/insights`, { params: p });
  return data;
}

// Fotoğraflar
export async function restaurantAddPhoto(rid: string, file: File) {
  const asDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const { data } = await api.post(`/restaurants/${rid}/photos`, {
    fileUrl: asDataUrl,
  });
  return data;
}

export async function restaurantRemovePhoto(rid: string, url: string) {
  const { data } = await api.delete(`/restaurants/${rid}/photos`, {
    data: { url },
  });
  return data;
}

// Rezervasyon durumu
export async function restaurantUpdateReservationStatus(
  resId: string,
  status: "confirmed" | "cancelled"
) {
  if (status === "confirmed") {
    const { data } = await api.post(`/reservations/${resId}/approve`);
    return data;
  }

  const { data } = await api.put(
    `/restaurants/reservations/${resId}/status`,
    { status }
  );
  return data;
}

// QR
export async function restaurantGetReservationQR(resId: string) {
  const { data } = await api.get(`/reservations/${resId}/qr`);
  return data as {
    ok: boolean;
    rid: string;
    mid: string;
    ts: string;
    payload?: string;
    qrDataUrl?: string;
    qrUrl?: string;
  };
}
// =========================
// RESTAURANT — Modifier Groups (Options)
// =========================

export type RestaurantModifierOption = {
  _id: string;
  title: string;
  price: number;
  order: number;
  isActive: boolean;
};

export type RestaurantModifierGroup = {
  _id: string;
  restaurantId: string;
  title: string;
  description?: string;
  minSelect: number;
  maxSelect: number;
  order: number;
  isActive: boolean;
  options: RestaurantModifierOption[];
  createdAt?: string;
  updatedAt?: string;
};

/**
 * GET /api/panel/restaurants/:rid/menu/modifier-groups?includeInactive=true
 */
export async function restaurantListModifierGroups(
  rid: string,
  params?: { includeInactive?: boolean }
): Promise<{ items: RestaurantModifierGroup[] }> {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/menu/modifier-groups`,
    { params }
  );
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return { items };
}

/**
 * POST /api/panel/restaurants/:rid/menu/modifier-groups
 */
export async function restaurantCreateModifierGroup(
  rid: string,
  input: {
    title: string;
    description?: string;
    minSelect?: number;
    maxSelect?: number;
    order?: number;
    isActive?: boolean;
  }
): Promise<{ ok: boolean; group: RestaurantModifierGroup }> {
  const payload: any = {
    title: input.title,
    description: input.description ?? "",
    minSelect: typeof input.minSelect === "number" ? input.minSelect : 0,
    maxSelect: typeof input.maxSelect === "number" ? input.maxSelect : 1,
    order: typeof input.order === "number" ? input.order : 0,
  };
  if (typeof input.isActive === "boolean") payload.isActive = input.isActive;

  const { data } = await api.post(
    `/panel/restaurants/${rid}/menu/modifier-groups`,
    payload
  );
  return data as { ok: boolean; group: RestaurantModifierGroup };
}

/**
 * PATCH /api/panel/restaurants/:rid/menu/modifier-groups/:gid
 */
export async function restaurantUpdateModifierGroup(
  rid: string,
  gid: string,
  input: {
    title?: string;
    description?: string;
    minSelect?: number;
    maxSelect?: number;
    order?: number;
    isActive?: boolean;
  }
): Promise<{ ok: boolean; group: RestaurantModifierGroup }> {
  const payload: any = {};
  if (input.title != null) payload.title = input.title;
  if (input.description != null) payload.description = input.description;
  if (typeof input.minSelect === "number") payload.minSelect = input.minSelect;
  if (typeof input.maxSelect === "number") payload.maxSelect = input.maxSelect;
  if (typeof input.order === "number") payload.order = input.order;
  if (typeof input.isActive === "boolean") payload.isActive = input.isActive;

  const { data } = await api.patch(
    `/panel/restaurants/${rid}/menu/modifier-groups/${gid}`,
    payload
  );
  return data as { ok: boolean; group: RestaurantModifierGroup };
}

/**
 * DELETE /api/panel/restaurants/:rid/menu/modifier-groups/:gid (soft)
 */
export async function restaurantDeleteModifierGroup(
  rid: string,
  gid: string
): Promise<{ ok: boolean }> {
  const { data } = await api.delete(
    `/panel/restaurants/${rid}/menu/modifier-groups/${gid}`
  );
  return data as { ok: boolean };
}

/**
 * POST /api/panel/restaurants/:rid/menu/modifier-groups/:gid/options
 */
export async function restaurantAddModifierOption(
  rid: string,
  gid: string,
  input: { title: string; price?: number; order?: number; isActive?: boolean }
): Promise<{ ok: boolean; group: RestaurantModifierGroup }> {
  const payload: any = {
    title: input.title,
    price: typeof input.price === "number" ? input.price : 0,
    order: typeof input.order === "number" ? input.order : 0,
  };
  if (typeof input.isActive === "boolean") payload.isActive = input.isActive;

  const { data } = await api.post(
    `/panel/restaurants/${rid}/menu/modifier-groups/${gid}/options`,
    payload
  );
  return data as { ok: boolean; group: RestaurantModifierGroup };
}

/**
 * PATCH /api/panel/restaurants/:rid/menu/modifier-groups/:gid/options/:oid
 */
export async function restaurantUpdateModifierOption(
  rid: string,
  gid: string,
  oid: string,
  input: { title?: string; price?: number; order?: number; isActive?: boolean }
): Promise<{ ok: boolean; group: RestaurantModifierGroup }> {
  const payload: any = {};
  if (input.title != null) payload.title = input.title;
  if (typeof input.price === "number") payload.price = input.price;
  if (typeof input.order === "number") payload.order = input.order;
  if (typeof input.isActive === "boolean") payload.isActive = input.isActive;

  const { data } = await api.patch(
    `/panel/restaurants/${rid}/menu/modifier-groups/${gid}/options/${oid}`,
    payload
  );
  return data as { ok: boolean; group: RestaurantModifierGroup };
}

/**
 * DELETE /api/panel/restaurants/:rid/menu/modifier-groups/:gid/options/:oid (soft)
 */
export async function restaurantDeleteModifierOption(
  rid: string,
  gid: string,
  oid: string
): Promise<{ ok: boolean; group: RestaurantModifierGroup }> {
  const { data } = await api.delete(
    `/panel/restaurants/${rid}/menu/modifier-groups/${gid}/options/${oid}`
  );
  return data as { ok: boolean; group: RestaurantModifierGroup };
}

// =========================
// RESTAURANT — Menu Overrides (Org menü için şube override)
// =========================

export type BranchCategoryOverridePayload = {
  hidden?: boolean;   // true => şubede gizle
  order?: number;     // şube sırası
};

export type BranchItemOverridePayload = {
  hidden?: boolean;       // true => şubede gizle
  order?: number;         // şube sırası
  price?: number;         // şube fiyatı
  isAvailable?: boolean;  // serviste mi
};

/**
 * PATCH /api/panel/restaurants/:rid/menu/overrides/categories/:orgCategoryId
 */
export async function restaurantUpsertCategoryOverride(
  rid: string,
  orgCategoryId: string,
  input: BranchCategoryOverridePayload
) {
  const { data } = await api.patch(
    `/panel/restaurants/${rid}/menu/overrides/categories/${orgCategoryId}`,
    input
  );
  return data as { ok: boolean; override: any };
}

/**
 * PATCH /api/panel/restaurants/:rid/menu/overrides/items/:orgItemId
 */
export async function restaurantUpsertItemOverride(
  rid: string,
  orgItemId: string,
  input: BranchItemOverridePayload
) {
  const { data } = await api.patch(
    `/panel/restaurants/${rid}/menu/overrides/items/${orgItemId}`,
    input
  );
  return data as { ok: boolean; override: any };
}
// =========================
// RESTAURANT — Menu Categories & Items
// =========================

export type RestaurantResolvedMenuItem = {
  _id: string;
  categoryId: string;
  title: string;
  description: string | null;
  price: number;
  photoUrl: string | null;
  tags: string[];
  order: number;
  isActive: boolean;
  isAvailable: boolean;
  orgItemId?: string | null;
  // ✅ Opsiyon grupları (modifier groups)
  modifierGroupIds?: string[];
  modifierGroups?: RestaurantModifierGroup[];
  createdAt?: string;
  updatedAt?: string;
};

export type RestaurantResolvedMenuCategory = {
  _id: string;
  title: string;
  description: string | null;
  order: number;
  isActive: boolean;
  orgCategoryId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  items: RestaurantResolvedMenuItem[];
};

export type RestaurantResolvedMenuResponse = {
  restaurantId?: string;
  organizationId?: string | null;
  categories: RestaurantResolvedMenuCategory[];
};

/**
 * GET /api/panel/restaurants/:rid/menu/resolved
 * - Org + override + local menü merge edilmiş tek kapı
 */
export async function restaurantGetResolvedMenu(
  rid: string,
  params?: { includeInactive?: boolean; includeUnavailable?: boolean }
): Promise<RestaurantResolvedMenuResponse> {
  const { data } = await api.get(`/panel/restaurants/${rid}/menu/resolved`, {
    params,
  });
  return (data ?? { categories: [] }) as RestaurantResolvedMenuResponse;
}

export async function restaurantListCategories(
  rid: string,
  params?: { includeInactive?: boolean }
) {
  const { data } = await api.get(`/panel/restaurants/${rid}/menu/categories`, {
    params,
  });
  return (data?.items ?? data ?? []) as Array<any>;
}

export async function restaurantCreateCategory(
  rid: string,
  input: { title: string; description?: string; order?: number }
) {
  const { data } = await api.post(
    `/panel/restaurants/${rid}/menu/categories`,
    input
  );
  return data;
}

export async function restaurantUpdateCategory(
  rid: string,
  cid: string,
  input: {
    title?: string;
    description?: string;
    order?: number;
    isActive?: boolean;
  }
) {
  const { data } = await api.patch(
    `/panel/restaurants/${rid}/menu/categories/${cid}`,
    input
  );
  return data;
}

export async function restaurantDeleteCategory(rid: string, cid: string) {
  const { data } = await api.delete(
    `/panel/restaurants/${rid}/menu/categories/${cid}`
  );
  return data;
}

export async function restaurantListItems(
  rid: string,
  params?: { categoryId?: string; includeInactive?: boolean }
) {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/menu/items`,
    { params }
  );
  return (data?.items ?? data ?? []) as Array<any>;
}

export async function restaurantCreateItem(
  rid: string,
  input: {
    categoryId: string;
    title: string;
    description?: string;
    price: number;
    tags?: string[];
    order?: number;
    isAvailable?: boolean;
    photoFile?: File | null;
    modifierGroupIds?: string[];
  }
) {
  const fd = new FormData();

  fd.append("categoryId", input.categoryId);
  fd.append("title", input.title);
  fd.append("description", input.description ?? "");
  fd.append("price", String(input.price));
  fd.append("order", String(input.order ?? 0));
  fd.append("isAvailable", String(input.isAvailable ?? true));

  (input.tags ?? []).forEach((t) => {
    if (t) fd.append("tags", t);
  });

  // ✅ Opsiyon grupları (modifier groups)
  if (Array.isArray((input as any).modifierGroupIds)) {
    const ids = (input as any).modifierGroupIds.map(String).map((x: string) => x.trim()).filter(Boolean);
    if (ids.length) fd.append("modifierGroupIds", ids.join(","));
  }

  if (input.photoFile instanceof File) {
    fd.append("photo", input.photoFile);
  }

  // ❗ headers YOK — boundary otomatik
  const { data } = await api.post(
    `/panel/restaurants/${rid}/menu/items`,
    fd
  );
  return data;
}

export async function restaurantUpdateItem(
  rid: string,
  iid: string,
  input: {
    categoryId?: string;
    title?: string;
    description?: string;
    price?: number;
    tags?: string[];
    order?: number;
    isAvailable?: boolean;
    isActive?: boolean;
    removePhoto?: boolean;
    photoFile?: File | null;
    modifierGroupIds?: string[];
  }
) {
  const fd = new FormData();
  if (input.categoryId) fd.append("categoryId", input.categoryId);
  if (input.title != null) fd.append("title", input.title);
  if (input.description != null) fd.append("description", input.description);
  if (input.price != null) fd.append("price", String(input.price));
  if (input.order != null) fd.append("order", String(input.order));
  if (input.isAvailable != null)
    fd.append("isAvailable", String(input.isAvailable));
  if (input.isActive != null) fd.append("isActive", String(input.isActive));
  if (input.removePhoto != null)
    fd.append("removePhoto", String(input.removePhoto));
  (input.tags ?? []).forEach((t) => {
    if (t) fd.append("tags", t);
  });
  // ✅ Opsiyon grupları (modifier groups)
  if (Array.isArray((input as any).modifierGroupIds)) {
    const ids = (input as any).modifierGroupIds.map(String).map((x: string) => x.trim()).filter(Boolean);
    // Not: boş array gönderilirse backend default([]) / mevcut kalabilir; temizlemek istersen [] yerine explicit empty string gönder.
    fd.append("modifierGroupIds", ids.join(","));
  }
  if (input.photoFile) fd.append("photo", input.photoFile);

  const { data } = await api.patch(
    `/panel/restaurants/${rid}/menu/items/${iid}`,
    fd
  );
  return data;
}

export async function restaurantDeleteItem(rid: string, iid: string) {
  const { data } = await api.delete(
    `/panel/restaurants/${rid}/menu/items/${iid}`
  );
  return data;
}

// =========================
// ADMIN — Commissions (ARRIVED only)
// =========================
export async function adminPreviewCommissions(month?: string) {
  const { data } = await api.get("/admin/commissions/monthly", {
    params: month ? { month } : {},
  });

  return data as {
    ok: boolean;
    month: string;
    restaurants: Array<{
      _id: string;
      restaurantName: string;
      arrivedCount: number;
      revenueArrived: number;
      commissionRate: number;
      commissionAmount: number;
      ownerName?: string | null;
      ownerEmail?: string | null;
    }>;
  };
}

export async function adminExportCommissions(month?: string): Promise<Blob> {
  const resp = await api.get("/admin/commissions/monthly/export", {
    params: month ? { month } : {},
    responseType: "blob",
  });
  return resp.data as Blob;
}

/**
 * ✅ Admin — Update restaurant (organization-independent fields)
 * PATCH /api/admin/restaurants/:rid
 *
 * Backend: updateRestaurantAdmin
 * Not: commissionRate ayrı endpoint'ten yönetilir.
 */
export async function adminUpdateRestaurantAdmin(rid: string, payload: any) {
  const { data } = await api.patch(`/admin/restaurants/${rid}`, payload);
  return data;
}

/**
 * ⚠️ Legacy: Eski update path'i kullanan ekranlar için alias.
 * Yeni sistemde mümkün olduğunca `adminUpdateRestaurantAdmin` kullan.
 */
export async function adminUpdateRestaurant(rid: string, payload: any) {
  return adminUpdateRestaurantAdmin(rid, payload);
}

/**
 * ⚠️ Very legacy: Doğrudan public restaurant update (panel/public) endpoint'i.
 * Eğer gerçekten ihtiyaç varsa kullan; admin akışı için önerilmez.
 */
export async function adminUpdateRestaurantLegacyPublic(rid: string, payload: any) {
  const { data } = await api.put(`/restaurants/${rid}`, payload);
  return data;
}
// =========================
// RESTAURANT — Reports (Overview)
// =========================

export interface RestaurantReportsOverview {
  range: { from: string; to: string };
  reservations: {
    totalCount: number;
    statusCounts: {
      pending: number;
      confirmed: number;
      arrived: number;
      cancelled: number;
      no_show: number;
    };
    depositTotal: number;
    revenueTotal: number;
    byDay: Array<{
      date: string;      // "YYYY-MM-DD"
      reservations: number;
      deposits: number;
      revenue: number;
    }>;
  };
  orders: {
    totalCount: number;
    revenueTotal: number;
    bySource: {
      WALK_IN: number;
      QR: number;
      REZVIX: number;
      UNKNOWN: number;
    };
    countsBySource: {
      WALK_IN: number;
      QR: number;
      REZVIX: number;
      UNKNOWN: number;
    };
    byDay: Array<{
      date: string;      // "YYYY-MM-DD"
      orders: number;
      revenue: number;
    }>;
    byHour: Array<{
      hour: number;      // 0–23
      orders: number;
      revenue: number;
    }>;
    topItems: Array<{
      itemId: string | null;
      title: string;
      qty: number;
      revenue: number;
    }>;
  };
  // ✅ Delivery (paket servis) raporları — backend bu alanı eklediyse UI'da görünecek
  // Not: Optional bırakıldı; eski backend sürümleri bu alanı dönmeyebilir.
  delivery?: {
    totalCount: number;
    grossTotal: number; // müşteriden tahsil edilen toplam (komisyon dahil)
    netTotal: number;   // restorana kalan toplam (komisyon düşülmüş)

    // Durum bazlı adetler (backend hangi status isimlerini dönüyorsa ona göre dolabilir)
    statusCounts: Record<string, number>;

    byDay: Array<{
      date: string; // "YYYY-MM-DD"
      orders: number;
      gross: number;
      net: number;
    }>;

    topItems: Array<{
      itemId: string | null;
      title: string;
      qty: number;
      gross: number;
      net: number;
    }>;
  };
  tables: {
    totalSessions: number;
    closedSessions: number;
    avgSessionDurationMinutes: number;
    payments: {
      cardTotal: number;
      payAtVenueTotal: number;
      grandTotal: number;
    };
    topTables: Array<{
      tableId: string;
      sessionCount: number;
      revenueTotal: number;
    }>;
  };
}

/**
 * GET /api/panel/restaurants/:rid/reports/overview
 */
export async function restaurantGetReportsOverview(
  rid: string,
  p?: { from?: string; to?: string }
): Promise<RestaurantReportsOverview> {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/reports/overview`,
    { params: p }
  );
  return data as RestaurantReportsOverview;
}
// =========================
// ORG — Organizations (Owner Panel)
// =========================

export interface OrgMyOrganization extends AdminOrganization {
  restaurantCount?: number;
}

/**
 * GET /org/organizations
 * - Org owner / org_admin için kendi organizasyon listesi
 */
export async function orgListMyOrganizations(params?: {
  cursor?: string;
  limit?: number;
}): Promise<{ items: OrgMyOrganization[]; nextCursor?: string }> {
  const { data } = await api.get("/org/organizations", { params });

  const items: OrgMyOrganization[] = Array.isArray(data?.items)
    ? (data.items as OrgMyOrganization[])
    : Array.isArray(data)
    ? (data as OrgMyOrganization[])
    : [];

  const nextCursor =
    typeof data?.nextCursor === "string" ? data.nextCursor : undefined;

  return { items, nextCursor };
}

/**
 * (Alias) GET /org/organizations
 * - Eski kodda farklı isim kullanılmış olabilir diye, aynı endpoint'e
 *   "orgListOrganizations" adıyla da erişim sağlıyoruz.
 */
export async function orgListOrganizations(params?: {
  cursor?: string;
  limit?: number;
}): Promise<{ items: OrgMyOrganization[]; nextCursor?: string }> {
  return orgListMyOrganizations(params);
}

/**
 * GET /org/organizations/:id
 * - Org owner / org_admin için tek organizasyon detayı
 *   (restoranlar + üyeler dahil)
 */
export async function orgGetMyOrganization(
  id: string
): Promise<OrgMyOrganization & { restaurants?: any[]; members?: any[] }> {
  const { data } = await api.get(`/org/organizations/${id}`);
  return data as OrgMyOrganization & { restaurants?: any[]; members?: any[] };
}

/**
 * GET /org/organizations/:id/restaurants
 * - Org owner / org_admin için organizasyona bağlı restoran listesi
 */
export async function orgListMyOrganizationRestaurants(
  orgId: string,
  params?: { cursor?: string; limit?: number }
): Promise<{ items: any[]; nextCursor?: string }> {
  const { data } = await api.get(`/org/organizations/${orgId}/restaurants`, {
    params,
  });

  const items = Array.isArray(data?.items)
    ? (data.items as any[])
    : Array.isArray(data)
    ? (data as any[])
    : [];
  const nextCursor =
    typeof data?.nextCursor === "string" ? data.nextCursor : undefined;

  return { items, nextCursor };
}

/**
 * PATCH /org/organizations/:id
 * - Org owner / admin (ve admin) için organizasyon güncelleme
 */
export async function orgUpdateMyOrganization(
  id: string,
  input: { defaultLanguage: string }
) {
  const { data } = await api.patch(`/org/organizations/${id}`, input);
  return data;
}

/**
 * Admin ekranlarından da aynı endpoint kullanılabilir (admin rolü izinli).
 */
export async function adminUpdateOrganization(
  id: string,
  input: { defaultLanguage: string }
) {
  return orgUpdateMyOrganization(id, input);
}
// =========================
// ORG — Branch Requests
// =========================

export interface OrgBranchRequest {
  _id: string;
  organization?: {
    id: string | null;
    name?: string | null;
    region?: string | null;
  } | null;
  status: "pending" | "approved" | "rejected";
  payload: {
    name?: string;
    region?: string;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
    iban?: string | null;
    priceRange?: string;
    businessType?: string;
    openingHours?: any[];
    description?: string | null;
  };
  notes?: string | null;
  restaurant?: {
    id: string | null;
    name?: string | null;
  } | null;
  createdAt?: string;
  resolvedAt?: string | null;
  rejectReason?: string | null;
}

export async function orgListBranchRequests(params?: {
  status?: string;
  organizationId?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: OrgBranchRequest[]; nextCursor?: string }> {
  const { data } = await api.get("/org/branch-requests", { params });
  // backend zaten { items, nextCursor } dönüyor
  const items = Array.isArray(data?.items) ? data.items : [];
  const nextCursor =
    typeof data?.nextCursor === "string" ? data.nextCursor : undefined;
  return { items, nextCursor };
}

export async function orgCreateBranchRequest(input: {
  organizationId: string;
  name: string;
  region?: string;
  city?: string;
  address?: string;
  phone?: string;
  iban?: string;
  priceRange?: string;
  businessType?: string;
  description?: string;
  notes?: string;
}) {
  const payload: any = {
    organizationId: input.organizationId,
    name: input.name,
    region: input.region,
    city: input.city || undefined,
    address: input.address || undefined,
    phone: input.phone || undefined,
    iban: input.iban || undefined,
    priceRange: input.priceRange || undefined,
    businessType: input.businessType || undefined,
    description: input.description || undefined,
    notes: input.notes || undefined,
  };

  const { data } = await api.post("/org/branch-requests", payload);
  return data as {
    ok: boolean;
    request: OrgBranchRequest;
  };
}
// =========================
// ORG — Menu (Org-level master menü)
// =========================

export interface OrgMenuItem {
  _id: string;
  categoryId: string;
  title: string;
  description: string | null;
  defaultPrice: number;
  photoUrl: string | null;
  tags: string[];
  order: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrgMenuCategory {
  _id: string;
  title: string;
  description: string | null;
  order: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  items: OrgMenuItem[];
}

export interface OrgMenuResponse {
  organization: {
    _id: string;
    name: string;
    region: string | null;
  };
  categories: OrgMenuCategory[];
}

/**
 * GET /admin/organizations/:orgId/menu
 * - Org-level master menü (kategori + item birlikte)
 */
export async function orgGetMenu(orgId: string): Promise<OrgMenuResponse> {
  const { data } = await api.get(`/admin/organizations/${orgId}/menu`);
  return data as OrgMenuResponse;
}

/**
 * POST /admin/organizations/:orgId/menu/categories
 * - Yeni org kategori oluşturma
 */
export async function orgCreateMenuCategory(
  orgId: string,
  input: {
    title: string;
    description?: string;
    order?: number;
    isActive?: boolean;
  }
): Promise<{ ok: boolean; category: OrgMenuCategory }> {
  const payload: any = {
    title: input.title,
  };

  if (input.description != null && input.description !== "") {
    payload.description = input.description;
  }
  if (typeof input.order === "number") {
    payload.order = input.order;
  }
  if (typeof input.isActive === "boolean") {
    payload.isActive = input.isActive;
  }

  const { data } = await api.post(
    `/admin/organizations/${orgId}/menu/categories`,
    payload
  );
  return data as { ok: boolean; category: OrgMenuCategory };
}

/**
 * PATCH /admin/organizations/:orgId/menu/categories/:categoryId
 * - Org kategori güncelleme
 */
export async function orgUpdateMenuCategory(
  orgId: string,
  categoryId: string,
  input: {
    title?: string;
    description?: string | null;
    order?: number;
    isActive?: boolean;
  }
): Promise<{ ok: boolean; category: OrgMenuCategory }> {
  const payload: any = {};

  if (input.title != null && input.title.trim() !== "") {
    payload.title = input.title.trim();
  }
  if (input.description !== undefined) {
    if (input.description === null) {
      payload.description = "";
    } else if (
      typeof input.description === "string" &&
      input.description.trim() !== ""
    ) {
      payload.description = input.description.trim();
    }
    // else: if empty string, don't include
  }
  if (typeof input.order === "number") {
    payload.order = input.order;
  }
  if (typeof input.isActive === "boolean") {
    payload.isActive = input.isActive;
  }

  const { data } = await api.patch(
    `/admin/organizations/${orgId}/menu/categories/${categoryId}`,
    payload
  );
  return data as { ok: boolean; category: OrgMenuCategory };
}

/**
 * DELETE /admin/organizations/:orgId/menu/categories/:categoryId
 * - Org kategori soft delete (isActive=false)
 */
export async function orgDeleteMenuCategory(
  orgId: string,
  categoryId: string
): Promise<{ ok?: boolean; category: { _id: string; isActive: boolean } }> {
  const { data } = await api.delete(
    `/admin/organizations/${orgId}/menu/categories/${categoryId}`
  );
  return data as { ok?: boolean; category: { _id: string; isActive: boolean } };
}

/**
 * POST /admin/organizations/:orgId/menu/items
 * - Yeni org item oluşturma
 */
export async function orgCreateMenuItem(
  orgId: string,
  input: {
    categoryId: string;
    title: string;
    defaultPrice: number;
    description?: string;
    tags?: string[];
    order?: number;
    isActive?: boolean;
    photoFile?: File | null;
  }
): Promise<{ ok: boolean; item: OrgMenuItem }> {
  const fd = new FormData();

  fd.append("categoryId", input.categoryId);
  fd.append("title", input.title);
  fd.append("defaultPrice", String(input.defaultPrice));

  if (input.description != null) {
    fd.append("description", input.description);
  }
  if (typeof input.order === "number") {
    fd.append("order", String(input.order));
  }
  if (typeof input.isActive === "boolean") {
    fd.append("isActive", String(input.isActive));
  }
  (input.tags ?? []).forEach((t) => {
    if (t) fd.append("tags", t);
  });

  if (input.photoFile instanceof File) {
    fd.append("photo", input.photoFile);    // 🔴 backend'de upload.single("photo")
  }

  const { data } = await api.post(
    `/admin/organizations/${orgId}/menu/items`,
    fd
  );
  return data as { ok: boolean; item: OrgMenuItem };
}

/**
 * PATCH /admin/organizations/:orgId/menu/items/:itemId
 * - Org item güncelleme
 */
export async function orgUpdateMenuItem(
  orgId: string,
  itemId: string,
  input: {
    categoryId?: string;
    title?: string;
    description?: string | null;
    defaultPrice?: number;
    tags?: string[];
    order?: number;
    isActive?: boolean;
    photoFile?: File | null;
    removePhoto?: boolean;
  }
): Promise<{ ok: boolean; item: OrgMenuItem }> {
  const fd = new FormData();

  if (input.categoryId) fd.append("categoryId", input.categoryId);
  if (input.title != null) fd.append("title", input.title);
  if (input.description !== undefined)
    fd.append("description", input.description ?? "");
  if (typeof input.defaultPrice === "number")
    fd.append("defaultPrice", String(input.defaultPrice));
  if (typeof input.order === "number")
    fd.append("order", String(input.order));
  if (typeof input.isActive === "boolean")
    fd.append("isActive", String(input.isActive));

  (input.tags ?? []).forEach((t) => {
    if (t) fd.append("tags", t);
  });

  // If removePhoto is true, append photoUrl = ""
  if (input.removePhoto === true) {
    fd.append("photoUrl", "");
  }

  if (input.photoFile instanceof File) {
    fd.append("photo", input.photoFile);
  }

  // Note: The request interceptor removes Content-Type for FormData requests.
  const { data } = await api.patch(
    `/admin/organizations/${orgId}/menu/items/${itemId}`,
    fd
  );
  return data as { ok: boolean; item: OrgMenuItem };
}

/**
 * DELETE /admin/organizations/:orgId/menu/items/:itemId
 * - Org item soft delete (isActive=false)
 */
export async function orgDeleteMenuItem(
  orgId: string,
  itemId: string
): Promise<{ ok?: boolean; item: { _id: string; isActive: boolean } }> {
  const { data } = await api.delete(
    `/admin/organizations/${orgId}/menu/items/${itemId}`
  );
  return data as { ok?: boolean; item: { _id: string; isActive: boolean } };
}
// =========================
// Orders — Modifier selections (WALK_IN / QR)
// =========================

export type OrderItemModifierSelection = {
  groupId: string;
  optionId: string;
  groupTitle?: string;
  optionTitle?: string;
  price?: number;
};

// =========================
// RESTAURANT — Live Tables & Orders
// =========================

export type TableLiveStatus =
  | "empty"
  | "occupied"
  | "order_active"
  | "waiter_call"
  | "bill_request"
  | "order_ready"
  ;

export interface LiveTable {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  floor: number;
  posX: number;
  posY: number;

  hasActiveSession: boolean;
  sessionId: string | null;
  status: TableLiveStatus;
  openServiceRequests: number;
  lastOrderAt: string | null;
  totals: {
    cardTotal: number;
    payAtVenueTotal: number;
    grandTotal: number;
  };
    channel?: "WALK_IN" | "REZVIX" | "QR";

}

/**
 * GET /api/panel/restaurants/:rid/tables/live
 * - Canlı masa durumları (C seçeneği için)
 */
export async function restaurantGetLiveTables(
  rid: string
): Promise<{ tables: LiveTable[] }> {
  const { data } = await api.get(`/panel/restaurants/${rid}/tables/live`);
  return data as { tables: LiveTable[] };
}

/**
 * PATCH /api/panel/restaurants/:rid/tables/layout
 * Body: { tables: [{ id, floor?, posX?, posY? }] }
 * - Drag & drop sonrası masa konumlarını / katlarını kaydetmek için
 */
export async function restaurantUpdateTablesLayout(
  rid: string,
  tables: Array<{ id: string; floor?: number; posX?: number; posY?: number }>
): Promise<{ ok: boolean }> {
  const { data } = await api.patch(`/panel/restaurants/${rid}/tables/layout`, {
    tables,
  });
  return data as { ok: boolean };
}

/**
 * GET /api/panel/restaurants/:rid/tables/:tableKey/detail
 * - Masa detay + aktif adisyon + siparişler + açık servis istekleri
 */
export async function restaurantGetTableDetail(
  rid: string,
  tableKey: string
): Promise<{
  table: any;
  session: any | null;
  totals: any | null;
  orders: any[];
  serviceRequests: any[];
}> {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/tables/${tableKey}/detail`
  );
  return data;
}

/**
 * POST /api/panel/restaurants/:rid/tables/:tableKey/close-session
 * - Masanın açık adisyonunu kapatır
 */
export async function restaurantCloseTableSession(
  rid: string,
  tableKey: string
): Promise<{ ok: boolean; sessionId: string }> {
  const { data } = await api.post(
    `/panel/restaurants/${rid}/tables/${tableKey}/close-session`,
    {}
  );
  return data as { ok: boolean; sessionId: string };
}

/**
 * POST /api/panel/restaurants/:rid/tables/:tableKey/service/resolve
 * Body: { requestId?: string }
 * - Garson çağır / hesap iste taleplerini handled yapar
 */
export async function restaurantResolveTableService(
  rid: string,
  tableKey: string,
  body?: { requestId?: string }
): Promise<{ ok: boolean }> {
  const { data } = await api.post(
    `/panel/restaurants/${rid}/tables/${tableKey}/service/resolve`,
    body ?? {}
  );
  return data as { ok: boolean };
}

/**
 * POST /api/panel/restaurants/:rid/tables/:tableKey/order-ready
 * - Self servis için "sipariş hazır" bildirimi gönderir
 */
export async function restaurantNotifyOrderReady(
  rid: string,
  tableKey: string
): Promise<{ ok: boolean; notifiedUsers?: number; reason?: string }> {
  const { data } = await api.post(
    `/panel/restaurants/${rid}/tables/${tableKey}/order-ready`,
    {}
  );
  return data as { ok: boolean; notifiedUsers?: number; reason?: string };
}

/**
 * ✅ WALK-IN sipariş oluşturma
 * POST /api/orders/restaurants/:rid/tables/:tableKey/walk-in
 */
export async function restaurantCreateWalkInOrder(
  rid: string,
  tableKey: string,
  input: {
    guestName?: string;
    items: Array<{
      itemId: string;
      title: string;
      price: number;
      qty: number;
      note?: string;
      modifiers?: OrderItemModifierSelection[];
    }>;
  }
): Promise<{ order: any; sessionId: string; totals: any }> {
  const { data } = await api.post(
    `/orders/restaurants/${rid}/tables/${tableKey}/walk-in`,
    input
  );
  return data as { order: any; sessionId: string; totals: any };
}

/**
 * ✅ Sipariş iptal (WALK-IN / QR / Rezvix)
 * POST /api/orders/:orderId/cancel
 *
 * Not:
 * - Backend tarafında çalışan cancel endpoint'i bu path.
 * - `rid` parametresi mevcut çağrıları kırmamak için korunur; server tarafında gerekli değildir.
 */
export async function restaurantCancelOrder(
  rid: string,
  orderId: string,
  input?: { reason?: string }
): Promise<{ ok: boolean; order?: any }> {
  const { data } = await api.post(
    `/orders/${orderId}/cancel`,
    { ...(input ?? {}), restaurantId: rid }
  );
  return data as { ok: boolean; order?: any };
}

// Backward-compatible alias (some screens may import this name)
export const cancelOrder = restaurantCancelOrder;

/**
 * ✅ Mutfak fişleri (opsiyonel: todayOnly)
 * GET /api/panel/restaurants/:rid/kitchen/orders
 * - Kitchen ekranında kullanılan fiş listesini çeker.
 */
export async function restaurantGetKitchenOrders(
  rid: string,
  params?: { todayOnly?: boolean; status?: string }
): Promise<{ items: any[] }> {
  const { data } = await api.get(`/panel/restaurants/${rid}/kitchen/orders`, {
    params,
  });
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return { items };
}

/**
 * ✅ Bugünkü fiş sayısı (kitchen topbar için)
 * GET /api/panel/restaurants/:rid/kitchen/orders/today-count
 */
export async function restaurantGetTodayKitchenOrderCount(
  rid: string
): Promise<{ ok: boolean; count: number }> {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/kitchen/orders/today-count`
  );
  return data as { ok: boolean; count: number };
}
