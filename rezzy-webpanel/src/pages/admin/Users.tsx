import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  adminGetUserStats,
  adminExportUsers,
  adminResetUserPassword,
} from "../../api/client";
import { adminListUsers, AdminUserRow } from "../../api/adminUsers";
import { Stat, StatGrid } from "../../components/Card";
import { DataTable, Column } from "../../desktop/components/admin/DataTable";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import Modal from "../../components/Modal";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

const PAGE_LIMIT = 25;

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({
  riskScore,
  noShowCount,
}: {
  riskScore?: number;
  noShowCount?: number;
}) {
  const { t } = useI18n();
  const score = riskScore ?? 0;
  const highRisk = score >= 75;
  const medRisk = score >= 40 && score < 75;

  const bg = highRisk
    ? "var(--rezvix-danger-soft, #fee2e2)"
    : medRisk
    ? "rgba(251,146,60,0.12)"
    : "var(--rezvix-bg-soft, #f1f5f9)";
  const color = highRisk
    ? "var(--rezvix-danger, #dc2626)"
    : medRisk
    ? "#c2410c"
    : "var(--rezvix-text-soft, #64748b)";
  const border = highRisk
    ? "1px solid rgba(220,38,38,0.25)"
    : medRisk
    ? "1px solid rgba(194,65,12,0.2)"
    : "1px solid var(--rezvix-border-subtle, #e2e8f0)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span
        title={t("Risk skoru (0–100)")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 700,
          background: bg,
          color,
          border,
          whiteSpace: "nowrap",
        }}
      >
        {highRisk && (
          <span style={{ fontSize: 10, lineHeight: 1 }}>⚠</span>
        )}
        {score}
      </span>
      {typeof noShowCount === "number" && noShowCount > 0 && (
        <span
          title={t("No-show sayısı")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "3px 7px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: "var(--rezvix-bg-soft, #f1f5f9)",
            color: "var(--rezvix-text-soft, #64748b)",
            border: "1px solid var(--rezvix-border-subtle, #e2e8f0)",
            whiteSpace: "nowrap",
          }}
        >
          {t("NS: {count}", { count: noShowCount })}
        </span>
      )}
    </div>
  );
}

