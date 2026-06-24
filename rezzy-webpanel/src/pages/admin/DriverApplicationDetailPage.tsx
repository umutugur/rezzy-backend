import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import {
  AppDoc,
  DriverDocRequirement,
  I18n,
  approveDriverApplication,
  getDriverApplication,
  rejectDriverApplication,
  reviewDriverApplicationDocument,
} from "../../api/driverApplications";
import { StatusBadge } from "./DriverApplicationsPage";

// ─── Helpers ───────────────────────────────────────────────────────────────────
function i18nLabel(i18n: I18n | undefined, fallback: string): string {
  if (!i18n) return fallback;
  return i18n.tr || i18n.en || i18n.ru || i18n.el || fallback;
}

function isImageUrl(url: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif)(\?|$)/i.test(url) || url.startsWith("data:image");
}
function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url) || url.startsWith("data:application/pdf");
}

function looksLikeIdCard(key: string): boolean {
  return /(id|kimlik|license|ehliyet|passport|pasaport|card)/i.test(key);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function DocStatusBadge({ status }: { status: AppDoc["status"] }) {
  const { t } = useI18n();
  const map: Record<AppDoc["status"], { bg: string; color: string; label: string }> = {
    pending: { bg: "rgba(217,119,6,0.12)", color: "#b45309", label: t("Bekliyor") },
    verified: { bg: "rgba(22,163,74,0.12)", color: "var(--rezvix-success)", label: t("Doğrulandı") },
    rejected: { bg: "rgba(220,38,38,0.1)", color: "var(--rezvix-danger)", label: t("Reddedildi") },
  };
  const s = map[status] ?? map.pending;
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
        background: s.bg,
        color: s.color,
      }}
    >
      <span style={{ fontSize: 8 }}>●</span>
      {s.label}
    </span>
  );
}

