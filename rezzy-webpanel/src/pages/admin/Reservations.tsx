import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { showToast } from "../../ui/Toast";
import { t as i18nT, useI18n } from "../../i18n";

type Row = {
  _id: string;
  dateTimeUTC: string;
  status: string;
  partySize?: number;
  totalPrice?: number;
  // backend farklı şekillerde döndürebilir:
  restaurant?: { name?: string; title?: string };
  restaurantName?: string;
  restaurantId?: any;
  user?: { name?: string; email?: string };
  userName?: string;
  userEmail?: string;
  userId?: any;
};
type Resp = { items: Row[]; total: number; page: number; limit: number };

const statusLabels: Record<string, string> = {
  pending: "Bekleyen",
  confirmed: "Onaylı",
  arrived: "Geldi",
  cancelled: "İptal",
  no_show: "Gelmedi"
};

const getRestaurantLabel = (r: Row) =>
  r.restaurant?.name ||
  r.restaurant?.title ||
  (typeof r.restaurantId === "object" ? r.restaurantId?.name : undefined) ||
  r.restaurantName ||
  "-";

const getUserLabel = (r: Row) =>
  r.user?.name || (typeof r.userId === "object" ? r.userId?.name : undefined) || r.userName || "-";

const getUserEmail = (r: Row) =>
  r.user?.email || (typeof r.userId === "object" ? r.userId?.email : undefined) || r.userEmail || "-";

async function fetchAdminReservations(p: {
  status?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}): Promise<Resp> {
  const { data } = await api.get("/admin/reservations", { params: p });
  if (Array.isArray(data)) return { items: data, total: data.length, page: 1, limit: data.length };
  return data as Resp;
}

function toCSV(rows: Row[]) {
  const head = [
    i18nT("Tarih"),
    i18nT("Restoran"),
    i18nT("Kullanıcı"),
    i18nT("E-posta"),
    i18nT("Durum"),
    i18nT("Kişi"),
    i18nT("Tutar")
  ];
  const esc = (s: any) => `"${(s ?? "").toString().replaceAll('"', '""')}"`;
  const lines = rows.map((r) =>
    [
      new Date(r.dateTimeUTC).toLocaleString(),
      getRestaurantLabel(r),
      getUserLabel(r),
      getUserEmail(r),
      i18nT(statusLabels[r.status] || r.status),
      r.partySize ?? "",
      (r.totalPrice ?? "").toString().replace(".", ",")
    ]
      .map(esc)
      .join(";")
  );
  return [head.map(esc).join(";"), ...lines].join("\n");
}

// ── Style helpers ──────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  fontSize: 13,
  outline: "none",
  height: 36,
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--rezvix-primary)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  height: 36,
  transition: "opacity 0.15s",
  alignSelf: "flex-end",
};

const ghostBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-muted)",
  fontSize: 13,
  cursor: "pointer",
  transition: "background 0.15s",
};

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--rezvix-text-soft)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  background: "var(--rezvix-bg-soft)",
  borderBottom: "1px solid var(--rezvix-border-subtle)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  color: "var(--rezvix-text-main)",
  borderBottom: "1px solid var(--rezvix-border-subtle)",
};

const emptyTdStyle: React.CSSProperties = {
  padding: "16px 14px",
  fontSize: 13,
  color: "var(--rezvix-text-soft)",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminReservationsPage() {
  const { t } = useI18n();
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-reservations", status, from, to, page, limit],
    queryFn: () =>
      fetchAdminReservations({
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit
      })
  });

  const totalPages =
    data && data.limit > 0 ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const handleExport = async () => {
    try {
      const resp = await fetchAdminReservations({
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        page: 1,
        limit: 10000
      });
      const csv = toCSV(resp.items);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rezervasyonlar-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(t("CSV indirildi"), "success");
    } catch {
      showToast(t("CSV oluşturulamadı"), "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      {/* Header */}
      <AdminPageHeader
        title={t("Tüm Rezervasyonlar")}
        actions={
          <button style={primaryBtn} onClick={handleExport}>
            {t("CSV Dışa Aktar")}
          </button>
        }
      />

      {/* Filter card */}
      <div style={cardStyle}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--rezvix-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 14,
        }}>
          {t("Filtreler")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Durum")}</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ ...inputBase, cursor: "pointer" }}
            >
              <option value="">{t("Hepsi")}</option>
              <option value="pending">{t("Bekleyen")}</option>
              <option value="confirmed">{t("Onaylı")}</option>
              <option value="arrived">{t("Geldi")}</option>
              <option value="cancelled">{t("İptal")}</option>
              <option value="no_show">{t("Gelmedi")}</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Başlangıç")}</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={inputBase}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Bitiş")}</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={inputBase}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Sayfa")}</label>
            <input
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(Number(e.target.value) || 1)}
              style={{ ...inputBase, width: 80 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Limit")}</label>
            <input
              type="number"
              min={1}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 20)}
              style={{ ...inputBase, width: 80 }}
            />
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ ...primaryBtn, opacity: isFetching ? 0.6 : 1 }}
          >
            {isFetching ? t("Getiriliyor…") : t("Uygula")}
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 14 }}>{t("Yükleniyor…")}</div>
      )}
      {error && (
        <div style={{ color: "var(--rezvix-danger)", fontSize: 13 }}>{t("Liste çekilemedi")}</div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 16, border: "1px solid var(--rezvix-border-subtle)", background: "var(--rezvix-bg-elevated)" }}>
        <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>{t("Tarih")}</th>
              <th style={thStyle}>{t("Restoran")}</th>
              <th style={thStyle}>{t("Kullanıcı")}</th>
              <th style={thStyle}>{t("Durum")}</th>
              <th style={thStyle}>{t("Kişi")}</th>
              <th style={thStyle}>{t("Tutar (₺)")}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr key={r._id}>
                <td style={tdStyle}>{new Date(r.dateTimeUTC).toLocaleString()}</td>
                <td style={tdStyle}>{getRestaurantLabel(r)}</td>
                <td style={tdStyle}>
                  {getUserLabel(r)}{" "}
                  <span style={{ color: "var(--rezvix-text-soft)" }}>({getUserEmail(r)})</span>
                </td>
                <td style={tdStyle}>{t(statusLabels[r.status] || r.status)}</td>
                <td style={tdStyle}>{r.partySize ?? "-"}</td>
                <td style={tdStyle}>{r.totalPrice?.toLocaleString("tr-TR") ?? "-"}</td>
              </tr>
            ))}
            {(!data?.items || data.items.length === 0) && (
              <tr>
                <td style={emptyTdStyle} colSpan={6}>{t("Kayıt yok")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            style={{ ...ghostBtn, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? "not-allowed" : "pointer" }}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t("Önceki")}
          </button>
          <div style={{ fontSize: 13, color: "var(--rezvix-text-muted)" }}>
            {t("Sayfa {page} / {totalPages} • Toplam {total}", { page, totalPages, total: data.total })}
          </div>
          <button
            style={{ ...ghostBtn, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? "not-allowed" : "pointer" }}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Sonraki")}
          </button>
        </div>
      )}
    </div>
  );
}
