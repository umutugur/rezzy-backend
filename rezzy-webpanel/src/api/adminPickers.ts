import { api } from "./client";
import { adminListMarketCollections } from "./adminTaxiMarket";

export interface PickerItem {
  id: string;
  label: string;
  sub?: string;
}

export async function pickMarketStores(q: string): Promise<PickerItem[]> {
  const { data } = await api.get("/admin/market/stores", { params: { q, limit: 20 } });
  return (data.items ?? []).map((s: any) => ({ id: s._id, label: s.name, sub: s.city }));
}

export async function pickMarketProducts(q: string, storeId?: string): Promise<PickerItem[]> {
  const { data } = await api.get("/admin/market/products", { params: { q, storeId, limit: 20 } });
  return (data.items ?? []).map((p: any) => ({
    id: p._id,
    label: p.title,
    sub: p.store?.name ?? p.barcode,
  }));
}

export async function pickOrganizations(q: string): Promise<PickerItem[]> {
  // adminListOrganizations normalizes array | {items} — we replicate that here to pass q/limit
  const { data } = await api.get("/admin/organizations", { params: { q, limit: 20 } });
  const items = Array.isArray(data) ? data : (data?.items ?? []);
  return items.map((o: any) => ({ id: o._id, label: o.name, sub: o.region }));
}

export async function pickUsers(q: string): Promise<PickerItem[]> {
  // adminSearchUsers uses `query` param; pass both for compatibility
  const { data } = await api.get("/admin/users", { params: { q, query: q, limit: 20 } });
  const items = Array.isArray(data) ? data : (data?.items ?? []);
  return items.map((u: any) => ({
    id: u._id,
    label: u.name ?? u.email ?? u._id,
    sub: u.email,
  }));
}

export async function pickMarketCollections(q: string): Promise<PickerItem[]> {
  const { items } = await adminListMarketCollections();
  const lower = q.toLowerCase();
  const filtered = q
    ? items.filter((c) => c.title.toLowerCase().includes(lower))
    : items;
  return filtered.map((c) => ({ id: c._id, label: c.title }));
}
