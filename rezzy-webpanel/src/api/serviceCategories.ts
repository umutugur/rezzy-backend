import { api } from "./client";

// =========================
// ADMIN — Service Categories (Market / Delivery)
// =========================

export type ServiceSurface = "market" | "delivery";

export interface ServiceCategoryName {
  tr: string;
  en: string;
  el: string;
  ru: string;
}

export interface AdminServiceCategory {
  _id: string;
  surface: ServiceSurface;
  key: string;
  name: ServiceCategoryName;
  imageUrl: string;
  fallbackEmoji: string;
  regions: string[];
  order: number;
  isActive: boolean;
  storeCategory: string | null;
  coreCategoryId: string | null;
  keywords: string[];
}

// Body for create/update (no _id; key optional — backend slugs from name.tr if absent)
export interface ServiceCategoryInput {
  surface: ServiceSurface;
  key?: string;
  name: Partial<ServiceCategoryName> & { tr: string };
  imageUrl?: string;
  fallbackEmoji?: string;
  regions?: string[];
  order?: number;
  isActive?: boolean;
  storeCategory?: string | null;
  coreCategoryId?: string | null;
  keywords?: string[];
}

export interface AdminCoreCategory {
  _id: string;
  key: string;
  i18n: {
    tr?: { title: string };
    en?: { title: string };
    el?: { title: string };
    ru?: { title: string };
    [lang: string]: { title: string } | undefined;
  };
  businessTypes: string[];
  order: number;
  isActive: boolean;
  parentId?: string | null;
}

export interface CoreCategoryInput {
  key?: string;
  i18n: {
    tr: { title: string };
    en?: { title: string };
    el?: { title: string };
    ru?: { title: string };
  };
  businessTypes: string[];
  order?: number;
  isActive?: boolean;
  parentId?: string | null;
}

export async function adminListServiceCategories(
  surface?: ServiceSurface | ""
): Promise<{ items: AdminServiceCategory[] }> {
  const params: Record<string, string> = {};
  if (surface) params.surface = surface;
  const { data } = await api.get("/admin/service-categories", { params });
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return { items: items as AdminServiceCategory[] };
}

export async function adminCreateServiceCategory(
  body: ServiceCategoryInput
): Promise<AdminServiceCategory> {
  const { data } = await api.post("/admin/service-categories", body);
  return (data?.item ?? data) as AdminServiceCategory;
}

export async function adminUpdateServiceCategory(
  id: string,
  body: ServiceCategoryInput
): Promise<AdminServiceCategory> {
  const { data } = await api.put(`/admin/service-categories/${id}`, body);
  return (data?.item ?? data) as AdminServiceCategory;
}

export async function adminDeleteServiceCategory(
  id: string
): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/admin/service-categories/${id}`);
  return data as { ok: boolean };
}

export async function adminListCoreCategories(): Promise<{
  items: AdminCoreCategory[];
}> {
  const { data } = await api.get("/admin/core-categories");
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return { items: items as AdminCoreCategory[] };
}

export async function adminCreateCoreCategory(
  body: CoreCategoryInput
): Promise<AdminCoreCategory> {
  const { data } = await api.post("/admin/core-categories", body);
  return (data?.item ?? data) as AdminCoreCategory;
}

export async function adminUpdateCoreCategory(
  id: string,
  body: Partial<CoreCategoryInput>
): Promise<AdminCoreCategory> {
  const { data } = await api.put(`/admin/core-categories/${id}`, body);
  return (data?.item ?? data) as AdminCoreCategory;
}
