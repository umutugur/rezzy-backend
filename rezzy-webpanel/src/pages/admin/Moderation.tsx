import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import {
  adminListReviews,
  adminHideReview,
  adminUnhideReview,
  adminDeleteReview,
  adminListComplaints,
  adminResolveComplaint,
  adminDismissComplaint
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

// ── Style helpers ──────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const cardHeaderStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--rezvix-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  borderBottom: "1px solid var(--rezvix-border-subtle)",
  background: "var(--rezvix-bg-soft)",
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
  verticalAlign: "middle",
};

const emptyTdStyle: React.CSSProperties = {
  padding: "16px 14px",
  fontSize: 13,
  color: "var(--rezvix-text-soft)",
};

const ghostActionBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-muted)",
  fontSize: 12,
  cursor: "pointer",
  transition: "background 0.15s",
};

const dangerActionBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 6,
  border: "none",
  background: "var(--rezvix-danger)",
  color: "#fff",
  fontSize: 12,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminModerationPage() {
  const [tab, setTab] = React.useState<"reviews" | "complaints">("reviews");
  const { t } = useI18n();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      {/* Header */}
      <AdminPageHeader title={t("Moderasyon")} />

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["reviews", "complaints"] as const).map((key) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid",
                borderColor: active ? "var(--rezvix-primary)" : "var(--rezvix-border-strong)",
                background: active ? "var(--rezvix-primary)" : "var(--rezvix-bg-elevated)",
                color: active ? "#fff" : "var(--rezvix-text-muted)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
            >
              {key === "reviews" ? t("Yorumlar") : t("Şikayetler")}
            </button>
          );
        })}
      </div>

      {tab === "reviews" ? <ReviewsTable /> : <ComplaintsTable />}
    </div>
  );
}

// ── Reviews table ─────────────────────────────────────────────────────────────

function ReviewsTable() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: () => adminListReviews({ limit: 500 })
  });

  const hideMut = useMutation({
    mutationFn: (id: string) => adminHideReview(id),
    onSuccess: () => {
      showToast(t("Yorum gizlendi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });
  const unhideMut = useMutation({
    mutationFn: (id: string) => adminUnhideReview(id),
    onSuccess: () => {
      showToast(t("Yorum görünür yapıldı"), "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });
  const delMut = useMutation({
    mutationFn: (id: string) => adminDeleteReview(id),
    onSuccess: () => {
      showToast(t("Yorum silindi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    }
  });

  const rows = Array.isArray(q.data?.items) ? q.data.items : Array.isArray(q.data) ? q.data : [];

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>{t("Yorumlar")}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>{t("Tarih")}</th>
              <th style={thStyle}>{t("Restoran")}</th>
              <th style={thStyle}>{t("Kullanıcı")}</th>
              <th style={thStyle}>{t("Puan")}</th>
              <th style={thStyle}>{t("Yorum")}</th>
              <th style={thStyle}>{t("Durum")}</th>
              <th style={thStyle}>{t("Aksiyon")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r._id}>
                <td style={tdStyle}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</td>
                <td style={tdStyle}>{r.restaurant?.name || "-"}</td>
                <td style={tdStyle}>
                  {r.user?.name || "-"}{" "}
                  <span style={{ color: "var(--rezvix-text-soft)" }}>({r.user?.email || "-"})</span>
                </td>
                <td style={tdStyle}>{r.rating ?? "-"}</td>
                <td style={tdStyle}>{r.comment ?? "-"}</td>
                <td style={tdStyle}>{r.hidden ? t("Gizli") : t("Görünür")}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      style={{ ...ghostActionBtn, opacity: r.hidden ? 0.4 : 1, cursor: r.hidden ? "not-allowed" : "pointer" }}
                      onClick={() => hideMut.mutate(r._id)}
                      disabled={r.hidden}
                    >
                      {t("Gizle")}
                    </button>
                    <button
                      style={{ ...ghostActionBtn, opacity: !r.hidden ? 0.4 : 1, cursor: !r.hidden ? "not-allowed" : "pointer" }}
                      onClick={() => unhideMut.mutate(r._id)}
                      disabled={!r.hidden}
                    >
                      {t("Göster")}
                    </button>
                    <button
                      style={dangerActionBtn}
                      onClick={() => delMut.mutate(r._id)}
                    >
                      {t("Sil")}
                    </button>
                  </div>
                </td>
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
    </div>
  );
}

// ── Complaints table ──────────────────────────────────────────────────────────

function ComplaintsTable() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-complaints"],
    queryFn: () => adminListComplaints({ limit: 500 })
  });

  const resolveMut = useMutation({
    mutationFn: (id: string) => adminResolveComplaint(id),
    onSuccess: () => {
      showToast(t("Şikayet çözümlendi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
    }
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => adminDismissComplaint(id),
    onSuccess: () => {
      showToast(t("Şikayet reddedildi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
    }
  });

  const rows = Array.isArray(q.data?.items) ? q.data.items : Array.isArray(q.data) ? q.data : [];

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>{t("Şikayetler")}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ minWidth: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>{t("Tarih")}</th>
              <th style={thStyle}>{t("Restoran")}</th>
              <th style={thStyle}>{t("Kullanıcı")}</th>
              <th style={thStyle}>{t("Konu")}</th>
              <th style={thStyle}>{t("Durum")}</th>
              <th style={thStyle}>{t("Aksiyon")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c._id}>
                <td style={tdStyle}>{c.createdAt ? new Date(c.createdAt).toLocaleString() : "-"}</td>
                <td style={tdStyle}>{c.restaurant?.name || "-"}</td>
                <td style={tdStyle}>
                  {c.user?.name || "-"}{" "}
                  <span style={{ color: "var(--rezvix-text-soft)" }}>({c.user?.email || "-"})</span>
                </td>
                <td style={tdStyle}>{c.subject || "-"}</td>
                <td style={tdStyle}>{c.status || "-"}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      style={{
                        ...ghostActionBtn,
                        opacity: c.status === "resolved" ? 0.4 : 1,
                        cursor: c.status === "resolved" ? "not-allowed" : "pointer",
                      }}
                      onClick={() => resolveMut.mutate(c._id)}
                      disabled={c.status === "resolved"}
                    >
                      {t("Çöz")}
                    </button>
                    <button
                      style={{
                        ...ghostActionBtn,
                        opacity: c.status === "dismissed" ? 0.4 : 1,
                        cursor: c.status === "dismissed" ? "not-allowed" : "pointer",
                      }}
                      onClick={() => dismissMut.mutate(c._id)}
                      disabled={c.status === "dismissed"}
                    >
                      {t("Reddet")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={emptyTdStyle} colSpan={6}>{t("Kayıt yok")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
