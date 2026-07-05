import { api } from "./client";

// ---- Types ----

export interface BranchManager {
  _id: string;
  name: string;
  email: string;
  role?: string;
}

// ---- Market store managers ----

export async function listStoreManagers(
  orgId: string,
  storeId: string
): Promise<BranchManager[]> {
  const { data } = await api.get(
    `/market/org/${orgId}/branches/${storeId}/managers`
  );
  return data?.items ?? [];
}

export async function addStoreManager(
  orgId: string,
  storeId: string,
  body: { name?: string; email: string; password?: string }
): Promise<BranchManager> {
  const { data } = await api.post(
    `/market/org/${orgId}/branches/${storeId}/managers`,
    body
  );
  return data?.item;
}

export async function removeStoreManager(
  orgId: string,
  storeId: string,
  userId: string
): Promise<void> {
  await api.delete(
    `/market/org/${orgId}/branches/${storeId}/managers/${userId}`
  );
}

// ---- Restaurant managers ----

export async function listRestaurantManagers(
  orgId: string,
  rid: string
): Promise<BranchManager[]> {
  const { data } = await api.get(
    `/organizations/${orgId}/restaurants/${rid}/managers`
  );
  return data?.items ?? [];
}

export async function addRestaurantManager(
  orgId: string,
  rid: string,
  body: { name?: string; email: string; password?: string }
): Promise<BranchManager> {
  const { data } = await api.post(
    `/organizations/${orgId}/restaurants/${rid}/managers`,
    body
  );
  return data?.item;
}

export async function removeRestaurantManager(
  orgId: string,
  rid: string,
  userId: string
): Promise<void> {
  await api.delete(
    `/organizations/${orgId}/restaurants/${rid}/managers/${userId}`
  );
}
