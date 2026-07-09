import { api } from "./client";

export type CampaignDiscountKind = "percent" | "fixed" | "free_delivery" | "fixed_price";

export interface OrgCampaign {
  _id: string;
  title: string;
  description?: string;
  image?: string;
  currency?: string;
  discount: {
    kind: CampaignDiscountKind;
    value: number;
    maxDiscount?: number | null;
  };
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

export interface OrgCampaignBranch {
  storeId: string;
  name: string;
  joined: boolean;
}

export interface OrgCampaignItem {
  campaign: OrgCampaign;
  branches: OrgCampaignBranch[];
}

export async function listOrgCampaigns(orgId: string) {
  const { data } = await api.get(`/market/org/${orgId}/campaigns`);
  return data as { items: OrgCampaignItem[] };
}

export async function joinOrgCampaign(orgId: string, campaignId: string, storeIds?: string[]) {
  const { data } = await api.post(`/market/org/${orgId}/campaigns/${campaignId}/join`, storeIds ? { storeIds } : {});
  return data as { ok: boolean; joined: number };
}

export async function leaveOrgCampaign(orgId: string, campaignId: string, storeIds?: string[]) {
  const { data } = await api.post(`/market/org/${orgId}/campaigns/${campaignId}/leave`, storeIds ? { storeIds } : {});
  return data as { ok: boolean; left: number };
}
