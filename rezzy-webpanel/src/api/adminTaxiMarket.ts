import { api } from "./client";

// ── Delivery orders ───────────────────────────────────────────────────────────
export async function adminGetDeliveryOrders(params?: {
  status?: string; page?: number; limit?: number;
}) {
  const { data } = await api.get("/admin/delivery/orders", { params });
  return data as { orders: any[]; total: number; page: number; pages: number };
}

// ── Taxi config ───────────────────────────────────────────────────────────────
export type TaxiTariff = { base: number; perKm: number };
export type TaxiRegionConfig = {
  region: string;
  dispatchRadiusKm: number;
  commissionRate: number;
  tariffs: { ride: TaxiTariff; xl: TaxiTariff; lux: TaxiTariff; pet: TaxiTariff };
  isActive: boolean;
};

export async function adminGetTaxiConfigs(): Promise<{ configs: TaxiRegionConfig[] }> {
  const { data } = await api.get("/admin/taxi/config");
  return data as { configs: TaxiRegionConfig[] };
}

export async function adminUpsertTaxiConfig(region: string, body: Partial<TaxiRegionConfig>) {
  const { data } = await api.put(`/admin/taxi/config/${region}`, body);
  return data;
}

// ── Market orders ─────────────────────────────────────────────────────────────
export async function adminGetMarketOrders(params?: {
  status?: string; page?: number; limit?: number;
}) {
  const { data } = await api.get("/admin/market/orders", { params });
  return data as { orders: any[]; total: number; page: number; pages: number };
}

// ── Taxi rides ────────────────────────────────────────────────────────────────
export async function adminGetTaxiRides(params?: {
  status?: string; page?: number; limit?: number;
}) {
  const { data } = await api.get("/admin/taxi/rides", { params });
  return data as { rides: any[]; total: number; page: number; pages: number };
}

// ── Taxi drivers ──────────────────────────────────────────────────────────────
export async function adminGetTaxiDrivers(params?: {
  isApproved?: boolean; page?: number; limit?: number;
}) {
  const { data } = await api.get("/admin/taxi/drivers", { params });
  return data as { drivers: any[]; total: number; page: number; pages: number };
}

export async function adminApproveDriver(id: string) {
  const { data } = await api.patch(`/admin/taxi/drivers/${id}/approve`);
  return data;
}

export async function adminRejectDriver(id: string, reason?: string) {
  const { data } = await api.patch(`/admin/taxi/drivers/${id}/reject`, { reason });
  return data;
}
