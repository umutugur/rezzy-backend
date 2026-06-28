import { api } from "./client";

// =========================
// ADMIN — Campaigns
// =========================

export type CampaignSurface = "market" | "restaurant" | "taxi";
export type CampaignRegion = "TR" | "CY" | "UK";
export type CampaignDiscountKind =
  | "percent"
  | "fixed"
  | "free_delivery"
  | "fixed_price";
export type CampaignScope = "platform" | "category" | "store" | "chain";
export type CampaignAudienceKind = "public" | "targeted";
export type CampaignTrigger = "first_order" | "win_back";
export type CampaignBudgetBasis = "platform" | "discount";
export type CampaignPaymentMethod = "all" | "cash" | "card" | "online";

export interface CampaignDiscount {
  kind: CampaignDiscountKind;
  value: number;
  maxDiscount: number | null;
}

export interface CampaignConditions {
  minSubtotal: number;
  scope: CampaignScope;
  categoryKeys: string[];
  storeIds: string[];
  organizationId: string | null;
  paymentMethods: CampaignPaymentMethod[];
}

export interface CampaignAudience {
  kind: CampaignAudienceKind;
  trigger: CampaignTrigger | null;
  winBackDays: number | null;
  collectible: boolean;
}

export interface CampaignFunding {
  platformSharePct: number; // 0-100
}

export interface CampaignUsageLimit {
  perUser: number;
  total: number | null;
  showRemaining: boolean;
}

export interface CampaignBudget {
  cap: number | null;
  basis: CampaignBudgetBasis;
  spent?: number; // system-maintained — do NOT send on create/update
}

export interface Campaign {
  _id: string;
  title: string;
  description: string;
  image: string;
  surface: CampaignSurface;
  region: CampaignRegion;
  discount: CampaignDiscount;
  conditions: CampaignConditions;
  audience: CampaignAudience;
  funding: CampaignFunding;
  requiresOptIn: boolean;
  usageLimit: CampaignUsageLimit;
  budget: CampaignBudget;
  validFrom: string; // ISO
  validTo: string; // ISO
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Body for create/update (no _id / budget.spent / timestamps)
export interface CampaignInput {
  title: string;
  description: string;
  image: string;
  surface: CampaignSurface;
  region: CampaignRegion;
  discount: CampaignDiscount;
  conditions: CampaignConditions;
  audience: CampaignAudience;
  funding: CampaignFunding;
  requiresOptIn: boolean;
  usageLimit: CampaignUsageLimit;
  budget: { cap: number | null; basis: CampaignBudgetBasis };
  validFrom: string; // ISO
  validTo: string; // ISO
  isActive: boolean;
}

export interface CampaignParticipation {
  _id: string;
  campaignId?: string;
  storeId?: string | null;
  restaurantId?: string | null;
  organizationId?: string | null;
  name?: string | null;
  status?: string | null;
  optInAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export async function listCampaigns(params?: {
  surface?: CampaignSurface | "";
  region?: CampaignRegion | "";
  isActive?: "true" | "false" | "";
}): Promise<{ items: Campaign[] }> {
  const cleaned: Record<string, string> = {};
  if (params?.surface) cleaned.surface = params.surface;
  if (params?.region) cleaned.region = params.region;
  if (params?.isActive) cleaned.isActive = params.isActive;
  const { data } = await api.get("/admin/campaigns", { params: cleaned });
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return { items: items as Campaign[] };
}

export async function getCampaign(id: string): Promise<Campaign> {
  const { data } = await api.get(`/admin/campaigns/${id}`);
  return (data?.item ?? data) as Campaign;
}

export async function createCampaign(body: CampaignInput): Promise<Campaign> {
  const { data } = await api.post("/admin/campaigns", body);
  return (data?.item ?? data) as Campaign;
}

export async function updateCampaign(
  id: string,
  body: CampaignInput
): Promise<Campaign> {
  const { data } = await api.put(`/admin/campaigns/${id}`, body);
  return (data?.item ?? data) as Campaign;
}

export async function deleteCampaign(id: string): Promise<{ ok: boolean }> {
  const { data } = await api.delete(`/admin/campaigns/${id}`);
  return data as { ok: boolean };
}

export async function listParticipations(
  id: string
): Promise<{ items: CampaignParticipation[] }> {
  const { data } = await api.get(`/admin/campaigns/${id}/participations`);
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return { items: items as CampaignParticipation[] };
}

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const { data } = await api.post("/uploads", fd);
  return String(data?.url ?? "");
}
