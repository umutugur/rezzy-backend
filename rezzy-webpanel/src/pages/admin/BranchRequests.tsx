import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminListBranchRequests,
  adminApproveBranchRequest,
  adminRejectBranchRequest,
  type AdminBranchRequest,
  type AdminBranchRequestType,
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

type StatusFilter = "pending" | "approved" | "rejected" | "all";
type TypeFilter = "all" | "restaurant" | "market";

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AdminBranchRequest["status"] }) {
  const { t } = useI18n();
  const map = {
    approved: {
      bg: "rgba(22,163,74,0.10)",
      color: "var(--rezvix-success, #16a34a)",
      border: "1px solid rgba(22,163,74,0.25)",
      label: t("Onaylandı"),
    },
    rejected: {
      bg: "rgba(220,38,38,0.10)",
      color: "var(--rezvix-danger, #dc2626)",
      border: "1px solid rgba(220,38,38,0.25)",
      label: t("Reddedildi"),
    },
    pending: {
      bg: "rgba(245,158,11,0.12)",
      color: "var(--rezvix-warning, #f59e0b)",
      border: "1px solid rgba(245,158,11,0.30)",
      label: t("Beklemede"),
    },
  }[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: map.bg,
        color: map.color,
        border: map.border,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: map.color,
          flexShrink: 0,
        }}
      />
      {map.label}
    </span>
  );
}

// ── Type badge ──────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: AdminBranchRequestType }) {
  const { t } = useI18n();
  const isMarket = type === "market";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: isMarket ? "rgba(37,99,235,0.10)" : "rgba(147,51,234,0.10)",
        color: isMarket
          ? "var(--rezvix-info, #2563eb)"
          : "var(--rezvix-primary, #9333ea)",
        border: isMarket
          ? "1px solid rgba(37,99,235,0.25)"
          : "1px solid rgba(147,51,234,0.25)",
        whiteSpace: "nowrap",
      }}
    >
      {isMarket ? "🛒" : "🍽️"} {isMarket ? t("Market") : t("Restoran")}
    </span>
  );
}

// ── Detail field ────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "var(--rezvix-text-soft)",
          marginBottom: 2,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--rezvix-text-main)" }}>
        {value === undefined || value === null || value === "" ? "—" : value}
      </div>
    </div>
  );
}

function PayloadDetail({ row }: { row: AdminBranchRequest }) {
  const { t } = useI18n();
  const p = row.payload || {};

  let fields: { label: string; value?: React.ReactNode }[];

  if (row.type === "market") {
    const coords = p.location?.coordinates;
    // coordinates are [lng, lat] — display as "lat, lng"
    const coordText =
      Array.isArray(coords) && coords.length === 2
        ? `${coords[1]}, ${coords[0]}`
        : "—";
    fields = [
      { label: t("Ad"), value: p.name },
      { label: t("Kategori"), value: p.category },
      { label: t("Adres"), value: p.address },
      { label: t("Şehir"), value: p.city },
      { label: t("Telefon"), value: p.phone },
      { label: t("Konum (enlem, boylam)"), value: coordText },
    ];
  } else {
    fields = [
      { label: t("Ad"), value: p.name },
      { label: t("Bölge"), value: p.region },
      { label: t("Şehir"), value: p.city },
      { label: t("Adres"), value: p.address },
      { label: t("Telefon"), value: p.phone },
      { label: t("Fiyat Aralığı"), value: p.priceRange },
      { label: t("İşletme Türü"), value: p.businessType },
      { label: t("Açıklama"), value: p.description },
    ];
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12,
        padding: "12px 16px",
        background: "var(--rezvix-bg-soft)",
        borderRadius: "var(--rezvix-radius-md, 8px)",
      }}
    >
      {fields.map((f) => (
        <Field key={f.label} label={f.label} value={f.value} />
      ))}
      {row.notes && <Field label={t("Not")} value={row.notes} />}
      {row.rejectReason && (
        <Field label={t("Red Nedeni")} value={row.rejectReason} />
      )}
    </div>
  );
}

