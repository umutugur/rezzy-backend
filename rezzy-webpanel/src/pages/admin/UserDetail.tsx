import React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import {
  adminGetUser,
  adminBanUser,
  adminUnbanUser,
  adminUpdateUserRole,
  adminGetUserRiskHistory
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { useI18n, t as i18nT } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

const TYPE_LABEL: Record<string, string> = {
  NO_SHOW: "Gelmedi",
  LATE_CANCEL: "Geç iptal",
  UNDER_ATTEND: "Eksik katılım",
  GOOD_ATTEND: "İyi katılım",
};

// ── Shared style helpers ──────────────────────────────────────────────────────
const inputCls = "border rounded-lg px-3 py-2 bg-white text-sm";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "var(--rezvix-text-soft)",
  marginBottom: 4,
};

const primaryBtn: React.CSSProperties = {
  padding: "7px 16px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  background: "var(--rezvix-primary)",
  color: "#fff",
  transition: "opacity 0.15s ease",
};

const dangerBtn: React.CSSProperties = {
  padding: "7px 16px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  background: "var(--rezvix-danger)",
  color: "#fff",
  transition: "opacity 0.15s ease",
};

const secondaryBtn: React.CSSProperties = {
  padding: "7px 16px",
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-soft)",
  color: "var(--rezvix-text-muted)",
  fontSize: 13,
  cursor: "pointer",
  fontWeight: 500,
};

const tableHeaderStyle: React.CSSProperties = {
  padding: "10px 16px",
  paddingRight: 16,
  color: "var(--rezvix-text-soft)",
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  background: "var(--rezvix-bg-soft)",
  textAlign: "left",
};

const statCardStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid var(--rezvix-border-subtle)",
  background: "var(--rezvix-bg-elevated)",
};

// Risk incident badge style
function riskBadgeStyle(type: string): React.CSSProperties {
  if (type === "NO_SHOW")
    return {
      display: "inline-block",
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 999,
      background: "rgba(220, 38, 38, 0.10)",
      color: "var(--rezvix-danger)",
      border: "1px solid rgba(220, 38, 38, 0.20)",
    };
  if (type === "LATE_CANCEL")
    return {
      display: "inline-block",
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 999,
      background: "rgba(245, 158, 11, 0.12)",
      color: "#b45309",
      border: "1px solid rgba(245, 158, 11, 0.22)",
    };
  if (type === "UNDER_ATTEND")
    return {
      display: "inline-block",
      fontSize: 11,
      padding: "2px 8px",
      borderRadius: 999,
      background: "rgba(245, 158, 11, 0.10)",
      color: "#92400e",
      border: "1px solid rgba(245, 158, 11, 0.20)",
    };
  // GOOD_ATTEND
  return {
    display: "inline-block",
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    background: "rgba(22, 163, 74, 0.10)",
    color: "var(--rezvix-success)",
    border: "1px solid rgba(22, 163, 74, 0.20)",
  };
}

