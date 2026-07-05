import { api } from "./client";
import { withStore } from "./panelStore";

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

export interface MarketEligibleCampaign {
  campaign: Campaign;
  joined: boolean;
}

export interface MarketStatement {
  store: { id: string; name: string };
  gross: number;
  commission: number;
  businessContribution: number;
  platformContribution: number;
  netEntitlement: number;
  count: number;
}

// ---- API functions ----

export async function listEligible(): Promise<MarketEligibleCampaign[]> {
  const { data } = await api.get("/market/panel/campaigns", { params: withStore() });
  return (data?.items ?? []) as MarketEligibleCampaign[];
}

export async function join(campaignId: string): Promise<{ ok: boolean; joined: boolean }> {
  const { data } = await api.post(`/market/panel/campaigns/${campaignId}/join`, withStore());
  return data as { ok: boolean; joined: boolean };
}

export async function leave(campaignId: string): Promise<{ ok: boolean; joined: boolean }> {
  const { data } = await api.post(`/market/panel/campaigns/${campaignId}/leave`, withStore());
  return data as { ok: boolean; joined: boolean };
}

export async function getStatement(params: { from?: string; to?: string }): Promise<MarketStatement> {
  const { data } = await api.get("/market/panel/promo-statement", { params: withStore(params) });
  return data as MarketStatement;
}
