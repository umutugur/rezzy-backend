import { api } from "./client";

export interface AdminRestaurantRow {
  _id: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  region?: string;
  isActive?: boolean;
}

export interface AdminRestaurantListResp {
  items: AdminRestaurantRow[];
  nextCursor: string | null;
}

export async function adminListRestaurants(params: {
  query?: string;
  city?: string;
  limit?: number;
  cursor?: string;
}): Promise<AdminRestaurantListResp> {
  const { data } = await api.get("/admin/restaurants", { params });
  // Normalise: backend returns { items, nextCursor } for cursor pagination,
  // but fall back gracefully if the response is a plain array (old format).
  if (Array.isArray(data)) {
    return { items: data as AdminRestaurantRow[], nextCursor: null };
  }
  return {
    items: Array.isArray(data?.items) ? (data.items as AdminRestaurantRow[]) : [],
    nextCursor: typeof data?.nextCursor === "string" ? data.nextCursor : null,
  };
}
