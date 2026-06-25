import { api } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────
export type VehicleMake = {
  _id: string;
  countryCode: string;
  name: string;
  order: number;
  isActive: boolean;
};

export type VehicleModel = {
  _id: string;
  countryCode: string;
  make: string;
  name: string;
  order: number;
  isActive: boolean;
};

// ─── Vehicle Makes ─────────────────────────────────────────────────────────────
export async function listMakes(country: string): Promise<{ items: VehicleMake[] }> {
  const { data } = await api.get("/admin/vehicle-makes", {
    params: { country },
  });
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return { items: items as VehicleMake[] };
}

export async function createMake(body: {
  countryCode: string;
  name: string;
  order?: number;
}): Promise<VehicleMake> {
  const { data } = await api.post("/admin/vehicle-makes", body);
  return data.item as VehicleMake;
}

export async function updateMake(
  id: string,
  body: { name?: string; order?: number; isActive?: boolean }
): Promise<VehicleMake> {
  const { data } = await api.put(`/admin/vehicle-makes/${id}`, body);
  return data.item as VehicleMake;
}

export async function deleteMake(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/admin/vehicle-makes/${id}`);
  return data as { ok: boolean };
}

// ─── Vehicle Models ────────────────────────────────────────────────────────────
export async function listModels(
  country: string,
  make: string
): Promise<{ items: VehicleModel[] }> {
  const { data } = await api.get("/admin/vehicle-models", {
    params: { country, make },
  });
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return { items: items as VehicleModel[] };
}

export async function createModel(body: {
  countryCode: string;
  make: string;
  name: string;
  order?: number;
}): Promise<VehicleModel> {
  const { data } = await api.post("/admin/vehicle-models", body);
  return data.item as VehicleModel;
}

export async function updateModel(
  id: string,
  body: { name?: string; order?: number; isActive?: boolean }
): Promise<VehicleModel> {
  const { data } = await api.put(`/admin/vehicle-models/${id}`, body);
  return data.item as VehicleModel;
}

export async function deleteModel(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/admin/vehicle-models/${id}`);
  return data as { ok: boolean };
}