export default function AdminUserDetailPage() {
  const { uid = "" } = useParams();
  const qc = useQueryClient();
  const { t } = useI18n();

  const uQ = useQuery({
    queryKey: ["admin-user", uid],
    queryFn: () => adminGetUser(uid),
    enabled: !!uid
  });

  // ---- Ban form state
  const [banReason, setBanReason] = React.useState("");
  const [banUntil, setBanUntil] = React.useState(""); // YYYY-MM-DD

  const banMut = useMutation({
    mutationFn: () =>
      adminBanUser(uid, {
        reason: banReason.trim(),
        bannedUntil: banUntil ? new Date(banUntil).toISOString() : undefined
      }),
    onSuccess: () => {
      showToast(t("Kullanıcı banlandı"), "success");
      setBanReason("");
      setBanUntil("");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
      qc.invalidateQueries({ queryKey: ["admin-user-risk", uid] });
    }
  });

  const unbanMut = useMutation({
    mutationFn: () => adminUnbanUser(uid),
    onSuccess: () => {
      showToast(t("Ban kaldırıldı"), "success");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
      qc.invalidateQueries({ queryKey: ["admin-user-risk", uid] });
    }
  });

  const user = (uQ.data as any)?.user ?? uQ.data;

  const [role, setRole] = React.useState("customer");
  React.useEffect(() => {
    if (user?.role) setRole(user.role);
  }, [user?.role]);

  const roleMut = useMutation({
    mutationFn: () => adminUpdateUserRole(uid, role as any),
    onSuccess: () => {
      showToast(t("Rol güncellendi"), "success");
      qc.invalidateQueries({ queryKey: ["admin-user", uid] });
    }
  });

  // -----------------------------
  // Risk geçmişi
  // -----------------------------
  const [start, setStart] = React.useState<string>("");
  const [end, setEnd] = React.useState<string>("");
  const [limit, setLimit] = React.useState<number>(100);

  const riskQ = useQuery({
    queryKey: ["admin-user-risk", uid, start, end, limit],
    queryFn: () =>
      adminGetUserRiskHistory(uid, {
        start: start || undefined,
        end: end || undefined,
        limit
      }),
    enabled: !!uid
  });

  const fmtDateTime = (v?: string) => {
    if (!v) return i18nT("-");
    try {
      const d = new Date(v);
      return d.toLocaleString();
    } catch {
      return v!;
    }
  };

  const riskScore = riskQ.data?.snapshot?.riskScore ?? 0;

  return (
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={t("Kullanıcı Detayı")}
        subtitle={user?.name || user?.email || ""}
      />

      <Card title={t("Bilgiler")}>
        {uQ.isLoading ? (
          <span style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>
            {t("Yükleniyor…")}
          </span>
        ) : uQ.error ? (
          <div style={{ color: "var(--rezvix-danger)", fontSize: 13 }}>
            {t("Kullanıcı bilgileri alınamadı.")}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { label: t("Ad"), val: user?.name || t("-") },
              { label: t("E-posta"), val: user?.email || t("-") },
              { label: t("Telefon"), val: user?.phone || t("-") },
              { label: t("Rol"), val: user?.role || t("-") },
              {
                label: t("Durum"),
                val: user?.banned ? t("Banlı") : t("Aktif"),
              },
            ].map(({ label, val }) => (
              <div key={label}>
                <span
                  style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}
                >
                  {label}
                </span>
                <div style={{ color: "var(--rezvix-text-main)", fontSize: 14 }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ marginTop: 20 }}>
        <Card title={t("İşlemler")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Ban formu */}
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label style={labelStyle}>{t("Ban Sebebi *")}</label>
                <input
                  type="text"
                  className={`${inputCls} w-full`}
                  placeholder={t("Örn: Son 3 rezervasyonda no-show")}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Bitiş (opsiyonel)")}</label>
                <input
                  type="date"
                  className={`${inputCls} w-full`}
                  value={banUntil}
                  onChange={(e) => setBanUntil(e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 12,
              }}
            >
              <button
                style={{
                  ...dangerBtn,
                  opacity:
                    banMut.isPending ||
                    uQ.isLoading ||
                    user?.banned ||
                    banReason.trim().length === 0
                      ? 0.5
                      : 1,
                  cursor:
                    banMut.isPending ||
                    uQ.isLoading ||
                    user?.banned ||
                    banReason.trim().length === 0
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={() => banMut.mutate()}
                disabled={
                  banMut.isPending ||
                  uQ.isLoading ||
                  user?.banned ||
                  banReason.trim().length === 0
                }
                title={banReason.trim() ? "" : t("Sebep gerekli")}
              >
                {t("Banla")}
              </button>

              <button
                style={{
                  ...secondaryBtn,
                  opacity:
                    unbanMut.isPending || uQ.isLoading || !user?.banned
                      ? 0.5
                      : 1,
                  cursor:
                    unbanMut.isPending || uQ.isLoading || !user?.banned
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={() => unbanMut.mutate()}
                disabled={unbanMut.isPending || uQ.isLoading || !user?.banned}
              >
                {t("Banı Kaldır")}
              </button>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 8,
                }}
              >
                <div>
                  <label style={labelStyle}>{t("Rol")}</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={inputCls}
                  >
                    <option value="customer">{t("Müşteri")}</option>
                    <option value="restaurant">{t("Restaurant")}</option>
                    <option value="admin">{t("Admin")}</option>
                  </select>
                </div>
                <button
                  style={{
                    ...primaryBtn,
                    opacity:
                      roleMut.isPending || uQ.isLoading ? 0.5 : 1,
                  }}
                  onClick={() => roleMut.mutate()}
                  disabled={roleMut.isPending || uQ.isLoading}
                >
                  {t("Rolü Kaydet")}
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* RİSK ÖZETİ */}
      <div style={{ marginTop: 20 }}>
        <Card title={t("Risk Özeti")}>
          {riskQ.isLoading ? (
            <span style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>
              {t("Yükleniyor…")}
            </span>
          ) : riskQ.error ? (
            <div style={{ color: "var(--rezvix-danger)", fontSize: 13 }}>
              {t("Risk verisi alınamadı.")}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <div style={statCardStyle}>
                <div style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                  {t("Risk Skoru")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "var(--rezvix-text-main)",
                    }}
                  >
                    {riskScore}
                  </div>
                  {riskScore >= 75 && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "rgba(220, 38, 38, 0.10)",
                        color: "var(--rezvix-danger)",
                        border: "1px solid rgba(220, 38, 38, 0.20)",
                      }}
                    >
                      {t("Yüksek risk")}
                    </span>
                  )}
                </div>
              </div>
              <div style={statCardStyle}>
                <div style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                  {t("No-show Sayısı")}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: "var(--rezvix-text-main)",
                  }}
                >
                  {riskQ.data?.snapshot?.noShowCount ?? 0}
                </div>
              </div>
              <div style={statCardStyle}>
                <div style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                  {t("Ban Durumu")}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: "var(--rezvix-text-main)",
                  }}
                >
                  {riskQ.data?.snapshot?.banned ? t("Banlı") : t("Aktif")}
                </div>
                {riskQ.data?.snapshot?.bannedUntil && (
                  <div
                    style={{ fontSize: 11, color: "var(--rezvix-text-soft)", marginTop: 4 }}
                  >
                    {fmtDateTime(riskQ.data.snapshot.bannedUntil)}
                  </div>
                )}
              </div>

              <div className="md:col-span-3 grid md:grid-cols-4 gap-4">
                {[
                  {
                    label: t("İyi Katılım Serisi"),
                    val: riskQ.data?.snapshot?.consecutiveGoodShows ?? 0,
                  },
                  {
                    label: t("Pencere (gün)"),
                    val: riskQ.data?.snapshot?.windowDays ?? 180,
                  },
                  {
                    label: t("Ağırlık Çarpanı"),
                    val: riskQ.data?.snapshot?.multiplier ?? 25,
                  },
                  {
                    label: t("Ban Nedeni"),
                    val: riskQ.data?.snapshot?.banReason || t("-"),
                    small: true,
                  },
                ].map(({ label, val, small }) => (
                  <div key={label} style={statCardStyle}>
                    <div
                      style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: small ? 14 : 20,
                        fontWeight: 700,
                        color: "var(--rezvix-text-main)",
                      }}
                    >
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* RİSK OLAYLARI */}
      <div style={{ marginTop: 20 }}>
        <Card title={t("Risk Olayları")}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div>
                <label
                  style={{ ...labelStyle, fontSize: 11 }}
                >
                  {t("Başlangıç")}
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <label
                  style={{ ...labelStyle, fontSize: 11 }}
                >
                  {t("Bitiş")}
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
              <div>
                <label
                  style={{ ...labelStyle, fontSize: 11 }}
                >
                  {t("Limit")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className={`${inputCls} w-24`}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value || 100))}
                />
              </div>
            </div>
          </div>

          {riskQ.isLoading ? (
            <span style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>
              {t("Yükleniyor…")}
            </span>
          ) : !riskQ.data?.incidents?.length ? (
            <div style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>
              {t("Kayıt bulunamadı.")}
            </div>
          ) : (
            <div style={{ overflow: "auto" }}>
              <table
                style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}
              >
                <thead>
                  <tr>
                    {[t("Tarih"), t("Tip"), t("Ağırlık"), t("Rezervasyon")].map(
                      (h) => (
                        <th
                          key={h}
                          style={{ ...tableHeaderStyle, paddingRight: 16 }}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {riskQ.data.incidents.map((it, idx) => {
                    const tooltip =
                      it.type === "NO_SHOW"
                        ? t("No-show: +25")
                        : it.type === "LATE_CANCEL"
                        ? t("Geç iptal: +12.5")
                        : it.type === "UNDER_ATTEND"
                        ? t("Eksik katılım: oran*25*0.25")
                        : t("İyi katılım: -2.5");

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderTop: "1px solid var(--rezvix-border-subtle)",
                        }}
                      >
                        <td
                          style={{
                            padding: "10px 16px",
                            paddingRight: 16,
                            color: "var(--rezvix-text-main)",
                          }}
                        >
                          {fmtDateTime(it.at)}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            paddingRight: 16,
                          }}
                        >
                          <span style={riskBadgeStyle(it.type)} title={tooltip}>
                            {t(TYPE_LABEL[it.type] ?? it.type)}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            paddingRight: 16,
                            color: "var(--rezvix-text-main)",
                          }}
                        >
                          {it.weight}
                        </td>
                        <td
                          style={{
                            padding: "10px 16px",
                            paddingRight: 16,
                          }}
                        >
                          {it.reservationId ? (
                            <a
                              style={{
                                color: "var(--rezvix-primary)",
                                textDecoration: "underline",
                              }}
                              href={`/admin/reservations?reservationId=${it.reservationId}`}
                              title={t("Rezervasyon listesinde aç")}
                            >
                              {t("Rezervasyonu aç")}{" "}
                              <code
                                style={{
                                  fontSize: 11,
                                  marginLeft: 4,
                                  color: "var(--rezvix-text-soft)",
                                }}
                              >
                                {it.reservationId}
                              </code>
                            </a>
                          ) : (
                            <span style={{ color: "var(--rezvix-text-soft)" }}>
                              {t("-")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