// ─── Document file preview ─────────────────────────────────────────────────────
function FilePreview({ url, alt }: { url: string; alt: string }) {
  const { t } = useI18n();
  if (!url) {
    return (
      <div style={{ ...previewBox, color: "var(--rezvix-text-soft)", fontSize: 13 }}>
        {t("Dosya yok")}
      </div>
    );
  }
  if (isImageUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={alt} style={{ ...previewBox, objectFit: "cover", cursor: "zoom-in" }} />
      </a>
    );
  }
  if (isPdfUrl(url)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <iframe title={alt} src={url} style={{ ...previewBox, height: 320, border: "1px solid var(--rezvix-border-subtle)" }} />
        <a href={url} target="_blank" rel="noreferrer" style={linkStyle}>
          {t("PDF'i yeni sekmede aç")}
        </a>
      </div>
    );
  }
  return (
    <div style={{ ...previewBox, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <a href={url} target="_blank" rel="noreferrer" style={linkStyle}>
        {t("Dosyayı aç")}
      </a>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function DriverApplicationDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { t } = useI18n();
  const nav = useNavigate();

  const queryKey = ["driver-application", id];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getDriverApplication(id),
    enabled: !!id,
  });

  const reviewMut = useMutation({
    mutationFn: (p: { key: string; status: "verified" | "rejected"; rejectReason?: string }) =>
      reviewDriverApplicationDocument(id, p.key, {
        status: p.status,
        rejectReason: p.rejectReason,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
    },
  });

  const approveMut = useMutation({
    mutationFn: () => approveDriverApplication(id),
    onSuccess: () => nav("/admin/driver-applications"),
  });

  const rejectMut = useMutation({
    mutationFn: (reason: string) => rejectDriverApplication(id, reason),
    onSuccess: () => nav("/admin/driver-applications"),
  });

  if (isLoading) {
    return <div style={{ padding: "32px 28px", color: "var(--rezvix-text-soft)" }}>{t("Yükleniyor…")}</div>;
  }
  if (error || !data?.application) {
    return (
      <div style={{ padding: "32px 28px" }}>
        <button onClick={() => nav("/admin/driver-applications")} style={btnGhost}>
          ← {t("Listeye dön")}
        </button>
        <div style={{ marginTop: 16, color: "var(--rezvix-danger)" }}>{t("Başvuru bulunamadı")}</div>
      </div>
    );
  }

  const app = data.application;
  const requirements = data.requirements ?? [];
  const reqByKey = new Map<string, DriverDocRequirement>(requirements.map((r) => [r.key, r]));

  // Compute approve eligibility: every required requirement must have a verified doc
  const docByKey = new Map<string, AppDoc>(app.documents.map((d) => [d.requirementKey, d]));
  const requiredReqs = requirements.filter((r) => r.required && r.isActive);
  const canApprove =
    requiredReqs.length > 0 &&
    requiredReqs.every((r) => docByKey.get(r.key)?.status === "verified");
  const isResolved = app.status === "approved" || app.status === "rejected";

  const handleReject = (key: string) => {
    const reason = window.prompt(t("Reddetme sebebi"));
    if (reason === null) return;
    reviewMut.mutate({ key, status: "rejected", rejectReason: reason.trim() || t("Belirtilmedi") });
  };

  const handleOverallReject = () => {
    const reason = window.prompt(t("Başvuruyu reddetme sebebi"));
    if (reason === null) return;
    rejectMut.mutate(reason.trim() || t("Belirtilmedi"));
  };

  // Order documents by their requirement order
  const orderedDocs = [...app.documents].sort((a, b) => {
    const oa = reqByKey.get(a.requirementKey)?.order ?? 999;
    const ob = reqByKey.get(b.requirementKey)?.order ?? 999;
    return oa - ob;
  });

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      <button onClick={() => nav("/admin/driver-applications")} style={{ ...btnGhost, marginBottom: 14 }}>
        ← {t("Başvurular")}
      </button>

      <AdminPageHeader
        title={app.user?.name ?? t("Sürücü Başvurusu")}
        subtitle={app.user?.email ?? "—"}
        actions={<StatusBadge status={app.status} />}
      />

      {app.status === "rejected" && app.rejectReason && (
        <div style={{ ...cardStyle, borderColor: "rgba(220,38,38,0.3)", marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--rezvix-danger)" }}>
            {t("Reddetme sebebi")}:
          </span>{" "}
          <span style={{ fontSize: 13.5, color: "var(--rezvix-text-main)" }}>{app.rejectReason}</span>
        </div>
      )}

      {/* Vehicle info + selfie */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 16, marginBottom: 20 }}>
        <div style={cardStyle}>
          <div style={sectionHeading}>{t("Araç Bilgileri")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <Info label={t("Plaka")} value={app.vehicle?.plate} mono />
            <Info label={t("Marka")} value={app.vehicle?.brand} />
            <Info label={t("Model")} value={app.vehicle?.model} />
            <Info label={t("Renk")} value={app.vehicle?.color} />
            <Info label={t("Tip")} value={app.vehicle?.type} />
            <Info label={t("Ülke")} value={app.countryCode} />
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--rezvix-text-soft)" }}>
            {t("Oluşturulma")}: {fmtDate(app.createdAt)} · {t("Güncellenme")}: {fmtDate(app.updatedAt)}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionHeading}>{t("Selfie")}</div>
          {app.selfieUrl ? (
            <a href={app.selfieUrl} target="_blank" rel="noreferrer">
              <img
                src={app.selfieUrl}
                alt={t("Selfie")}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "cover",
                  borderRadius: 12,
                  border: "1px solid var(--rezvix-border-subtle)",
                  cursor: "zoom-in",
                }}
              />
            </a>
          ) : (
            <div style={{ ...previewBox, color: "var(--rezvix-text-soft)", fontSize: 13 }}>
              {t("Selfie yok")}
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      <div style={sectionHeading}>{t("Belgeler")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {orderedDocs.length === 0 && (
          <div style={{ ...cardStyle, color: "var(--rezvix-text-soft)", fontSize: 13 }}>
            {t("Yüklenmiş belge yok")}
          </div>
        )}
        {orderedDocs.map((doc) => {
          const req = reqByKey.get(doc.requirementKey);
          const label = i18nLabel(req?.i18n, doc.requirementKey);
          const numberLabel = i18nLabel(req?.numberLabel, t("Numara"));
          const showSelfieBeside = looksLikeIdCard(doc.requirementKey) && !!app.selfieUrl;
          const busy = reviewMut.isPending;
          return (
            <div key={doc.requirementKey} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 14,
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
                    {label}
                  </span>
                  {req?.required && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--rezvix-danger)" }}>
                      {t("Zorunlu")}
                    </span>
                  )}
                </div>
                <DocStatusBadge status={doc.status} />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: showSelfieBeside ? "1fr 1fr" : "1fr",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                <div>
                  <div style={miniLabel}>{t("Belge")}</div>
                  <FilePreview url={doc.fileUrl} alt={label} />
                </div>
                {showSelfieBeside && (
                  <div>
                    <div style={miniLabel}>{t("Selfie (yüz karşılaştırma)")}</div>
                    <a href={app.selfieUrl} target="_blank" rel="noreferrer">
                      <img src={app.selfieUrl} alt={t("Selfie")} style={{ ...previewBox, objectFit: "cover", cursor: "zoom-in" }} />
                    </a>
                  </div>
                )}
              </div>

              {/* Meta */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 14 }}>
                {req?.number && (
                  <Info label={numberLabel} value={doc.number} mono />
                )}
                {req?.expiry && (
                  <Info label={t("Son geçerlilik")} value={doc.expiry ? fmtDate(doc.expiry) : "—"} />
                )}
              </div>

              {doc.status === "rejected" && doc.rejectReason && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--rezvix-danger)" }}>
                  {t("Red sebebi")}: {doc.rejectReason}
                </div>
              )}

              {/* Document actions */}
              {!isResolved && (
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button
                    onClick={() => reviewMut.mutate({ key: doc.requirementKey, status: "verified" })}
                    disabled={busy || doc.status === "verified"}
                    style={{
                      ...btnSuccess,
                      opacity: busy || doc.status === "verified" ? 0.5 : 1,
                      cursor: doc.status === "verified" ? "default" : "pointer",
                    }}
                  >
                    {t("Doğrula")}
                  </button>
                  <button
                    onClick={() => handleReject(doc.requirementKey)}
                    disabled={busy}
                    style={{ ...btnDanger, opacity: busy ? 0.5 : 1 }}
                  >
                    {t("Reddet")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer overall actions */}
      {!isResolved && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            marginTop: 24,
            padding: "16px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {!canApprove && (
            <span style={{ fontSize: 12.5, color: "var(--rezvix-text-soft)", marginRight: "auto" }}>
              {t("Onaylamak için tüm zorunlu belgeler doğrulanmalı")}
            </span>
          )}
          <button onClick={handleOverallReject} disabled={rejectMut.isPending} style={btnDanger}>
            {rejectMut.isPending ? t("İşleniyor...") : t("Başvuruyu Reddet")}
          </button>
          <button
            onClick={() => approveMut.mutate()}
            disabled={!canApprove || approveMut.isPending}
            style={{
              ...btnSuccess,
              padding: "10px 22px",
              fontSize: 14,
              opacity: !canApprove || approveMut.isPending ? 0.5 : 1,
              cursor: !canApprove ? "not-allowed" : "pointer",
            }}
          >
            {approveMut.isPending ? t("İşleniyor...") : t("Başvuruyu Onayla")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Small UI ──────────────────────────────────────────────────────────────────
function Info({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={miniLabel}>{label}</span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--rezvix-text-main)",
          fontFamily: mono ? "monospace" : undefined,
          letterSpacing: mono ? "0.04em" : undefined,
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

// ─── Shared styles ─────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1.5px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "20px 22px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const sectionHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--rezvix-text-soft)",
  marginBottom: 14,
};

const miniLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--rezvix-text-soft)",
  marginBottom: 6,
};

const previewBox: React.CSSProperties = {
  width: "100%",
  height: 240,
  borderRadius: 12,
  background: "var(--rezvix-bg-soft)",
  border: "1px solid var(--rezvix-border-subtle)",
  display: "block",
};

const linkStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--rezvix-primary)",
  textDecoration: "underline",
};

const btnGhost: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 10,
  background: "transparent",
  color: "var(--rezvix-text-muted)",
  fontSize: 13,
  fontWeight: 600,
  border: "1px solid var(--rezvix-border-strong)",
  cursor: "pointer",
};

const btnSuccess: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 10,
  background: "var(--rezvix-success)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 10,
  background: "rgba(220,38,38,0.08)",
  border: "1px solid rgba(220,38,38,0.25)",
  color: "var(--rezvix-danger)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
