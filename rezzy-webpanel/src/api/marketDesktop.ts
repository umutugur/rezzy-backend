import { api } from "./client";

// ---- Types ----

export type MarketOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export interface MarketOrderItem {
  productId: string;
  title: string;
  qty: number;
  price: number;
  lineTotal: number;
}

export interface MarketOrder {
  _id: string;
  status: MarketOrderStatus;
  type: "delivery" | "pickup";
  items: MarketOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  note?: string;
  paymentMethod: string;
  createdAt: string;
}

export interface PanelProduct {
  _id: string;
  title: string;
  description?: string;
  price: number;
  unit: string;
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- API functions ----

export async function marketGetOrders(params?: {
  status?: MarketOrderStatus;
  page?: number;
  limit?: number;
}): Promise<{ items: MarketOrder[]; total: number; page: number }> {
  const { data } = await api.get("/market/panel/orders", { params });
  return data;
}

export async function marketUpdateOrderStatus(
  id: string,
  status: MarketOrderStatus,
): Promise<MarketOrder> {
  const { data } = await api.patch(`/market/orders/${id}/status`, { status });
  return data.order ?? data;
}

export async function marketGetProducts(params?: {
  page?: number;
  limit?: number;
}): Promise<{ items: PanelProduct[]; total: number }> {
  const { data } = await api.get("/market/panel/products", { params });
  return data;
}

export async function marketCreateProduct(
  payload: Pick<PanelProduct, "title" | "price" | "unit" | "stock"> &
    Partial<Pick<PanelProduct, "description">>,
): Promise<PanelProduct> {
  const { data } = await api.post("/market/panel/products", payload);
  return data;
}

export async function marketUpdateProduct(
  id: string,
  payload: Partial<Pick<PanelProduct, "title" | "price" | "unit" | "stock" | "description" | "isActive">>,
): Promise<PanelProduct> {
  const { data } = await api.patch(`/market/panel/products/${id}`, payload);
  return data;
}

export async function marketDeleteProduct(id: string): Promise<void> {
  await api.delete(`/market/panel/products/${id}`);
}
