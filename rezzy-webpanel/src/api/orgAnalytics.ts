import { api } from "./client";

export type OrgSummaryDto = {
  range: { start: string; end: string };
  totals: {
    salesTotal: number;
    ordersCount: number;

    reservationsCount: number;
    noShowCount: number;
    cancelledCount: number;

    depositPaidTotal: number;
    depositPaidCount: number;
  };
};

export type TimeseriesPoint = { t: string; value: number };
export type OrgTimeseriesDto = {
  range: { start: string; end: string; tz: string };
  bucket: string;
  metric: string;
  points: TimeseriesPoint[];
};

export type TopRestaurantRow = {
  restaurantId: string;
  restaurantName: string;
  value: number;
};

export async function orgGetSummary(orgId: string, params?: any) {
  const { data } = await api.get<OrgSummaryDto>(`/org-analytics/organizations/${orgId}/summary`, { params });
  return data;
}

export async function orgGetTimeseries(orgId: string, params?: any) {
  const { data } = await api.get<OrgTimeseriesDto>(`/org-analytics/organizations/${orgId}/timeseries`, { params });
  return data;
}

export async function orgGetTopRestaurants(orgId: string, params?: any) {
  const { data } = await api.get<{ rows: TopRestaurantRow[] }>(
    `/org-analytics/organizations/${orgId}/top-restaurants`,
    { params }
  );
  return data;
}

export async function orgGetRestaurantSummary(restaurantId: string, params?: any) {
  const { data } = await api.get<OrgSummaryDto>(`/org-analytics/restaurants/${restaurantId}/summary`, { params });
  return data;
}