import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import { DataTable, Column } from "../../desktop/components/admin/DataTable";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import {
  adminListRestaurants,
  AdminRestaurantRow,
} from "../../api/adminRestaurants";

const PAGE_LIMIT = 25;

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ isActive }: { isActive?: boolean }) {
  const { t } = useI18n();
  const active = isActive !== false; // treat undefined as active
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
        background: active
          ? "var(--rezvix-success-soft, #dcfce7)"
          : "var(--rezvix-bg-soft, #f1f5f9)",
        color: active
          ? "var(--rezvix-success, #16a34a)"
          : "var(--rezvix-text-soft, #64748b)",
        border: active
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
          background: active
            ? "var(--rezvix-success, #16a34a)"
            : "var(--rezvix-text-soft, #94a3b8)",
          flexShrink: 0,
        }}
      />
      {active ? t("Aktif") : t("Pasif")}
    </span>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
export default function AdminRestaurantsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  // Search input (debounced into `query`)
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  // Accumulated rows + cursor pagination state
  const [rows, setRows] = useState<AdminRestaurantRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track active query to avoid stale appends from previous fetches
  const activeQueryRef = useRef<string>("");

  // ── Debounce search input → query ────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Initial / search-change fetch ───────────────────────────────────────
  // NOTE: deliberately depends ONLY on `query`. Do not add `t` or other
  // render-unstable values here — that would recreate the callback every
  // render and re-fire the effect in an infinite fetch loop.
  const fetchInitial = useCallback(async (q: string) => {
    activeQueryRef.current = q;
    setLoading(true);
    setError(null);
    setRows([]);
    setNextCursor(null);
    try {
      const resp = await adminListRestaurants({
        query: q || undefined,
        limit: PAGE_LIMIT,
      });
      if (activeQueryRef.current !== q) return;
      setRows(resp.items);
      setNextCursor(resp.nextCursor);
    } catch {
      if (activeQueryRef.current !== q) return;
      setError("Liste çekilemedi");
    } finally {
      if (activeQueryRef.current === q) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitial(query);
  }, [query, fetchInitial]);

  // ── Load more (append) ───────────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const q = query;
    setLoadingMore(true);
    try {
      const resp = await adminListRestaurants({
        query: q || undefined,
        limit: PAGE_LIMIT,
        cursor: nextCursor,
      });
      // Guard: if query changed while loading more, discard
      if (activeQueryRef.current !== q) return;
      setRows((prev) => [...prev, ...resp.items]);
      setNextCursor(resp.nextCursor);
    } catch {
      // Non-fatal: just stop spinner
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, query]);

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns: Column<AdminRestaurantRow>[] = [
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
      key: "address",
      header: t("Adres"),
      width: "200px",
      render: (row) => (
        <span
          style={{
            color: "var(--rezvix-text-main)",
            fontSize: 13,
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "inline-block",
          }}
        >
          {row.address ?? "—"}
        </span>
      ),
    },
    {
      key: "phone",
      header: t("Telefon"),
      width: "140px",
      render: (row) => (
        <span style={{ color: "var(--rezvix-text-main)", fontSize: 13 }}>
          {row.phone ?? "—"}
        </span>
      ),
    },
    {
      key: "email",
      header: t("E-posta"),
      width: "190px",
      render: (row) => (
        <span
          style={{
            color: "var(--rezvix-text-main)",
            fontSize: 13,
            maxWidth: 190,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "inline-block",
          }}
        >
          {row.email ?? "—"}
        </span>
      ),
    },
    {
      key: "region",
      header: t("Bölge"),
      width: "90px",
      render: (row) => (
        <span style={{ color: "var(--rezvix-text-main)", fontSize: 13 }}>
          {row.region ?? "—"}
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
        title={t("Restoranlar")}
        subtitle={t("Tüm restoranları yönetin")}
        actions={
          <button
            onClick={() => navigate("/admin/restaurants/new")}
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
              boxShadow:
                "0 4px 14px rgba(var(--rezvix-primary-rgb, 255 90 50) / 0.35)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "opacity 0.15s ease, transform 0.1s ease",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
              (e.currentTarget as HTMLButtonElement).style.transform =
                "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = "1";
              (e.currentTarget as HTMLButtonElement).style.transform = "none";
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            {t("Restoran Ekle")}
          </button>
        }
      />

      {/* ── DataTable with search slot ── */}
      <DataTable<AdminRestaurantRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row._id}
        loading={loading}
        error={error ? t(error) : null}
        emptyText={t("Kayıt yok")}
        onRowClick={(row) => navigate(`/admin/restaurants/${row._id}`)}
        search={{
          value: searchInput,
          onChange: setSearchInput,
          placeholder: t("Restoran adı ara..."),
        }}
      />

      {/* ── Load more ── */}
      {nextCursor && !loading && !error && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: "9px 28px",
              borderRadius: 999,
              border: "1px solid var(--rezvix-border-strong)",
              background: loadingMore
                ? "var(--rezvix-bg-soft)"
                : "var(--rezvix-bg-elevated)",
              color: loadingMore
                ? "var(--rezvix-text-soft)"
                : "var(--rezvix-text-main)",
              fontSize: 13,
              fontWeight: 600,
              cursor: loadingMore ? "not-allowed" : "pointer",
              opacity: loadingMore ? 0.6 : 1,
              transition: "background 0.15s ease, opacity 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!loadingMore) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--rezvix-bg-soft)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loadingMore) {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--rezvix-bg-elevated)";
              }
            }}
          >
            {loadingMore ? t("Yükleniyor…") : t("Daha fazla yükle")}
          </button>
        </div>
      )}
    </div>
  );
}
