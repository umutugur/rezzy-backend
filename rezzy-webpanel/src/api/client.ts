import axios from "axios";
import { authStore } from "../store/auth";
import { showToast } from "../ui/Toast";

const baseURL = import.meta.env.VITE_API_BASE || "/api";
// src/api/client.ts
function normalizeMapsUrl(raw?: string): string | undefined {
  const v = String(raw ?? "").trim();
  if (!v) return undefined;

  // Protokol ekle
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;

  // Görünür boşlukları ve parantez gibi sorun çıkaran karakterleri encode et
  // NOT: encodeURI tüm URL'yi uygun şekilde % ile kodlar ama mevcut %'leri bozmaz.
  const encoded = encodeURI(withProto);

  try {
    const u = new URL(encoded); // geçerliyse hata atmaz
    // Güvenlik: sadece http/https
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

// ---- Request interceptor: Auth + GET cache-buster (headers YOK!)
api.interceptors.request.use((config) => {
  const t = authStore.getToken();
  if (t) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${t}`;
  }

  // ✅ FormData ise JSON header'ını ezme, tarayıcı boundary koysun
  if (config.data instanceof FormData) {
    if (config.headers) {
      delete (config.headers as any)["Content-Type"];
      delete (config.headers as any)["content-type"];
    }
  }

  const method = (config.method || "get").toLowerCase();
  if (method === "get") {
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
    const msg = err?.response?.data?.message || err?.message || "İstek başarısız";
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
export async function loginWithEmail(input: { email?: string; phone?: string; password: string }) {
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
/** ADMIN — Restaurants */
// =========================
export async function adminGetRestaurant(rid: string) {
  const { data } = await api.get(`/admin/restaurants/${rid}`);
  return data;
}
export async function adminUpdateRestaurantCommission(rid: string, commissionRate: number) {
  const { data } = await api.patch(`/admin/restaurants/${rid}/commission`, { commissionRate });
  return data;
}
export async function adminListReservationsByRestaurant(
  rid: string,
  params: { from?: string; to?: string; status?: string; page?: number; limit?: number }
) {
  const { data } = await api.get(`/restaurants/${rid}/reservations`, { params });
  return data;
}

// ✅ Kullanıcı arama (owner seçimi için)
export async function adminSearchUsers(query: string): Promise<Array<{ _id: string; name?: string; email?: string; role?: string }>> {
  const { data } = await api.get("/admin/users", { params: { query, limit: 20 } });
  const items = Array.isArray(data) ? data : data?.items || [];
  return items;
}
// ✅ Admin — Create user (minimal; role backend’de default "customer")
export async function adminCreateUser(input: {
  name: string;
  email?: string;
  phone?: string;
  password?: string; // opsiyonel; boşsa backend random üretir
}) {
  const { data } = await api.post("/admin/users", input);
  return data; // { ok, user }
}
// ✅ Restoran oluştur
// utils tarafında:
// function normalizeMapsUrl(raw?: string): string { /* sende zaten var */ }

// src/api/client.ts (sadece adminCreateRestaurant kısmı)
export async function adminCreateRestaurant(input: {
  ownerId: string;
  name: string;
  region?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;

  businessType?: string; // ✅ eklendi
  categorySet?: string;  // ✅ hazır kategori seti id'si (MenuCategorySet)

  commissionRate?: number;
  depositRequired?: boolean;
  depositAmount?: number;
  checkinWindowBeforeMinutes?: number;
  checkinWindowAfterMinutes?: number;
  underattendanceThresholdPercent?: number;

  mapAddress?: string;
  placeId?: string;
  googleMapsUrl?: string;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
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

// ... aşağıdaki Users / Moderation / Restaurant tarafı / Commissions kodların tamamı senin gönderdiğin haliyle kalsın ...


// =========================
/** ADMIN — Users */
// =========================
export async function adminGetUser(uid: string) {
  const { data } = await api.get(`/admin/users/${uid}`);
  return data?.user ?? data;
}
export async function adminBanUser(
  uid: string,
  input: { reason: string; bannedUntil?: string } // ISO tarih (opsiyonel)
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

/** ✅ NEW: Admin — User Risk History */
export type RiskIncidentType = "NO_SHOW" | "LATE_CANCEL" | "UNDER_ATTEND" | "GOOD_ATTEND";
export interface AdminUserRiskIncident {
  type: RiskIncidentType;
  weight: number;
  at: string;              // ISO
  reservationId: string | null;
}
export interface AdminUserRiskSnapshot {
  riskScore: number;
  noShowCount: number;
  banned: boolean;
  bannedUntil: string | null;
  banReason: string | null;
  consecutiveGoodShows: number;
  windowDays: number; // 180
  weights: Record<"NO_SHOW" | "LATE_CANCEL" | "UNDER_ATTEND" | "GOOD_ATTEND", number>;
  multiplier: number; // 25
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
/** ADMIN — User Stats & Export */
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
/** ADMIN — Moderation */
// =========================
export async function adminListReviews(params?: { page?: number; limit?: number }) {
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

export async function adminListComplaints(params?: { page?: number; limit?: number }) {
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
/** RESTAURANT — Genel */
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

  // ✅ Region (ülke kodu) gönder
  if (typeof form.region === "string") {
    const r = form.region.trim().toUpperCase();
    if (r) {
      payload.region = r;
    }
  }

  const gm = normalizeMapsUrl(form.googleMapsUrl);
  if (gm) payload.googleMapsUrl = gm;

  if (hasCoords) {
    payload.location = { type: "Point", coordinates: [lng, lat] as [number, number] };
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
  // Dosyayı base64 Data URL'e çevir
  const asDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Backend JSON body’de fileUrl bekliyor
  const { data } = await api.post(`/restaurants/${rid}/photos`, { fileUrl: asDataUrl });
  return data;
}
export async function restaurantRemovePhoto(rid: string, url: string) {
  const { data } = await api.delete(`/restaurants/${rid}/photos`, { data: { url } });
  return data;
}

// Rezervasyon durumu (restoran tarafı)
export async function restaurantUpdateReservationStatus(
  resId: string,
  status: "confirmed" | "cancelled"
) {
  if (status === "confirmed") {
    // Backend: approve -> { ok: true, qrDataUrl } (payload burada olmayabilir)
    const { data } = await api.post(`/reservations/${resId}/approve`);
    return data; // içinde qrDataUrl var
  }
  // iptal vb. için mevcut path kalsın
  const { data } = await api.put(`/restaurants/reservations/${resId}/status`, { status });
  return data;
}

// ✅ Rezervasyon QR (JSON -> { ok, rid, mid, ts, payload, qrDataUrl })
export async function restaurantGetReservationQR(resId: string) {
  const { data } = await api.get(`/reservations/${resId}/qr`);
  // Beklenen alanlar: ok, rid, mid, ts (ISO), payload (rid/mid/UNIXsec/sig), qrDataUrl
  return data as {
    ok: boolean;
    rid: string;
    mid: string;
    ts: string;          // ISO
    payload?: string;    // ham metin: "rid/mid/tsUnix/sig"
    qrDataUrl?: string;  // data:image/png;base64,...
    // geriye dönük uyumluluk
    qrUrl?: string;
  };
}
// =========================
/** RESTAURANT — Menu Categories & Items */
// =========================
export async function restaurantListCategories(rid: string) {
  const { data } = await api.get(`/panel/restaurants/${rid}/menu/categories`);
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
  input: { title?: string; description?: string; order?: number; isActive?: boolean }
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
  // multipart (multer.single("photo"))
  const fd = new FormData();
  fd.append("categoryId", input.categoryId);
  fd.append("title", input.title);
  fd.append("description", input.description ?? "");
  fd.append("price", String(input.price ?? 0));
  fd.append("order", String(input.order ?? 0));
  fd.append("isAvailable", String(input.isAvailable ?? true));
  (input.tags ?? []).forEach((t) => fd.append("tags", t));
  if (input.photoFile) fd.append("photo", input.photoFile);

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
  if (input.isAvailable != null) fd.append("isAvailable", String(input.isAvailable));
  if (input.isActive != null) fd.append("isActive", String(input.isActive));
  if (input.removePhoto != null) fd.append("removePhoto", String(input.removePhoto));
  (input.tags ?? []).forEach((t) => fd.append("tags", t));
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
  // month: "YYYY-MM" (opsiyonel; boşsa backend içinde bulunduğun ayı alır)
  const { data } = await api.get("/admin/commissions/monthly", {
    params: month ? { month } : {}
  });
  return data as {
    ok: boolean;
    month: string;
    restaurants: Array<{
      _id: string;
      restaurantName: string;
      arrivedCount: number;
      revenueArrived: number;
      commissionRate: number;    // 0..1
      commissionAmount: number;  // revenueArrived * commissionRate
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
  return resp.data as Blob; // xlsx blob
}
export async function adminUpdateRestaurant(rid: string, payload: any) {
  const { data } = await api.put(`/restaurants/${rid}`, payload);
  return data;
}