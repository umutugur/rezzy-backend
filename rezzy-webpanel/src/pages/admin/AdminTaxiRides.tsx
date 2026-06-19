import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGetTaxiRides } from "../../api/adminTaxiMarket";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

const STATUSES = ["", "searching", "matched", "inProgress", "completed", "cancelled"];
const STATUS_LABELS: Record<string, string> = {
  "": "Tümü",
  searching: "Aranıyor",
  matched: "Eşleşti",
  inProgress: "Devam Ediyor",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

// ── Ride status badge ─────────────────────────────────────────────────────────
function RideStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();

  let bg: string;
  let color: string;
  let border: string;

  if (status === "completed") {
    bg = "rgba(22,163,74,0.10)";
    color = "var(--rezvix-success, #16a34a)";
    border = "1px solid rgba(22,163,74,0.25)";
  } else if (status === "cancelled") {
    bg = "rgba(220,38,38,0.10)";
    color = "var(--rezvix-danger, #dc2626)";
    border = "1px solid rgba(220,38,38,0.25)";
  } else {
    bg = "rgba(245,158,11,0.12)";
    color = "var(--rezvix-warning, #f59e0b)";
    border = "1px solid rgba(245,158,11,0.30)";
  }

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
        background: bg,
        color,
        border,
        whiteSpace: "nowrap",
      }}
    >
      {t(STATUS_LABELS[status] ?? status)}
    </span>
  );
}

export default function AdminTaxiRidesPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-taxi-rides", status, page],
    queryFn: () => adminGetTaxiRides({ status: status || undefined, page, limit: 20 }),
  });

  const rides = data?.rides ?? [];
  const pages = data?.pages ?? 1;

  return (
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={t("Taksi Yolculukları")}
        subtitle={t("Tüm taksi yolculuklarını görüntüleyin ve filtreleyin")}
      />

      {/* Status filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {STATUSES.map((s) => {
          const isSelected = status === s;
          return (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                border: isSelected
                  ? "1px solid var(--rezvix-primary)"
                  : "1px solid var(--rezvix-border-strong)",
                background: isSelected ? "var(--rezvix-primary)" : "var(--rezvix-bg-elevated)",
                color: isSelected ? "#fff" : "var(--rezvix-text-muted)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {t(STATUS_LABELS[s])}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>{t("Yükleniyor…")}</div>
      )}

      {!isLoading && (
        <div
          style={{
            overflowX: "auto",
            background: "var(--rezvix-bg-elevated)",
            borderRadius: "var(--rezvix-radius-lg)",
            border: "1px solid var(--rezvix-border-subtle)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <table style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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
                  position: "sticky",
                  top: 0,
                }}
              >
                {["ID", "Yolcu", "Sürücü", "Ücret", "Mesafe", "Durum", "Tarih"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 600 }}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rides.length === 0 ? (
                <tr>
                  <td
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "var(--rezvix-text-soft)",
                    }}
                    colSpan={7}
                  >
                    {t("Yolculuk yok")}
                  </td>
                </tr>
              ) : (
                rides.map((r: any) => (
                  <tr
                    key={r._id}
                    style={{ borderTop: "1px solid var(--rezvix-border-subtle)" }}
                  >
                    <td style={{ padding: "10px 16px", fontWeight: 700, color: "var(--rezvix-text-main)", fontFamily: "monospace" }}>
                      #{r._id.slice(-6).toUpperCase()}
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                      {typeof r.passenger === "object" ? r.passenger.name : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                      {r.driver?.user?.name ?? "—"}
                    </td>
                    <td style={{ padding: "10px 16px", fontWeight: 700, color: "var(--rezvix-success, #16a34a)" }}>
                      ₺{Number(r.fare ?? 0).toFixed(2)}
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                      {Number(r.distanceKm ?? 0).toFixed(1)} km
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <RideStatusBadge status={r.status} />
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--rezvix-text-soft)" }}>
                      {new Date(r.requestedAt ?? r.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1px solid var(--rezvix-border-strong)",
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              cursor: page === 1 ? "not-allowed" : "pointer",
              opacity: page === 1 ? 0.5 : 1,
            }}
          >
            ← {t("Önceki")}
          </button>
          <span style={{ fontSize: 13, color: "var(--rezvix-text-muted)" }}>
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "1px solid var(--rezvix-border-strong)",
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              cursor: page === pages ? "not-allowed" : "pointer",
              opacity: page === pages ? 0.5 : 1,
            }}
          >
            {t("Sonraki")} →
          </button>
        </div>
      )}
    </div>
  );
}
