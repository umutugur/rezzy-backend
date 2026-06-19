// pages/admin/commissions.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { adminPreviewCommissions, adminExportCommissions } from "../../api/client";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

type CommissionTab = "reservation" | "delivery" | "market" | "taxi";

function currentMonth() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtCur(val: number | string | undefined | null) {
  return Number(val ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

// ── Style helpers ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

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
  transition: "opacity 0.15s",
  height: 36,
};

const summaryCell: React.CSSProperties = {
  padding: "12px 14px",
  background: "var(--rezvix-bg-soft)",
  borderRadius: 10,
  border: "1px solid var(--rezvix-border-subtle)",
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

const totalBannerStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--rezvix-text-muted)",
  marginBottom: 8,
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminCommissionsPage() {
  const { t } = useI18n();
  const [month, setMonth] = React.useState<string>(currentMonth());
  const [tab, setTab] = React.useState<CommissionTab>("reservation");

  const q = useQuery({
    queryKey: ["admin-commissions", month],
    queryFn: () => adminPreviewCommissions(month),
  });

  const rows = q.data?.restaurants || [];

  const downloadExcel = async () => {
    try {
      const blob = await adminExportCommissions(month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rezvix-komisyon-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast(e?.message || t("Excel indirilemedi"), "error");
    }
  };

  const totalArrived = rows.reduce((a, r) => a + (r.arrivedCount || 0), 0);
  const totalRevenue = rows.reduce((a, r) => a + (r.revenueArrived || 0), 0);
  const totalCommission = rows.reduce((a, r) => a + (r.commissionAmount || 0), 0);

  const TABS: Array<{ key: CommissionTab; label: string }> = [
    { key: "reservation", label: t("Rezervasyon") },
    { key: "delivery",    label: t("🛵 Paket Servis") },
    { key: "market",      label: t("🛒 Market") },
    { key: "taxi",        label: t("🚕 Taksi") },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      {/* Header */}
      <AdminPageHeader
        title={t("Aylık Komisyonlar")}
        actions={
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Ay")}</label>
              <input
                type="month"
                style={inputBase}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            {tab === "reservation" && (
              <button
                style={{ ...primaryBtn, opacity: q.isLoading ? 0.6 : 1 }}
                onClick={downloadExcel}
                disabled={q.isLoading}
              >
                {q.isLoading ? t("Hazırlanıyor…") : t("Excel'e Aktar")}
              </button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 2,
        borderBottom: "1px solid var(--rezvix-border-subtle)",
      }}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                border: "none",
                borderBottom: active ? "2px solid var(--rezvix-primary)" : "2px solid transparent",
                marginBottom: -1,
                background: "transparent",
                color: active ? "var(--rezvix-primary)" : "var(--rezvix-text-soft)",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tb.label}
            </button>
          );
        })}
      </div>

      {q.isLoading && (
        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 14 }}>{t("Yükleniyor…")}</div>
      )}
      {q.error && (
        <div style={{ color: "var(--rezvix-danger)", fontSize: 13 }}>{t("Veri alınamadı")}</div>
      )}

      {/* ===== REZERVASYON TAB ===== */}
      {tab === "reservation" && (
        <>
          {/* Summary card */}
          <div style={cardStyle}>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--rezvix-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 12,
            }}>
              {t("Özet • {month}", { month: q.data?.month || month })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <div style={summaryCell}>
                <div style={{ fontSize: 11, color: "var(--rezvix-text-soft)", marginBottom: 4 }}>
                  {t("Arrived Rezervasyon")}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                  {totalArrived}
                </div>
              </div>
              <div style={summaryCell}>
                <div style={{ fontSize: 11, color: "var(--rezvix-text-soft)", marginBottom: 4 }}>
                  {t("Arrived Toplam (₺)")}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                  {totalRevenue.toLocaleString("tr-TR")}
                </div>
              </div>
              <div style={summaryCell}>
                <div style={{ fontSize: 11, color: "var(--rezvix-text-soft)", marginBottom: 4 }}>
                  {t("Komisyon Toplamı (₺)")}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                  {totalCommission.toLocaleString("tr-TR")}
                </div>
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid var(--rezvix-border-subtle)" }}>
            <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("Restoran")}</th>
                  <th style={thStyle}>{t("Sahip")}</th>
                  <th style={thStyle}>{t("E-posta")}</th>
                  <th style={thStyle}>{t("Arrived")}</th>
                  <th style={thStyle}>{t("Arrived Toplam (₺)")}</th>
                  <th style={thStyle}>{t("Komisyon Oranı")}</th>
                  <th style={thStyle}>{t("Komisyon (₺)")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r._id} style={{ background: "var(--rezvix-bg-elevated)" }}>
                    <td style={tdStyle}>{r.restaurantName}</td>
                    <td style={tdStyle}>{r.ownerName || t("—")}</td>
                    <td style={tdStyle}>{r.ownerEmail || t("—")}</td>
                    <td style={tdStyle}>{r.arrivedCount}</td>
                    <td style={tdStyle}>{Number(r.revenueArrived || 0).toLocaleString("tr-TR")}</td>
                    <td style={tdStyle}>{Number(r.commissionRate || 0)}</td>
                    <td style={tdStyle}>{Number(r.commissionAmount || 0).toLocaleString("tr-TR")}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td style={emptyTdStyle} colSpan={7}>{t("Kayıt yok")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ===== PAKET SERVİS TAB ===== */}
      {tab === "delivery" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {q.data?.modules?.delivery && (
            <div style={totalBannerStyle}>
              {t("Toplam")}:{" "}
              <span style={{ fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                {fmtCur(q.data.modules.delivery.total)} ₺
              </span>
            </div>
          )}
          <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid var(--rezvix-border-subtle)" }}>
            <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("Restoran")}</th>
                  <th style={thStyle}>{t("Sipariş Sayısı")}</th>
                  <th style={thStyle}>{t("Komisyon (₺)")}</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.modules?.delivery?.rows ?? []).map((r) => (
                  <tr key={r.restaurantId} style={{ background: "var(--rezvix-bg-elevated)" }}>
                    <td style={tdStyle}>{r.restaurantName}</td>
                    <td style={tdStyle}>{r.orderCount}</td>
                    <td style={tdStyle}>{fmtCur(r.commissionAmount)}</td>
                  </tr>
                ))}
                {(q.data?.modules?.delivery?.rows ?? []).length === 0 && (
                  <tr><td style={emptyTdStyle} colSpan={3}>{t("Kayıt yok")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== MARKET TAB ===== */}
      {tab === "market" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {q.data?.modules?.market && (
            <div style={totalBannerStyle}>
              {t("Toplam")}:{" "}
              <span style={{ fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                {fmtCur(q.data.modules.market.total)} ₺
              </span>
            </div>
          )}
          <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid var(--rezvix-border-subtle)" }}>
            <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("Market")}</th>
                  <th style={thStyle}>{t("Sipariş Sayısı")}</th>
                  <th style={thStyle}>{t("Komisyon (₺)")}</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.modules?.market?.rows ?? []).map((r) => (
                  <tr key={r.storeId} style={{ background: "var(--rezvix-bg-elevated)" }}>
                    <td style={tdStyle}>{r.storeName}</td>
                    <td style={tdStyle}>{r.orderCount}</td>
                    <td style={tdStyle}>{fmtCur(r.commissionAmount)}</td>
                  </tr>
                ))}
                {(q.data?.modules?.market?.rows ?? []).length === 0 && (
                  <tr><td style={emptyTdStyle} colSpan={3}>{t("Kayıt yok")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== TAKSİ TAB ===== */}
      {tab === "taxi" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {q.data?.modules?.taxi && (
            <div style={totalBannerStyle}>
              {t("Toplam")}:{" "}
              <span style={{ fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                {fmtCur(q.data.modules.taxi.total)} ₺
              </span>
            </div>
          )}
          <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid var(--rezvix-border-subtle)" }}>
            <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("Bölge")}</th>
                  <th style={thStyle}>{t("Yolculuk Sayısı")}</th>
                  <th style={thStyle}>{t("Komisyon (₺)")}</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.modules?.taxi?.rows ?? []).map((r) => (
                  <tr key={r.region} style={{ background: "var(--rezvix-bg-elevated)" }}>
                    <td style={tdStyle}>{r.region}</td>
                    <td style={tdStyle}>{r.rideCount}</td>
                    <td style={tdStyle}>{fmtCur(r.commissionAmount)}</td>
                  </tr>
                ))}
                {(q.data?.modules?.taxi?.rows ?? []).length === 0 && (
                  <tr><td style={emptyTdStyle} colSpan={3}>{t("Kayıt yok")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
