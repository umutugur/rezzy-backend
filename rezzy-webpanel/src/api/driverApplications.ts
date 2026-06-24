import { api } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────
export type I18n = { tr?: string; en?: string; ru?: string; el?: string };

export type AppType = "driver" | "market" | "restaurant";

export type DriverDocRequirement = {
  _id: string;
  appType: AppType;
  countryCode: string;
  key: string;
  i18n: I18n;
  file: boolean;
  number: boolean;
  numberLabel: I18n;
  expiry: boolean;
  required: boolean;
  order: number;
  isActive: boolean;
};

export type DriverDocRequirementInput = {
  appType: AppType;
  countryCode: string;
  key: string;
  i18n: I18n;
  file: boolean;
  number: boolean;
  numberLabel: I18n;
  expiry: boolean;
  required: boolean;
  order: number;
  isActive: boolean;
};

export type AppDocStatus = "pending" | "verified" | "rejected";

export type AppDoc = {
  requirementKey: string;
  fileUrl: string;
  number: string;
  expiry: string | null;
  status: AppDocStatus;
  rejectReason: string | null;
};

export type DriverApplicationStatus = "draft" | "pending" | "approved" | "rejected";

export type DriverApplication = {
  _id: string;
  appType: AppType;
  user: { _id: string; name: string; email: string } | null;
  countryCode: string;
  payload: Record<string, any>;
  selfieUrl: string;
  documents: AppDoc[];
  status: DriverApplicationStatus;
  rejectReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DriverApplicationListResponse = {
  items: DriverApplication[];
  total: number;
  page: number;
  limit: number;
};

export type DriverApplicationDetailResponse = {
  application: DriverApplication;
  requirements: DriverDocRequirement[];
};

// ─── Driver Document Requirements ──────────────────────────────────────────────
export async function listDriverDocRequirements(
  appType: AppType,
  country: string
): Promise<{ items: DriverDocRequirement[] }> {
  const { data } = await api.get("/admin/driver-doc-requirements", {
    params: { appType, country },
  });
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return { items: items as DriverDocRequirement[] };
}

export async function createDriverDocRequirement(
  body: DriverDocRequirementInput
) {
  const { data } = await api.post("/admin/driver-doc-requirements", body);
  return data as { ok?: boolean; requirement?: DriverDocRequirement } | DriverDocRequirement;
}

export async function updateDriverDocRequirement(
  id: string,
  body: Partial<DriverDocRequirementInput>
) {
  const { data } = await api.put(`/admin/driver-doc-requirements/${id}`, body);
  return data as { ok?: boolean; requirement?: DriverDocRequirement } | DriverDocRequirement;
}

export async function deleteDriverDocRequirement(id: string) {
  const { data } = await api.delete(`/admin/driver-doc-requirements/${id}`);
  return data as { ok: boolean };
}

// ─── Driver Applications ───────────────────────────────────────────────────────
export async function listDriverApplications(params?: {
  appType?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<DriverApplicationListResponse> {
  const { data } = await api.get("/admin/driver-applications", { params });
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
    ? data
    : [];
  return {
    items: items as DriverApplication[],
    total: Number(data?.total ?? items.length),
    page: Number(data?.page ?? 1),
    limit: Number(data?.limit ?? items.length),
  };
}

export async function getDriverApplication(
  id: string
): Promise<DriverApplicationDetailResponse> {
  const { data } = await api.get(`/admin/driver-applications/${id}`);
  return {
    application: data?.application as DriverApplication,
    requirements: Array.isArray(data?.requirements)
      ? (data.requirements as DriverDocRequirement[])
      : [],
  };
}

export async function reviewDriverApplicationDocument(
  id: string,
  key: string,
  body: { status: "verified" | "rejected"; rejectReason?: string }
) {
  const { data } = await api.patch(
    `/admin/driver-applications/${id}/documents/${encodeURIComponent(key)}`,
    body
  );
  return data;
}

export async function approveDriverApplication(id: string) {
  const { data } = await api.patch(`/admin/driver-applications/${id}/approve`);
  return data;
}

export async function rejectDriverApplication(id: string, reason: string) {
  const { data } = await api.patch(`/admin/driver-applications/${id}/reject`, {
    reason,
  });
  return data;
}
