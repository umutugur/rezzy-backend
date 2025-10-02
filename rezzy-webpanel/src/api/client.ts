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
/** ADMIN — Restaurants (kullanıyorsan kalsın) */
// =========================
export async function adminGetRestaurant(rid: string) {
  const { data } = await api.get(`/admin/restaurants/${rid}`);
  return data;
}
export async function adminUpdateRestaurantCommission(rid: string, commissionPct: number) {
  const { data } = await api.patch(`/admin/restaurants/${rid}/commission`, {
    commissionPct,
    commission: commissionPct
  });
  return data;
}
export async function adminListReservationsByRestaurant(
  rid: string,
  params: { from?: string; to?: string; status?: string; page?: number; limit?: number }
) {
  const { data } = await api.get(`/restaurants/${rid}/reservations`, { params });
  return data;
}

// =========================
/** ADMIN — Users (UserDetail sayfası için) */
// =========================
export async function adminGetUser(uid: string) {
  const { data } = await api.get(`/admin/users/${uid}`);
  return data;
}
export async function adminBanUser(uid: string) {
  const { data } = await api.post(`/admin/users/${uid}/ban`);
  return data;
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

// =========================
/** ADMIN — Moderation (Moderation sayfası için) */
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
export async function restaurantUpdateProfile(rid: string, patch: any) {
  const { data } = await api.put(`/restaurants/${rid}`, patch);
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
  const { data } = await api.put(`/restaurants/reservations/${resId}/status`, { status });
  return data;
}

// Rezervasyon QR (JSON -> { qrUrl, payload? })
export async function restaurantGetReservationQR(resId: string) {
  const { data } = await api.get(`/restaurants/reservations/${resId}/qr`);
  // data.qrUrl: data:image/png;base64,... şeklinde
  return data as { qrUrl: string; payload?: string };
}
