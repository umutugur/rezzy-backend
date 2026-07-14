import { api } from "./client";

// ── Delivery orders ───────────────────────────────────────────────────────────
export async function adminGetDeliveryOrders(params?: {
  status?: string; page?: number; limit?: number;
}) {
  const { data } = await api.get("/admin/delivery/orders", { params });
  return data as { orders: any[]; total: number; page: number; pages: number };
}

// ── Taxi config ───────────────────────────────────────────────────────────────
export type VehicleType = {
  key: string;
  name: string;
  icon: string;
  capacity: number | null;
  description: string;
  order: number;
  isActive: boolean;
  base: number;
  perKm: number;
  nightBase: number | null;
  nightPerKm: number | null;
};

export type TaxiRegionConfig = {
  region: string;
  dispatchRadiusKm: number;
  commissionRate: number;
  vehicleTypes: VehicleType[];
  nightTariff: { enabled: boolean; start: string; end: string };
  petAddon: { enabled: boolean; surcharge: number };
  scheduledRide: { enabled: boolean; fee: number };
  timezone: string;
  isActive: boolean;
};

export async function adminGetTaxiConfigs(): Promise<{ configs: TaxiRegionConfig[] }> {
  const { data } = await api.get("/admin/taxi/config");
  return data as { configs: TaxiRegionConfig[] };
}

export async function adminUpsertTaxiConfig(
  region: string,
  body: Partial<Omit<TaxiRegionConfig, "region">> & { region?: string }
) {
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

// ── Market collections ──────────────────────────────────────────────────────
export type MarketCollectionKind = "manual" | "discounted";

export type MarketCollection = {
  _id: string;
  title: string;
  region: string | null;
  kind: MarketCollectionKind;
  productIds: string[];
  imageUrl: string | null;
  order: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MarketCollectionInput = {
  title: string;
  region?: string | null;
  kind: MarketCollectionKind;
  productIds?: string[];
  imageUrl?: string | null;
  order?: number;
  isActive?: boolean;
};

export async function adminListMarketCollections(): Promise<{ items: MarketCollection[] }> {
  const { data } = await api.get("/admin/market/collections");
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return { items: items as MarketCollection[] };
}

export async function adminCreateMarketCollection(body: MarketCollectionInput) {
  const { data } = await api.post("/admin/market/collections", body);
  return data as { ok: boolean; collection: MarketCollection };
}

export async function adminUpdateMarketCollection(id: string, body: Partial<MarketCollectionInput>) {
  const { data } = await api.patch(`/admin/market/collections/${id}`, body);
  return data as { ok: boolean; collection: MarketCollection };
}

export async function adminDeleteMarketCollection(id: string) {
  const { data } = await api.delete(`/admin/market/collections/${id}`);
  return data as { ok: boolean };
}

// ── Market product search (for collection product picker) ─────────────────
export async function marketSearchProducts(params: { q: string; page?: number; limit?: number }) {
  const { data } = await api.get("/market/search", { params });
  return data as { items: any[]; total: number; page: number; limit: number; brands?: any[] };
}
