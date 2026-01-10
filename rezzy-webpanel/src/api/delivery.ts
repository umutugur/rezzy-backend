// src/api/delivery.ts
import { api } from "./client";

/**
 * Delivery domain modeli.
 * Not: Bunlar UI/flow netleşince genişler.
 */
export type DeliveryOrderStatus =
  | "created"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

export type DeliveryCourierStatus = "active" | "inactive" | "suspended";

export type DeliveryOrder = {
  _id: string;
  restaurantId: string;

  // müşteri
  customerName?: string | null;
  customerPhone?: string | null;

  // teslimat adresi
  addressLine1: string;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;

  // geo opsiyonel
  location?: { type: "Point"; coordinates: [number, number] }; // [lng, lat]

  // ücret
  currency?: string | null; // TRY/GBP vs
  deliveryFee?: number; // restoranın aldığı / müşterinin ödediği
  subtotal?: number;
  total?: number;

  status: DeliveryOrderStatus;

  courier?: {
    id: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;

  createdAt?: string;
  updatedAt?: string;
};

export type DeliveryCourier = {
  _id: string;
  name: string;
  phone?: string | null;
  status: DeliveryCourierStatus;
  vehicleType?: "bike" | "car" | "scooter" | "walk" | "unknown";
  lastSeenAt?: string | null;
};

export type DeliveryZone = {
  _id: string;
  restaurantId: string;
  name: string;
  isActive: boolean;

  // Polygon-based delivery area (GeoJSON)
  polygon?: {
    type: "Polygon";
    coordinates: [number, number][][]; // [[[lng,lat],...]]
  } | null;

  // Pricing rules per zone
  deliveryFee?: number;      // extra delivery fee
  minOrderAmount?: number;   // minimum order total

  createdAt?: string;
  updatedAt?: string;
};

// -------------------------
// Restaurant Panel — Delivery Orders
// -------------------------

/**
 * GET /panel/restaurants/:rid/delivery/orders
 */
export async function deliveryListOrders(
  rid: string,
  params?: {
    status?: DeliveryOrderStatus | "all";
    from?: string; // ISO
    to?: string;   // ISO
    cursor?: string;
    limit?: number;
    q?: string; // isim/telefon vs
  }
): Promise<{ items: DeliveryOrder[]; nextCursor?: string }> {
  const { data } = await api.get(`/panel/restaurants/${rid}/delivery/orders`, {
    params,
  });
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const nextCursor = typeof data?.nextCursor === "string" ? data.nextCursor : undefined;
  return { items, nextCursor };
}

/**
 * GET /panel/restaurants/:rid/delivery/orders/:orderId
 */
export async function deliveryGetOrder(
  rid: string,
  orderId: string
): Promise<DeliveryOrder> {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/delivery/orders/${orderId}`
  );
  return data as DeliveryOrder;
}

/**
 * PATCH /panel/restaurants/:rid/delivery/orders/:orderId/status
 */
export async function deliveryUpdateOrderStatus(
  rid: string,
  orderId: string,
  status: DeliveryOrderStatus
): Promise<{ ok: boolean; order: DeliveryOrder }> {
  const { data } = await api.patch(
    `/panel/restaurants/${rid}/delivery/orders/${orderId}/status`,
    { status }
  );
  return data as { ok: boolean; order: DeliveryOrder };
}

/**
 * POST /panel/restaurants/:rid/delivery/orders/:orderId/assign
 */
export async function deliveryAssignCourier(
  rid: string,
  orderId: string,
  courierId: string
): Promise<{ ok: boolean; order: DeliveryOrder }> {
  const { data } = await api.post(
    `/panel/restaurants/${rid}/delivery/orders/${orderId}/assign`,
    { courierId }
  );
  return data as { ok: boolean; order: DeliveryOrder };
}

/**
 * POST /panel/restaurants/:rid/delivery/orders/:orderId/unassign
 */
export async function deliveryUnassignCourier(
  rid: string,
  orderId: string
): Promise<{ ok: boolean; order: DeliveryOrder }> {
  const { data } = await api.post(
    `/panel/restaurants/${rid}/delivery/orders/${orderId}/unassign`,
    {}
  );
  return data as { ok: boolean; order: DeliveryOrder };
}

// -------------------------
// Restaurant Panel — Couriers
// -------------------------

/**
 * GET /panel/restaurants/:rid/delivery/couriers
 */
export async function deliveryListCouriers(
  rid: string,
  params?: { status?: DeliveryCourierStatus | "all"; q?: string }
): Promise<DeliveryCourier[]> {
  const { data } = await api.get(
    `/panel/restaurants/${rid}/delivery/couriers`,
    { params }
  );
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items as DeliveryCourier[];
}

/**
 * POST /panel/restaurants/:rid/delivery/couriers
 */
export async function deliveryCreateCourier(
  rid: string,
  input: { name: string; phone?: string; vehicleType?: DeliveryCourier["vehicleType"] }
): Promise<{ ok: boolean; courier: DeliveryCourier }> {
  const { data } = await api.post(
    `/panel/restaurants/${rid}/delivery/couriers`,
    input
  );
  return data as { ok: boolean; courier: DeliveryCourier };
}

/**
 * PATCH /panel/restaurants/:rid/delivery/couriers/:courierId
 */
export async function deliveryUpdateCourier(
  rid: string,
  courierId: string,
  input: Partial<Pick<DeliveryCourier, "name" | "phone" | "status" | "vehicleType">>
): Promise<{ ok: boolean; courier: DeliveryCourier }> {
  const { data } = await api.patch(
    `/panel/restaurants/${rid}/delivery/couriers/${courierId}`,
    input
  );
  return data as { ok: boolean; courier: DeliveryCourier };
}

// -------------------------
// Restaurant Panel — Delivery Zones (Polygon-based)
// -------------------------

/**
 * GET /panel/restaurants/:rid/delivery/zones
 */
export async function deliveryListZones(rid: string): Promise<DeliveryZone[]> {
  const { data } = await api.get(`/panel/restaurants/${rid}/delivery/zones`);
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items as DeliveryZone[];
}

/**
 * POST /panel/restaurants/:rid/delivery/zones
 */
export async function deliveryCreateZone(
  rid: string,
  input: {
    name: string;
    isActive?: boolean;
    polygon?: DeliveryZone["polygon"];
    deliveryFee?: number;
    minOrderAmount?: number;
  }
): Promise<{ ok: boolean; zone: DeliveryZone }> {
  const { data } = await api.post(`/panel/restaurants/${rid}/delivery/zones`, input);
  return data as { ok: boolean; zone: DeliveryZone };
}

/**
 * PATCH /panel/restaurants/:rid/delivery/zones/:zoneId
 */
export async function deliveryUpdateZone(
  rid: string,
  zoneId: string,
  input: Partial<Pick<DeliveryZone, "name" | "isActive" | "polygon" | "deliveryFee" | "minOrderAmount">>
): Promise<{ ok: boolean; zone: DeliveryZone }> {
  const { data } = await api.patch(
    `/panel/restaurants/${rid}/delivery/zones/${zoneId}`,
    input
  );
  return data as { ok: boolean; zone: DeliveryZone };
}

/**
 * PUT /panel/restaurants/:rid/delivery/zones
 * Bulk replace delivery zones (used by SettingsPage polygon editor)
 */
export async function deliveryReplaceZones(
  rid: string,
  zones: Array<{
    _id?: string;
    name: string;
    isActive?: boolean;
    polygon?: DeliveryZone["polygon"];
    deliveryFee?: number;
    minOrderAmount?: number;
  }>
): Promise<{ ok: boolean; zones: DeliveryZone[] }> {
  const { data } = await api.put(`/panel/restaurants/${rid}/delivery/zones`, {
    zones,
  });
  return data as { ok: boolean; zones: DeliveryZone[] };
}