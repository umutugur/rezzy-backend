import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { DataTable, Column } from "../../desktop/components/admin/DataTable";
import {
  DriverApplication,
  DriverApplicationStatus,
  listDriverApplications,
} from "../../api/driverApplications";

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "pending", label: "Bekleyen" },
  { value: "approved", label: "Onaylı" },
  { value: "rejected", label: "Reddedilen" },
];

export function StatusBadge({ status }: { status: DriverApplicationStatus }) {
  const { t } = useI18n();
  const map: Record<DriverApplicationStatus, { bg: string; color: string; label: string }> = {
    draft: { bg: "rgba(120,120,120,0.12)", color: "var(--rezvix-text-soft)", label: t("Taslak") },
    pending: { bg: "rgba(217,119,6,0.12)", color: "#b45309", label: t("Bekliyor") },
    approved: { bg: "rgba(22,163,74,0.12)", color: "var(--rezvix-success)", label: t("Onaylandı") },
    rejected: { bg: "rgba(220,38,38,0.1)", color: "var(--rezvix-danger)", label: t("Reddedildi") },
  };
  const s = map[status] ?? map.draft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 8 }}>●</span>
      {s.label}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function DriverApplicationsPage() {
  const { t } = useI18n();
  const nav = useNavigate();

  const [status, setStatus] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(0); // 0-indexed for DataTable

  // reset to first page when filters change
  React.useEffect(() => {
    setPage(0);
  }, [status, q]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["driver-applications", status, q, page],
    queryFn: () =>
      listDriverApplications({
        status: status === "all" ? undefined : status,
        q: q.trim() || undefined,
        page: page + 1, // backend is 1-indexed
        limit: PAGE_SIZE,
      }),
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: Column<DriverApplication>[] = [
    {
      key: "applicant",
      header: t("Başvuran"),
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 600, color: "var(--rezvix-text-main)" }}>
            {r.user?.name ?? t("(Bilinmiyor)")}
          </span>
          <span style={{ fontSize: 12, color: "var(--rezvix-text-soft)" }}>
            {r.user?.email ?? "—"}
          </span>
        </div>
      ),
    },
    {
      key: "countryCode",
      header: t("Ülke"),
      render: (r) => (
        <span style={{ fontWeight: 600, color: "var(--rezvix-text-muted)" }}>{r.countryCode}</span>
      ),
    },
    {
      key: "status",
      header: t("Durum"),
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "plate",
      header: t("Plaka"),
      render: (r) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.04em" }}>
          {r.vehicle?.plate || "—"}
        </span>
      ),
    },
    {
      key: "updatedAt",
      header: t("Güncellenme"),
      render: (r) => (
        <span style={{ fontSize: 12.5, color: "var(--rezvix-text-soft)" }}>
          {fmtDate(r.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <AdminPageHeader
        title={t("Sürücü Başvuruları")}
        subtitle={t("Sürücü başvurularını inceleyin, belgeleri doğrulayın ve onaylayın")}
      />

      {/* Status filter pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {STATUS_FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              style={{
                padding: "7px 16px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: active
                  ? "1px solid var(--rezvix-primary)"
                  : "1px solid var(--rezvix-border-strong)",
                background: active ? "var(--rezvix-primary)" : "var(--rezvix-bg-elevated)",
                color: active ? "#fff" : "var(--rezvix-text-muted)",
                transition: "all 0.15s",
              }}
            >
              {t(f.label)}
            </button>
          );
        })}
      </div>

      <DataTable<DriverApplication>
        columns={columns}
        rows={rows}
        rowKey={(r) => r._id}
        loading={isLoading}
        error={error ? t("Başvurular yüklenemedi") : null}
        emptyText={t("Başvuru bulunamadı")}
        onRowClick={(r) => nav(`/admin/driver-applications/${r._id}`)}
        search={{
          value: q,
          onChange: setQ,
          placeholder: t("İsim, e-posta veya plaka ara..."),
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
