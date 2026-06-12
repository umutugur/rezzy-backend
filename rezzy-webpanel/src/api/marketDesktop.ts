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
  cancelReason?: string | null;
  cancelledBy?: string | null;
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
  reason?: string,
): Promise<MarketOrder> {
  const { data } = await api.patch(`/market/panel/orders/${id}/status`, { status, ...(reason ? { reason } : {}) });
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

export interface MarketStoreSettings {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  address?: string;
  city?: string;
  location?: { type: string; coordinates: [number, number] };
  workingHours?: { open: string; close: string; days: number[] };
  deliveryFee?: number;
  minOrderAmount?: number;
  freeDeliveryThreshold?: number | null;
  deliveryZoneKm?: number;
  gridSettings?: { cellSizeMeters: number; radiusMeters: number; orientation: "flat" | "pointy" };
  deliveryZones?: Array<{
    id: string;
    name?: string;
    isActive: boolean;
    minOrderAmount: number;
    feeAmount: number;
    freeDeliveryThreshold?: number | null;
  }>;
}

export async function marketGetMyStore(): Promise<MarketStoreSettings> {
  const { data } = await api.get("/market/panel/store");
  return data;
}

export async function marketUpdateMyStore(
  payload: Partial<MarketStoreSettings>,
): Promise<MarketStoreSettings> {
  const { data } = await api.patch("/market/panel/store", payload);
  return data;
}
