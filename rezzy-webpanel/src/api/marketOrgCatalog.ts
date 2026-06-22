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
  overrideCount?: number;
}

export interface ProductOverrideRow {
  storeId: string;
  storeName: string;
  city: string | null;
  price: number | null;
  discountPrice: number | null;
  isAvailable: boolean | null;
  hidden: boolean;
}

export async function getProductOverrides(orgId: string, productId: string) {
  const { data } = await api.get(`/market/org/${orgId}/products/${productId}/overrides`);
  return data as { items: ProductOverrideRow[]; total: number };
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

export async function bulkImportProducts(
  orgId: string,
  rows: Array<{
    title: string;
    category: string;
    barcode?: string;
    unit?: string;
    defaultPrice?: number;
    defaultDiscountPrice?: number;
  }>
) {
  const { data } = await api.post(`/market/org/${orgId}/products/bulk-import`, { rows });
  return data as { created: number; updated: number; errors: { row: number; message: string }[] };
}

export async function bulkUpdateProducts(
  orgId: string,
  body: {
    productIds?: string[];
    category?: string;
    op: "price" | "active";
    value: any;
  }
) {
  const { data } = await api.post(`/market/org/${orgId}/products/bulk-update`, body);
  return data as { matched: number; modified: number };
}

export async function exportProductsCsv(orgId: string): Promise<void> {
  const res = await api.get(`/market/org/${orgId}/products/export`, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "katalog.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
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

// ─── Chain / Org Profile ──────────────────────────────────────────────────────

export interface OrgProfileData {
  _id: string;
  name: string;
  logoUrl?: string;
  coverUrl?: string;
  region?: string;
  defaultLanguage?: string;
  description?: string;
  legalName?: string;
  restaurants?: any[];
  members?: any[];
}

export async function getOrgProfile(orgId: string): Promise<OrgProfileData> {
  const { data } = await api.get(`/org/organizations/${orgId}`);
  return data as OrgProfileData;
}

export async function updateOrgProfile(
  orgId: string,
  body: { name?: string; logoUrl?: string; coverUrl?: string; region?: string; defaultLanguage?: string; description?: string }
): Promise<{ ok: boolean; organization: OrgProfileData }> {
  const { data } = await api.patch(`/org/organizations/${orgId}`, body);
  return data;
}
