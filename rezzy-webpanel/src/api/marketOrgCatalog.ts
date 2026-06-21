import { api } from "./client";

export interface OrgProduct {
  _id: string;
  title: string;
  description?: string;
  barcode?: string;
  unit: "kg" | "piece" | "litre" | "pack";
  defaultPrice: number;
  defaultDiscountPrice?: number | null;
  imageUrl?: string;
  order?: number;
  isActive?: boolean;
  category: any;
}

export async function listOrgProducts(
  orgId: string,
  params: { q?: string; category?: string; page?: number; limit?: number },
) {
  const { data } = await api.get(`/market/org/${orgId}/products`, { params });
  return data as { items: OrgProduct[]; total: number; page: number; limit: number };
}

export async function createOrgProduct(orgId: string, body: Partial<OrgProduct>) {
  const { data } = await api.post(`/market/org/${orgId}/products`, body);
  return data;
}

export async function updateOrgProduct(orgId: string, id: string, body: Partial<OrgProduct>) {
  const { data } = await api.patch(`/market/org/${orgId}/products/${id}`, body);
  return data;
}

export async function deleteOrgProduct(orgId: string, id: string) {
  const { data } = await api.delete(`/market/org/${orgId}/products/${id}`);
  return data;
}

export async function listOrgBranches(orgId: string) {
  const { data } = await api.get(`/market/org/${orgId}/branches`);
  return data as { items: Array<{ _id: string; name: string; city?: string; isActive?: boolean }> };
}

export interface OrgBranchDetail {
  store: {
    _id: string;
    name: string;
    city?: string;
    isActive?: boolean;
    pickupEnabled?: boolean;
    workingHours?: { open: string; close: string; days?: number[] };
    deliveryZoneKm?: number;
    minOrderAmount?: number;
    deliveryFee?: number;
    freeDeliveryThreshold?: number | null;
  };
  stats: {
    orders: number;
    delivered: number;
    revenue: number;
    productCount: number;
    overrideCount: number;
  };
  overriddenProducts: Array<{
    orgProductId: string;
    title: string;
    defaultPrice: number;
    price: number;
    discountPrice?: number | null;
    isAvailable?: boolean;
    hidden?: boolean;
  }>;
}

export async function getOrgBranch(orgId: string, storeId: string) {
  const { data } = await api.get(`/market/org/${orgId}/branches/${storeId}`);
  return data as OrgBranchDetail;
}

export async function updateOrgBranch(orgId: string, storeId: string, body: Record<string, unknown>) {
  const { data } = await api.patch(`/market/org/${orgId}/branches/${storeId}`, body);
  return data;
}

export interface OrgReport {
  range: { from: string; to: string };
  kpis: { revenue: number; orders: number; delivered: number; avgBasket: number };
  timeseries: { date: string; revenue: number; orders: number }[];
  byStatus: { status: string; count: number }[];
  byPayment: { method: string; count: number; revenue: number }[];
  perBranch: { storeId: string; name: string; orders: number; revenue: number }[];
  topProducts: { title: string; qty: number; revenue: number }[];
}

export async function orgReports(orgId: string, from?: string, to?: string) {
  const { data } = await api.get(`/market/org/${orgId}/reports`, { params: { from, to } });
  return data as OrgReport;
}