export default function AdminBranchRequestsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] =
    React.useState<StatusFilter>("pending");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-branch-requests", statusFilter, typeFilter, cursor],
    queryFn: () =>
      adminListBranchRequests({
        status: statusFilter === "all" ? undefined : statusFilter,
        type: typeFilter === "all" ? undefined : typeFilter,
        cursor,
      }),
  });

  const items = listQ.data?.items ?? [];
  const nextCursor = listQ.data?.nextCursor;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-branch-requests"] });

  const approveMut = useMutation({
    mutationFn: (id: string) => adminApproveBranchRequest(id),
    onSuccess: () => {
      showToast(t("Onaylandı"), "success");
      invalidate();
    },
    onError: (err: any) =>
      showToast(
        err?.response?.data?.message || err?.message || t("İşlem başarısız"),
        "error"
      ),
  });

  const rejectMut = useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      adminRejectBranchRequest(vars.id, vars.reason),
    onSuccess: () => {
      showToast(t("Reddedildi"), "success");
      invalidate();
    },
    onError: (err: any) =>
      showToast(
        err?.response?.data?.message || err?.message || t("İşlem başarısız"),
        "error"
      ),
  });

  const handleReject = (id: string) => {
    const reason = window.prompt(t("Red nedeni (opsiyonel):")) ?? undefined;
    rejectMut.mutate({ id, reason });
  };

  const fmtDate = (v?: string | null) => {
    if (!v) return "—";
    try {
      return new Date(v).toLocaleString("tr-TR");
    } catch {
      return v;
    }
  };

  const statusFilters: StatusFilter[] = [
    "pending",
    "approved",
    "rejected",
    "all",
  ];
  const statusLabels: Record<StatusFilter, string> = {
    pending: t("Beklemede"),
    approved: t("Onaylandı"),
    rejected: t("Reddedildi"),
    all: t("Tümü"),
  };

  const typeFilters: TypeFilter[] = ["all", "restaurant", "market"];
  const typeLabels: Record<TypeFilter, string> = {
    all: t("Tümü"),
    restaurant: t("Restoran"),
    market: t("Market"),
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={t("Şube Talepleri")}
        subtitle={t("Restoran ve market şube taleplerini inceleyin ve onaylayın")}
      />

      {/* Status filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {statusFilters.map((f) => {
          const isSelected = statusFilter === f;
          return (
            <button
              key={f}
              onClick={() => {
                setStatusFilter(f);
                setCursor(undefined);
                setExpanded(null);
              }}
              style={{
                padding: "6px 18px",
                borderRadius: 8,
                border: isSelected
                  ? "1px solid var(--rezvix-primary)"
                  : "1px solid var(--rezvix-border-strong)",
                background: isSelected
                  ? "var(--rezvix-primary)"
                  : "var(--rezvix-bg-elevated)",
                color: isSelected ? "#fff" : "var(--rezvix-text-muted)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {statusLabels[f]}
            </button>
          );
        })}
      </div>

      {/* Type filter tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: "var(--rezvix-text-soft)",
            marginRight: 4,
          }}
        >
          {t("Tür")}:
        </span>
        {typeFilters.map((f) => {
          const isSelected = typeFilter === f;
          return (
            <button
              key={f}
              onClick={() => {
                setTypeFilter(f);
                setCursor(undefined);
                setExpanded(null);
              }}
              style={{
                padding: "5px 14px",
                borderRadius: 999,
                border: isSelected
                  ? "1px solid var(--rezvix-primary)"
                  : "1px solid var(--rezvix-border-strong)",
                background: isSelected
                  ? "var(--rezvix-primary-soft, rgba(147,51,234,0.10))"
                  : "var(--rezvix-bg-elevated)",
                color: isSelected
                  ? "var(--rezvix-primary)"
                  : "var(--rezvix-text-muted)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {typeLabels[f]}
            </button>
          );
        })}
      </div>

      {listQ.isLoading && (
        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>
          {t("Yükleniyor…")}
        </div>
      )}

      {!listQ.isLoading && (
        <div
          style={{
            overflowX: "auto",
            background: "var(--rezvix-bg-elevated)",
            borderRadius: "var(--rezvix-radius-lg)",
            border: "1px solid var(--rezvix-border-subtle)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <table
            style={{
              minWidth: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--rezvix-bg-soft)",
                  borderBottom: "1px solid var(--rezvix-border-subtle)",
                  textAlign: "left",
                  color: "var(--rezvix-text-soft)",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {[
                  "Tür",
                  "Ad",
                  "Organizasyon",
                  "Talep Eden",
                  "Durum",
                  "Tarih",
                  "İşlem",
                ].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 600 }}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "var(--rezvix-text-soft)",
                    }}
                    colSpan={7}
                  >
                    {t("Şube talebi yok")}
                  </td>
                </tr>
              ) : (
                items.map((r) => {
                  const isOpen = expanded === r._id;
                  return (
                    <React.Fragment key={r._id}>
                      <tr
                        onClick={() =>
                          setExpanded((cur) => (cur === r._id ? null : r._id))
                        }
                        style={{
                          borderTop: "1px solid var(--rezvix-border-subtle)",
                          cursor: "pointer",
                          background: isOpen
                            ? "var(--rezvix-bg-soft)"
                            : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px 16px" }}>
                          <TypeBadge type={r.type} />
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            fontWeight: 600,
                            color: "var(--rezvix-text-main)",
                          }}
                        >
                          {r.payload?.name || "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            color: "var(--rezvix-text-main)",
                          }}
                        >
                          {r.organization?.name || "—"}
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <div
                            style={{
                              color: "var(--rezvix-text-main)",
                            }}
                          >
                            {r.requestedBy?.name || "—"}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--rezvix-text-soft)",
                            }}
                          >
                            {r.requestedBy?.email || ""}
                          </div>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            color: "var(--rezvix-text-soft)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fmtDate(r.createdAt)}
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {r.status === "pending" ? (
                            <div
                              style={{ display: "flex", gap: 8 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => approveMut.mutate(r._id)}
                                disabled={approveMut.isPending}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "var(--rezvix-success, #16a34a)",
                                  color: "#fff",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                {t("Onayla")}
                              </button>
                              <button
                                onClick={() => handleReject(r._id)}
                                disabled={rejectMut.isPending}
                                style={{
                                  padding: "5px 12px",
                                  borderRadius: 6,
                                  border:
                                    "1px solid var(--rezvix-danger, #dc2626)",
                                  background: "transparent",
                                  color: "var(--rezvix-danger, #dc2626)",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                {t("Reddet")}
                              </button>
                            </div>
                          ) : (
                            <span
                              style={{
                                color: "var(--rezvix-text-soft)",
                                fontSize: 12,
                              }}
                            >
                              {fmtDate(r.resolvedAt)}
                            </span>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr style={{ background: "var(--rezvix-bg-soft)" }}>
                          <td colSpan={7} style={{ padding: "0 16px 16px" }}>
                            <PayloadDetail row={r} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setCursor(nextCursor)}
            disabled={listQ.isFetching}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1px solid var(--rezvix-border-strong)",
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              cursor: "pointer",
              opacity: listQ.isFetching ? 0.6 : 1,
            }}
          >
            {t("Daha Fazla Yükle")}
          </button>
        </div>
      )}
    </div>
  );
}
