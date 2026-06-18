import React, { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import { DataTable, Column } from "../../desktop/components/admin/DataTable";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import {
  adminListMarketStores,
  AdminMarketStoreRow,
} from "../../api/adminMarketStores";

// ── Filter toolbar ────────────────────────────────────────────────────────────
function FilterBar({
  city,
  onCityChange,
  isActive,
  onIsActiveChange,
}: {
  city: string;
  onCityChange: (v: string) => void;
  isActive: "all" | "true" | "false";
  onIsActiveChange: (v: "all" | "true" | "false") => void;
}) {
  const { t } = useI18n();

  const inputBase: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--rezvix-border-strong)",
    background: "var(--rezvix-bg-elevated)",
    color: "var(--rezvix-text-main)",
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.16s ease, box-shadow 0.16s ease",
    height: 36,
    boxSizing: "border-box" as const,
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 10,
        flexWrap: "wrap",
      }}
    >
      <input
        type="text"
        value={city}
        onChange={(e) => onCityChange(e.target.value)}
        placeholder={t("Şehir filtrele...")}
        style={{ ...inputBase, minWidth: 140 }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--rezvix-primary-soft)";
          e.currentTarget.style.boxShadow = "0 0 0 2px var(--rezvix-primary-soft)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />

      <select
        value={isActive}
        onChange={(e) =>
          onIsActiveChange(e.target.value as "all" | "true" | "false")
        }
        style={{ ...inputBase, cursor: "pointer", minWidth: 110 }}
      >
        <option value="all">{t("Tüm Durum")}</option>
        <option value="true">{t("Aktif")}</option>
        <option value="false">{t("Pasif")}</option>
      </select>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useI18n();
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
        background: isActive
          ? "var(--rezvix-success-soft, #dcfce7)"
          : "var(--rezvix-bg-soft, #f1f5f9)",
        color: isActive
          ? "var(--rezvix-success, #16a34a)"
          : "var(--rezvix-text-soft, #64748b)",
        border: isActive
          ? "1px solid var(--rezvix-success-border, #bbf7d0)"
          : "1px solid var(--rezvix-border-subtle, #e2e8f0)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isActive
            ? "var(--rezvix-success, #16a34a)"
            : "var(--rezvix-text-soft, #94a3b8)",
          flexShrink: 0,
        }}
      />
      {isActive ? t("Aktif") : t("Pasif")}
    </span>
  );
}

// ── Organization badge ────────────────────────────────────────────────────────
function OrgCell({ org }: { org?: { _id: string; name: string } | null }) {
  const { t } = useI18n();
  if (!org) {
    return (
      <span
        style={{
          color: "var(--rezvix-text-soft)",
          fontSize: 12,
          fontStyle: "italic",
        }}
      >
        {t("Tekil")}
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: "var(--rezvix-primary-soft, rgba(var(--rezvix-primary-rgb, 255 90 50) / 0.10))",
        color: "var(--rezvix-primary, #ff5a32)",
        border: "1px solid var(--rezvix-border-subtle)",
        maxWidth: 160,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {org.name}
    </span>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
export default function AdminMarketsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  // Filter state — page is 0-based to match DataTable's pagination contract
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [isActive, setIsActive] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 20;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-market-stores", { q, city, isActive, page }],
    queryFn: () =>
      adminListMarketStores({
        q: q.trim() || undefined,
        city: city.trim() || undefined,
        isActive: isActive === "all" ? undefined : isActive,
        page: page + 1, // backend is 1-based
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const rows: AdminMarketStoreRow[] = data?.items ?? [];

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns: Column<AdminMarketStoreRow>[] = [
    {
      key: "name",
      header: t("Ad"),
      width: "220px",
      render: (row) => (
        <span
          style={{
            color: "var(--rezvix-primary, #ff5a32)",
            fontWeight: 600,
            fontSize: 13.5,
          }}
        >
          {row.name}
        </span>
      ),
    },
    {
      key: "city",
      header: t("Şehir"),
      width: "110px",
      render: (row) => (
        <span style={{ color: "var(--rezvix-text-main)", fontSize: 13 }}>
          {row.city ?? "—"}
        </span>
      ),
    },
    {
      key: "category",
      header: t("Kategori"),
      width: "130px",
      render: (row) => (
        <span style={{ color: "var(--rezvix-text-main)", fontSize: 13 }}>
          {row.category}
        </span>
      ),
    },
    {
      key: "organization",
      header: t("Zincir"),
      width: "160px",
      render: (row) => <OrgCell org={row.organization} />,
    },
    {
      key: "totalOrders",
      header: t("Sipariş"),
      width: "90px",
      align: "right",
      render: (row) => (
        <span
          style={{
            color: "var(--rezvix-text-main)",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {(row.totalOrders ?? 0).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      key: "isActive",
      header: t("Durum"),
      width: "100px",
      align: "center",
      render: (row) => <StatusBadge isActive={row.isActive} />,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* ── Header ── */}
      <AdminPageHeader
        title={t("Marketler")}
        subtitle={t("Tüm market mağazalarını yönetin")}
        actions={
          <button
            onClick={() => navigate("/admin/market/stores/new")}
            style={{
              padding: "9px 18px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              background:
                "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong, #e04520))",
              color: "#fff",
              boxShadow: "0 4px 14px rgba(var(--rezvix-primary-rgb, 255 90 50) / 0.35)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "opacity 0.15s ease, transform 0.1s ease",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "1";
              (e.currentTarget as HTMLButtonElement).style.transform = "none";
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            {t("Market Ekle")}
          </button>
        }
      />

      {/* ── Extra filters row (city + status) ── */}
      <FilterBar
        city={city}
        onCityChange={(v) => {
          setCity(v);
          setPage(0);
        }}
        isActive={isActive}
        onIsActiveChange={(v) => {
          setIsActive(v);
          setPage(0);
        }}
      />

      {/* ── Data table (search wired in) ── */}
      <DataTable<AdminMarketStoreRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row._id}
        loading={isLoading}
        error={isError ? t("Liste çekilemedi") : null}
        emptyText={t("Market bulunamadı")}
        onRowClick={(row) => navigate(`/admin/market/stores/${row._id}`)}
        search={{
          value: q,
          onChange: (v) => {
            setQ(v);
            setPage(0);
          },
          placeholder: t("Market adı ara..."),
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
