import { api } from "./client";

export interface AdminUserRow {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role: "customer" | "restaurant" | "admin";
  restaurantId?: string;
  banned?: boolean;
  banReason?: string | null;
  bannedUntil?: string | null;
  createdAt?: string;
  riskScore?: number;
  noShowCount?: number;
}

export interface AdminUserListResp {
  items: AdminUserRow[];
  nextCursor: string | null;
}

export async function adminListUsers(params: {
  query?: string;
  role?: string;
  banned?: "true" | "false";
  limit?: number;
  cursor?: string;
}): Promise<AdminUserListResp> {
  const { data } = await api.get("/admin/users", { params });
  if (Array.isArray(data)) {
    return { items: data as AdminUserRow[], nextCursor: null };
  }
  return {
    items: Array.isArray(data?.items) ? (data.items as AdminUserRow[]) : [],
    nextCursor: typeof data?.nextCursor === "string" ? data.nextCursor : null,
  };
}
