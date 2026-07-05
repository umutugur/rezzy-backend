import { api } from "./client";
import { withStore } from "./panelStore";

export interface BranchOrgProduct {
  _id: string;
  orgProductId: string;
  title: string;
  barcode?: string;
  unit: string;
  price: number;
  discountPrice?: number | null;
  isAvailable: boolean;
  imageUrl?: string;
  category?: any;
  override: null | {
    price: number | null;
    discountPrice: number | null;
    isAvailable: boolean | null;
    hidden: boolean;
  };
}

export async function listMyOrgProducts(params: { q?: string }) {
  const { data } = await api.get(`/market/panel/org-products`, { params: withStore(params) });
  return data as { items: BranchOrgProduct[]; organization: string | null };
}

export async function upsertOverride(
  orgProductId: string,
  body: {
    price?: number | null;
    discountPrice?: number | null;
    isAvailable?: boolean | null;
    hidden?: boolean;
  }
) {
  const { data } = await api.put(
    `/market/panel/org-products/${orgProductId}/override`,
    withStore(body)
  );
  return data;
}
