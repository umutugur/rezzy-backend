import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminGetTaxiDrivers, adminApproveDriver, adminRejectDriver } from "../../api/adminTaxiMarket";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

type FilterKind = "all" | "pending" | "approved";

// ── Status badge ──────────────────────────────────────────────────────────────
function DriverStatusBadge({ isApproved }: { isApproved: boolean }) {
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
        background: isApproved
          ? "rgba(22,163,74,0.10)"
          : "rgba(245,158,11,0.12)",
        color: isApproved
          ? "var(--rezvix-success, #16a34a)"
          : "var(--rezvix-warning, #f59e0b)",
        border: isApproved
          ? "1px solid rgba(22,163,74,0.25)"
          : "1px solid rgba(245,158,11,0.30)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isApproved ? "var(--rezvix-success, #16a34a)" : "var(--rezvix-warning, #f59e0b)",
          flexShrink: 0,
        }}
      />
      {isApproved ? t("Onaylı") : t("Beklemede")}
    </span>
  );
}

export default function AdminTaxiDriversPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKind>("pending");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-taxi-drivers", filter, page],
    queryFn: () =>
      adminGetTaxiDrivers({
        isApproved: filter === "all" ? undefined : filter === "approved",
        page,
        limit: 20,
      }),
  });

  const drivers = data?.drivers ?? [];
  const pages = data?.pages ?? 1;

  const { mutate: approve } = useMutation({
    mutationFn: (id: string) => adminApproveDriver(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-taxi-drivers"] });
      showToast(t("Onaylandı"), "success");
    },
    onError: () => showToast(t("İşlem başarısız"), "error"),
  });

  const { mutate: reject } = useMutation({
    mutationFn: (id: string) => adminRejectDriver(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-taxi-drivers"] });
      showToast(t("Reddedildi"), "success");
    },
    onError: () => showToast(t("İşlem başarısız"), "error"),
  });

  const filterLabels: Record<FilterKind, string> = {
    pending: t("Beklemede"),
    approved: t("Onaylı"),
    all: t("Tümü"),
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={t("Sürücü Başvuruları")}
        subtitle={t("Onay bekleyen ve onaylı taksi sürücülerini yönetin")}
      />

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["pending", "approved", "all"] as FilterKind[]).map((f) => {
          const isSelected = filter === f;
          return (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              style={{
                padding: "6px 18px",
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
              {filterLabels[f]}
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
                {["Kullanıcı", "Plaka", "Araç", "Tip", "Durum", "Tarih", "İşlem"].map((h) => (
                  <th key={h} style={{ padding: "10px 16px", fontWeight: 600 }}>{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr>
                  <td
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "var(--rezvix-text-soft)",
                    }}
                    colSpan={7}
                  >
                    {t("Başvuru yok")}
                  </td>
                </tr>
              ) : (
                drivers.map((d: any) => (
                  <tr
                    key={d._id}
                    style={{ borderTop: "1px solid var(--rezvix-border-subtle)" }}
                  >
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ fontWeight: 600, color: "var(--rezvix-text-main)" }}>
                        {d.user?.name ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>
                        {d.user?.email ?? ""}
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", fontWeight: 600, color: "var(--rezvix-text-main)" }}>
                      {d.vehiclePlate}
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--rezvix-text-main)" }}>
                      {d.vehicleBrand} {d.vehicleModel}{" "}
                      <span style={{ color: "var(--rezvix-text-soft)" }}>({d.vehicleColor})</span>
                    </td>
                    <td style={{ padding: "10px 16px", textTransform: "capitalize", color: "var(--rezvix-text-main)" }}>
                      {d.type}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <DriverStatusBadge isApproved={d.isApproved} />
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--rezvix-text-soft)" }}>
                      {new Date(d.createdAt).toLocaleDateString("tr-TR")}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {!d.isApproved ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => approve(d._id)}
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
                            onClick={() => reject(d._id)}
                            style={{
                              padding: "5px 12px",
                              borderRadius: 6,
                              border: "1px solid var(--rezvix-danger, #dc2626)",
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
                        <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>—</span>
                      )}
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
