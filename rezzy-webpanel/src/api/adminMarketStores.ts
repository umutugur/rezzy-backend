import { api } from "./client";

export interface AdminMarketStoreRow {
  _id: string;
  name: string;
  city?: string;
  category: string;
  isActive: boolean;
  organization?: { _id: string; name: string } | null;
  rating?: number;
  totalOrders?: number;
}

export interface AdminMarketStoreListResp {
  items: AdminMarketStoreRow[];
  total: number;
  page: number;
  limit: number;
}

export async function adminListMarketStores(params: {
  q?: string;
  city?: string;
  isActive?: string;
  organization?: string;
  page?: number;
  limit?: number;
}): Promise<AdminMarketStoreListResp> {
  const { data } = await api.get("/admin/market/stores", { params });
  return data;
}

export async function adminGetMarketStore(id: string) {
  const { data } = await api.get(`/admin/market/stores/${id}`);
  return data;
}

export async function adminUpdateMarketStore(id: string, body: any) {
  const { data } = await api.patch(`/admin/market/stores/${id}`, body);
  return data;
}

export async function adminCreateMarketStore(body: any) {
  const { data } = await api.post("/admin/market/stores", body);
  return data;
}