// ── Status (ban) badge ────────────────────────────────────────────────────────
function StatusBadge({ banned }: { banned?: boolean }) {
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
        background: banned
          ? "var(--rezvix-danger-soft, #fee2e2)"
          : "var(--rezvix-success-soft, #dcfce7)",
        color: banned
          ? "var(--rezvix-danger, #dc2626)"
          : "var(--rezvix-success, #16a34a)",
        border: banned
          ? "1px solid rgba(220,38,38,0.25)"
          : "1px solid var(--rezvix-success-border, #bbf7d0)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: banned
            ? "var(--rezvix-danger, #dc2626)"
            : "var(--rezvix-success, #16a34a)",
          flexShrink: 0,
        }}
      />
      {banned ? t("Banlı") : t("Aktif")}
    </span>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: AdminUserRow["role"] }) {
  const roleColors: Record<string, { bg: string; color: string; border: string }> = {
    admin: {
      bg: "var(--rezvix-primary-soft, rgba(255,90,50,0.10))",
      color: "var(--rezvix-primary, #ff5a32)",
      border: "1px solid var(--rezvix-border-subtle)",
    },
    restaurant: {
      bg: "rgba(99,102,241,0.10)",
      color: "#4338ca",
      border: "1px solid rgba(99,102,241,0.2)",
    },
    customer: {
      bg: "var(--rezvix-bg-soft)",
      color: "var(--rezvix-text-soft)",
      border: "1px solid var(--rezvix-border-subtle)",
    },
  };
  const style = roleColors[role] ?? roleColors.customer;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: 700,
        textTransform: "capitalize",
        letterSpacing: "0.03em",
        ...style,
      }}
    >
      {role}
    </span>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  role,
  onRoleChange,
  banned,
  onBannedChange,
}: {
  role: "all" | "customer" | "restaurant" | "admin";
  onRoleChange: (v: "all" | "customer" | "restaurant" | "admin") => void;
  banned: "all" | "true" | "false";
  onBannedChange: (v: "all" | "true" | "false") => void;
}) {
  const { t } = useI18n();
  const selectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--rezvix-border-strong)",
    background: "var(--rezvix-bg-elevated)",
    color: "var(--rezvix-text-main)",
    fontSize: 13,
    outline: "none",
    height: 36,
    boxSizing: "border-box",
    cursor: "pointer",
    transition: "border-color 0.16s ease",
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
      <select
        value={role}
        onChange={(e) =>
          onRoleChange(e.target.value as "all" | "customer" | "restaurant" | "admin")
        }
        style={{ ...selectStyle, minWidth: 120 }}
      >
        <option value="all">{t("Tüm Roller")}</option>
        <option value="customer">{t("Müşteri")}</option>
        <option value="restaurant">{t("Restoran")}</option>
        <option value="admin">{t("Admin")}</option>
      </select>

      <select
        value={banned}
        onChange={(e) => onBannedChange(e.target.value as "all" | "true" | "false")}
        style={{ ...selectStyle, minWidth: 120 }}
      >
        <option value="all">{t("Tüm Durum")}</option>
        <option value="false">{t("Aktif")}</option>
        <option value="true">{t("Banlı")}</option>
      </select>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  // ── Search & filter state ──────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | "customer" | "restaurant" | "admin">("all");
  const [banned, setBanned] = useState<"all" | "true" | "false">("all");

  // ── Cursor pagination state ───────────────────────────────────────────────
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stale-guard ref: tracks the "active" combination of query+role+banned
  const activeKeyRef = useRef<string>("");

  // ── Stats ─────────────────────────────────────────────────────────────────
  const statsQ = useQuery({
    queryKey: ["admin-user-stats"],
    queryFn: adminGetUserStats,
  });

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      await adminExportUsers();
    } catch {
      // error toast is shown by the axios interceptor
    }
  };

  // ── Password reset modal state ────────────────────────────────────────────
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPassword2, setResetPassword2] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const openReset = (u: AdminUserRow, e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger row navigation
    setResetTarget(u);
    setResetPassword("");
    setResetPassword2("");
    setResetOpen(true);
  };

  const genRandom = () => {
    const v = Math.random().toString(36).slice(-10);
    setResetPassword(v);
    setResetPassword2(v);
  };

  const copyPassword = async () => {
    try {
      if (!resetPassword) return;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resetPassword);
        showToast(t("Şifre kopyalandı"), "success");
      }
    } catch {}
  };

  const submitReset = async () => {
    const target = resetTarget;
    if (!target) return;
    const p1 = String(resetPassword || "").trim();
    const p2 = String(resetPassword2 || "").trim();
    if (p1.length < 8) {
      showToast(t("Şifre en az 8 karakter olmalı"), "error");
      return;
    }
    if (p1 !== p2) {
      showToast(t("Şifreler eşleşmiyor"), "error");
      return;
    }
    setResetBusy(true);
    try {
      await adminResetUserPassword(target._id, p1);
      showToast(t("Şifre sıfırlandı"), "success");
      setResetOpen(false);
    } catch (e: any) {
      showToast(
        e?.response?.data?.message || e?.message || t("Şifre sıfırlanamadı"),
        "error"
      );
    } finally {
      setResetBusy(false);
    }
  };

  // ── Debounce: searchInput → query ─────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Build stale-guard key ─────────────────────────────────────────────────
  const makeKey = useCallback(
    (q: string) => `${q}|${role}|${banned}`,
    [role, banned]
  );

  // ── Initial / filter-change fetch ─────────────────────────────────────────
  const fetchInitial = useCallback(
    async (q: string) => {
      const key = makeKey(q);
      activeKeyRef.current = key;
      setLoading(true);
      setError(null);
      setRows([]);
      setNextCursor(null);
      try {
        const resp = await adminListUsers({
          query: q || undefined,
          role: role !== "all" ? role : undefined,
          banned: banned !== "all" ? banned : undefined,
          limit: PAGE_LIMIT,
        });
        if (activeKeyRef.current !== key) return;
        setRows(resp.items);
        setNextCursor(resp.nextCursor);
      } catch {
        if (activeKeyRef.current !== key) return;
        setError("Liste çekilemedi");
      } finally {
        if (activeKeyRef.current === key) setLoading(false);
      }
    },
    // NOTE: do NOT add `t` here — it is render-unstable and would cause an
    // infinite fetch loop via the effect below. Error text is translated at render.
    [makeKey, role, banned]
  );

  useEffect(() => {
    fetchInitial(query);
  }, [query, fetchInitial]);

  // ── Load more ─────────────────────────────────────────────────────────────
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const key = makeKey(query);
    setLoadingMore(true);
    try {
      const resp = await adminListUsers({
        query: query || undefined,
        role: role !== "all" ? role : undefined,
        banned: banned !== "all" ? banned : undefined,
        limit: PAGE_LIMIT,
        cursor: nextCursor,
      });
      if (activeKeyRef.current !== key) return;
      setRows((prev) => [...prev, ...resp.items]);
      setNextCursor(resp.nextCursor);
    } catch {
      // Non-fatal
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, query, role, banned, makeKey]);

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns: Column<AdminUserRow>[] = [
    {
      key: "name",
      header: t("Ad"),
      width: "200px",
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
      key: "email",
      header: t("E-posta"),
      width: "210px",
      render: (row) => (
        <span
          style={{
            color: "var(--rezvix-text-main)",
            fontSize: 13,
            maxWidth: 210,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "inline-block",
          }}
        >
          {row.email || "—"}
        </span>
      ),
    },
    {
      key: "phone",
      header: t("Telefon"),
      width: "130px",
      render: (row) => (
        <span style={{ color: "var(--rezvix-text-main)", fontSize: 13 }}>
          {row.phone || "—"}
        </span>
      ),
    },
    {
      key: "role",
      header: t("Rol"),
      width: "100px",
      render: (row) => <RoleBadge role={row.role} />,
    },
    {
      key: "riskScore",
      header: t("Risk"),
      width: "140px",
      render: (row) => (
        <RiskBadge riskScore={row.riskScore} noShowCount={row.noShowCount} />
      ),
    },
    {
      key: "banned",
      header: t("Durum"),
      width: "100px",
      align: "center",
      render: (row) => <StatusBadge banned={row.banned} />,
    },
    {
      key: "actions",
      header: t("İşlem"),
      width: "120px",
      align: "center",
      render: (row) => (
        <button
          onClick={(e) => openReset(row, e)}
          style={{
            padding: "5px 12px",
            borderRadius: 8,
            border: "1px solid var(--rezvix-border-strong)",
            background: "var(--rezvix-bg-elevated)",
            color: "var(--rezvix-text-main)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "background 0.13s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--rezvix-bg-soft)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--rezvix-bg-elevated)";
          }}
        >
          {t("Şifre Sıfırla")}
        </button>
      ),
    },
  ];

  return (
    <>
      <div style={{ padding: 24 }}>
        {/* ── Header ── */}
        <AdminPageHeader
          title={t("Kullanıcılar")}
          subtitle={t("Tüm kullanıcıları yönetin")}
          actions={
            <button
              onClick={handleExport}
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
              ↓ {t("CSV Dışa Aktar")}
            </button>
          }
        />

        {/* ── Stat cards ── */}
        {statsQ.data && (
          <div style={{ marginBottom: 24 }}>
            <StatGrid>
              <Stat label={t("Toplam Kullanıcı")} value={statsQ.data.total} />
              <Stat label={t("Banlı")} value={statsQ.data.banned} />
              <Stat label={t("Yüksek Riskli")} value={statsQ.data.highRisk} />
              <Stat
                label={t("Ortalama Risk")}
                value={statsQ.data.avgRisk.toFixed(1)}
                helper="/100"
              />
            </StatGrid>
          </div>
        )}

        {/* ── Filters row (role + banned) ── */}
        <FilterBar
          role={role}
          onRoleChange={(v) => {
            setRole(v);
          }}
          banned={banned}
          onBannedChange={(v) => {
            setBanned(v);
          }}
        />

        {/* ── DataTable with search slot ── */}
        <DataTable<AdminUserRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row._id}
          loading={loading}
          error={error ? t(error) : null}
          emptyText={t("Kayıt yok")}
          onRowClick={(row) => navigate(`/admin/users/${row._id}`)}
          search={{
            value: searchInput,
            onChange: setSearchInput,
            placeholder: t("Ad veya e-posta ara..."),
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

      {/* ── Password reset modal ── */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={t("Şifre Sıfırla")}
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            {resetTarget?.name} •{" "}
            {resetTarget?.email || resetTarget?.phone || resetTarget?._id}
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {t("Yeni Şifre")}
            </label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder={t("En az 8 karakter")}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              {t("Yeni Şifre (Tekrar)")}
            </label>
            <input
              type="password"
              value={resetPassword2}
              onChange={(e) => setResetPassword2(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder={t("Tekrar")}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={genRandom}
            >
              {t("Rastgele Üret")}
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={copyPassword}
              disabled={!resetPassword}
            >
              {t("Kopyala")}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200"
              onClick={() => setResetOpen(false)}
              disabled={resetBusy}
            >
              {t("Vazgeç")}
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
              onClick={submitReset}
              disabled={resetBusy}
            >
              {resetBusy ? t("Sıfırlanıyor…") : t("Sıfırla")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
