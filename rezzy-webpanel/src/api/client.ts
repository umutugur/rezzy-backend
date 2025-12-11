import axios from "axios";
import { authStore } from "../store/auth";
import { showToast } from "../ui/Toast";

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

  // ✅ _ts sadece panel DIŞI GET’lerde
  if (method === "get" && !url.includes("/panel/")) {
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
    const msg =
      err?.response?.data?.message ||
      err?.message ||
      "İstek başarısız";
    if (err?.response?.status === 401) {
      authStore.logout();
    }
    showToast(msg, "error");
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
  return data as { token: string; user: any };
}

export async function fetchMe() {
  const { data } = await api.get("/auth/me");
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
// RESTAURANT — Genel
// =========================
export async function restaurantGet(rid: string) {
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
// RESTAURANT — Menu Categories & Items
// =========================
export async function restaurantListCategories(rid: string) {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/menu/categories`
  );
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
  params?: { categoryId?: string }
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

export async function adminUpdateRestaurant(rid: string, payload: any) {
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
    payload.description = input.description || "";
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
    photoUrl?: string;
    tags?: string[];
    order?: number;
    isActive?: boolean;
  }
): Promise<{ ok: boolean; item: OrgMenuItem }> {
  const payload: any = {
    categoryId: input.categoryId,
    title: input.title,
    defaultPrice: input.defaultPrice,
  };

  if (input.description != null && input.description !== "") {
    payload.description = input.description;
  }
  if (input.photoUrl != null && input.photoUrl !== "") {
    payload.photoUrl = input.photoUrl;
  }
  if (Array.isArray(input.tags)) {
    payload.tags = input.tags;
  }
  if (typeof input.order === "number") {
    payload.order = input.order;
  }
  if (typeof input.isActive === "boolean") {
    payload.isActive = input.isActive;
  }

  const { data } = await api.post(
    `/admin/organizations/${orgId}/menu/items`,
    payload
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
    photoUrl?: string | null;
    tags?: string[];
    order?: number;
    isActive?: boolean;
  }
): Promise<{ ok: boolean; item: OrgMenuItem }> {
  const payload: any = {};

  if (input.categoryId) {
    payload.categoryId = input.categoryId;
  }
  if (input.title != null && input.title.trim() !== "") {
    payload.title = input.title.trim();
  }
  if (input.description !== undefined) {
    payload.description = input.description || "";
  }
  if (typeof input.defaultPrice === "number") {
    payload.defaultPrice = input.defaultPrice;
  }
  if (input.photoUrl !== undefined) {
    payload.photoUrl = input.photoUrl || "";
  }
  if (input.tags !== undefined) {
    payload.tags = Array.isArray(input.tags) ? input.tags : [];
  }
  if (typeof input.order === "number") {
    payload.order = input.order;
  }
  if (typeof input.isActive === "boolean") {
    payload.isActive = input.isActive;
  }

  const { data } = await api.patch(
    `/admin/organizations/${orgId}/menu/items/${itemId}`,
    payload
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
    }>;
  }
): Promise<{ order: any; sessionId: string; totals: any }> {
  const { data } = await api.post(
    `/orders/restaurants/${rid}/tables/${tableKey}/walk-in`,
    input
  );
  return data as { order: any; sessionId: string; totals: any };
}