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
