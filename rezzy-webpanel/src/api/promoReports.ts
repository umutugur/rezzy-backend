// src/api/promoReports.ts
import { api } from "./client";

export interface PromoReportParams {
  from?: string;
  to?: string;
  surface?: string;
  region?: string;
  campaignId?: string;
  storeId?: string;
}

export interface PromoReportTotals {
  gross: number;
  discount: number;
  platformContribution: number;
  businessContribution: number;
  commission: number;
  count: number;
  net: number; // commission - platformContribution (can be negative = loss)
}

export interface PromoReportByCampaign {
  campaignId: string;
  title: string;
  commission: number;
  platformContribution: number;
  net: number;
  count: number;
}

export interface PromoReportByStore {
  storeId: string;
  name: string;
  gross: number;
  commission: number;
  businessContribution: number;
  platformContribution: number;
  count: number;
}

export interface PromoReportResponse {
  totals: PromoReportTotals;
  byCampaign: PromoReportByCampaign[];
  byStore: PromoReportByStore[];
}

export interface PromoSettlementBusiness {
  storeId: string;
  name: string;
  gross: number;
  commission: number;
  businessContribution: number;
  platformContribution: number;
  entitlement: number; // gross - commission - businessContribution
}

export interface PromoSettlementDriver {
  _id: string;
  driverEarning: number;
  cashShortfall: number;
  rides: number;
}

export interface PromoSettlementResponse {
  businesses: PromoSettlementBusiness[];
  drivers: PromoSettlementDriver[];
}

/**
 * GET /admin/promotions/report
 * - Kampanya kâr/zarar raporu (totals + byCampaign + byStore)
 */
export async function getReport(
  params: PromoReportParams
): Promise<PromoReportResponse> {
  const { data } = await api.get("/admin/promotions/report", { params });
  return data as PromoReportResponse;
}

/**
 * GET /admin/promotions/settlement
 * - Mutabakat raporu (businesses + drivers)
 */
export async function getSettlement(
  params: PromoReportParams
): Promise<PromoSettlementResponse> {
  const { data } = await api.get("/admin/promotions/settlement", { params });
  return data as PromoSettlementResponse;
}
