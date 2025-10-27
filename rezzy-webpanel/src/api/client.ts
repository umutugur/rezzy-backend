import axios from "axios";
import { authStore } from "../store/auth";
import { showToast } from "../ui/Toast";

const baseURL = import.meta.env.VITE_API_BASE || "/api";

export const api = axios.create({
  baseURL,
  withCredentials: false,
  headers: { "Content-Type": "application/json" }
});

// ---- Request interceptor: Auth + GET cache-buster (headers YOK!)
api.interceptors.request.use((config) => {
  const t = authStore.getToken();
  if (t) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${t}`;
  }

  const method = (config.method || "get").toLowerCase();
  if (method === "get") {
    // Sadece query param ile cache kır; CORS preflight tetiklemez
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
export async function adminCreateRestaurant(input: {
  ownerId: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  commissionRate?: number; // yüzde verilebilir; backend normalize eder
  depositRequired?: boolean;
  depositAmount?: number;
  checkinWindowBeforeMinutes?: number;
  checkinWindowAfterMinutes?: number;
  underattendanceThresholdPercent?: number;
}) {
  const { data } = await api.post("/admin/restaurants", input);
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
  const payload = {
    name: form.name ?? "",
    email: form.email ?? "",
    phone: form.phone ?? "",
    city: form.city ?? "",
    address: form.address ?? "",
    description: form.description ?? "",
    iban: form.iban ?? "",
    ibanName: form.ibanName ?? "",
    bankName: form.bankName ?? "",
    priceRange: form.priceRange ?? "₺₺", // 👈 yeni eklendi
  };

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