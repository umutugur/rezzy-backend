import { api } from "./client";
import { withStore } from "./panelStore";

export interface BranchOrgProductCategory {
  _id: string;
  key: string;
  i18n?: Record<string, { title?: string }>;
  order?: number;
  parentId?: string | null;
}

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
  category?: BranchOrgProductCategory | string | null;
  override: null | {
    price: number | null;
    discountPrice: number | null;
    isAvailable: boolean | null;
    hidden: boolean;
  };
}

export interface OrgProductCategoryCount {
  id: string | null;
  key: string | null;
  title: string | null;
  parentId: string | null;
  count: number;
}

export async function listMyOrgProductCategories() {
  const { data } = await api.get(`/market/panel/org-products/categories`, {
    params: withStore({}),
  });
  return data as {
    categories: OrgProductCategoryCount[];
    total: number;
    hiddenCount: number;
    organization: string | null;
  };
}

export async function listMyOrgProducts(params: {
  q?: string;
  category?: string | null;
  page?: number;
  limit?: number;
}) {
  const { q, category, page, limit } = params;
  const { data } = await api.get(`/market/panel/org-products`, {
    params: withStore({
      q: q || undefined,
      category: category || undefined,
      page: page || undefined,
      limit: limit || undefined,
    }),
  });
  return data as {
    items: BranchOrgProduct[];
    total: number;
    page: number;
    limit: number;
    organization: string | null;
  };
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
