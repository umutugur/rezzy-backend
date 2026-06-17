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
  customer?: { _id?: string; name?: string; email?: string; phone?: string } | null;
  deliveryAddress?: { fullText?: string; title?: string } | null;
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
  brand?: string;
  attributes?: { label: string; value: string }[];
  netQuantity?: number | null;
  netUnit?: "L" | "ml" | "kg" | "g" | "piece" | null;
  discountPrice?: number | null;
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
    Partial<Pick<PanelProduct, "description" | "brand" | "attributes" | "netQuantity" | "netUnit" | "discountPrice">>,
): Promise<PanelProduct> {
  const { data } = await api.post("/market/panel/products", payload);
  return data;
}

export async function marketUpdateProduct(
  id: string,
  payload: Partial<Pick<PanelProduct, "title" | "price" | "unit" | "stock" | "description" | "isActive" | "brand" | "attributes" | "netQuantity" | "netUnit" | "discountPrice">>,
): Promise<PanelProduct> {
  const { data } = await api.patch(`/market/panel/products/${id}`, payload);
  return data;
}

export async function marketDeleteProduct(id: string): Promise<void> {
  await api.delete(`/market/panel/products/${id}`);
}

// ---- Market Categories (CoreCategory) ----

export interface MarketCoreCategory {
  _id: string;
  key: string;
  i18n: Record<string, { title: string }>;
  order: number;
}

export async function getMarketCategories(): Promise<{ items: MarketCoreCategory[] }> {
  const { data } = await api.get("/market/categories");
  return data as { items: MarketCoreCategory[] };
}

// ---- Market Panel Image Upload ----

export async function uploadMarketImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/market/panel/upload", form);
  return data as { url: string };
}

// ---- Product Image Suggestions ----

export interface ProductImageSuggestion {
  url: string;
  source: string;
  title: string;
  brand?: string;
}

export async function getProductImageSuggestions(params: {
  barcode?: string;
  title?: string;
  brand?: string;
  limit?: number;
}): Promise<{ items: ProductImageSuggestion[] }> {
  const { data } = await api.get("/market/panel/product-image-suggestions", { params });
  return data as { items: ProductImageSuggestion[] };
}

export interface MarketStoreSettings {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  isActive: boolean;
  address?: string;
  city?: string;
  logo?: string | null;
  photos?: string[];
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
