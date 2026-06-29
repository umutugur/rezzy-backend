import { api } from "./client";

// ---- Types ----

export type CampaignDiscountKind = "percent" | "fixed" | "free_delivery" | "fixed_price";

export interface CampaignDiscount {
  kind: CampaignDiscountKind;
  value?: number;
  maxDiscount?: number | null;
}

export interface CampaignConditions {
  minSubtotal?: number;
  scope?: string;
  [key: string]: unknown;
}

export interface Campaign {
  _id: string;
  title: string;
  description?: string;
  image?: string | null;
  discount: CampaignDiscount;
  conditions?: CampaignConditions;
  validFrom?: string | null;
  validTo?: string | null;
  funding?: { platformSharePct?: number };
  usageLimit?: number | null;
  budget?: number | null;
}

export interface RestaurantEligibleCampaign {
  campaign: Campaign;
  joined: boolean;
}

// ---- API functions ----

export async function listEligible(rid: string): Promise<RestaurantEligibleCampaign[]> {
  const { data } = await api.get(`/panel/restaurants/${rid}/campaigns`);
  return (data?.items ?? []) as RestaurantEligibleCampaign[];
}

export async function join(
  rid: string,
  campaignId: string
): Promise<{ ok: boolean; joined: boolean }> {
  const { data } = await api.post(`/panel/restaurants/${rid}/campaigns/${campaignId}/join`);
  return data as { ok: boolean; joined: boolean };
}

export async function leave(
  rid: string,
  campaignId: string
): Promise<{ ok: boolean; joined: boolean }> {
  const { data } = await api.post(`/panel/restaurants/${rid}/campaigns/${campaignId}/leave`);
  return data as { ok: boolean; joined: boolean };
}
