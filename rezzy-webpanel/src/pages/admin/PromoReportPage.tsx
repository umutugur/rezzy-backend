// pages/admin/PromoReportPage.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getReport,
  getSettlement,
  type PromoReportParams,
} from "../../api/promoReports";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { useI18n } from "../../i18n";

type Tab = "pl" | "settlement";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfMonthUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function fmtMoney(val: number | string | undefined | null) {
  return `${Number(val ?? 0).toLocaleString("tr-TR", {
    maximumFractionDigits: 2,
  })} TL`;
}

// ── Style helpers (admin panel conventions) ────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--rezvix-text-muted)",
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const valueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: "var(--rezvix-text-main)",
  lineHeight: 1.1,
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

const tabBtnBase: React.CSSProperties = {
  padding: "8px 18px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--rezvix-text-soft)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--rezvix-border-subtle)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  color: "var(--rezvix-text-main)",
  borderBottom: "1px solid var(--rezvix-border-subtle)",
};

const tdNum: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  whiteSpace: "nowrap",
};

const thNum: React.CSSProperties = { ...thStyle, textAlign: "right" };

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 700,
  color: "var(--rezvix-text-main)",
  letterSpacing: "-0.01em",
};

// ── Sub components ──────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>
      {children}
    </label>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          ...tdStyle,
          textAlign: "center",
          color: "var(--rezvix-text-soft)",
          padding: "24px 12px",
        }}
      >
        {text}
      </td>
    </tr>
  );
}

function TableCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--rezvix-border-subtle)",
        }}
      >
        <span style={sectionTitle}>{title}</span>
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PromoReportPage() {
  const { t } = useI18n();
  const [tab, setTab] = React.useState<Tab>("pl");

  const [from, setFrom] = React.useState<string>(() =>
    fmtDate(startOfMonthUTC())
  );
  const [to, setTo] = React.useState<string>(() => fmtDate(new Date()));
  const [surface, setSurface] = React.useState<string>("");
  const [region, setRegion] = React.useState<string>("");

  const params: PromoReportParams = {
    from,
    to,
    surface: surface || undefined,
    region: region || undefined,
  };

  const reportQ = useQuery({
    queryKey: ["promo-report", from, to, surface, region],
    queryFn: () => getReport(params),
    enabled: tab === "pl",
  });

  const settlementQ = useQuery({
    queryKey: ["promo-settlement", from, to, surface, region],
    queryFn: () => getSettlement(params),
    enabled: tab === "settlement",
  });

  const totals = reportQ.data?.totals;
  const net = Number(totals?.net ?? 0);
  const netColor = net >= 0 ? "var(--rezvix-success)" : "var(--rezvix-danger)";

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}
    >
      <AdminPageHeader
        title={t("Promosyon Raporları")}
        subtitle={t("Kampanya kâr/zarar ve mutabakat")}
        actions={
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <FieldLabel>{t("Başlangıç")}</FieldLabel>
              <input
                type="date"
                style={inputBase}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <FieldLabel>{t("Bitiş")}</FieldLabel>
              <input
                type="date"
                style={inputBase}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <FieldLabel>{t("Yüzey")}</FieldLabel>
              <select
                style={inputBase}
                value={surface}
                onChange={(e) => setSurface(e.target.value)}
              >
                <option value="">{t("Tümü")}</option>
                <option value="reservation">{t("Rezervasyon")}</option>
                <option value="delivery">{t("Paket Servis")}</option>
                <option value="market">{t("Market")}</option>
                <option value="taxi">{t("Taksi")}</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <FieldLabel>{t("Bölge")}</FieldLabel>
              <input
                type="text"
                placeholder={t("Örn: TR")}
                style={{ ...inputBase, width: 110 }}
                value={region}
                onChange={(e) => setRegion(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          style={{
            ...tabBtnBase,
            background:
              tab === "pl" ? "var(--rezvix-primary)" : "var(--rezvix-bg-elevated)",
            color: tab === "pl" ? "#fff" : "var(--rezvix-text-muted)",
            borderColor:
              tab === "pl" ? "var(--rezvix-primary)" : "var(--rezvix-border-strong)",
          }}
          onClick={() => setTab("pl")}
        >
          {t("Kâr/Zarar")}
        </button>
        <button
          style={{
            ...tabBtnBase,
            background:
              tab === "settlement"
                ? "var(--rezvix-primary)"
                : "var(--rezvix-bg-elevated)",
            color: tab === "settlement" ? "#fff" : "var(--rezvix-text-muted)",
            borderColor:
              tab === "settlement"
                ? "var(--rezvix-primary)"
                : "var(--rezvix-border-strong)",
          }}
          onClick={() => setTab("settlement")}
        >
          {t("Mutabakat")}
        </button>
      </div>

      {/* ── KÂR/ZARAR ── */}
      {tab === "pl" && (
        <>
          {reportQ.isLoading && (
            <div style={{ color: "var(--rezvix-text-soft)", fontSize: 14 }}>
              {t("Yükleniyor…")}
            </div>
          )}
          {reportQ.error && (
            <div style={{ color: "var(--rezvix-danger)", fontSize: 13 }}>
              {t("Veri alınamadı")}
            </div>
          )}

          {/* KPI cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
            }}
          >
            <div style={cardStyle}>
              <div style={cardTitleStyle}>{t("Komisyon Geliri")}</div>
              <div style={valueStyle}>{fmtMoney(totals?.commission)}</div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>{t("Platform Kampanya Gideri")}</div>
              <div style={valueStyle}>
                {fmtMoney(totals?.platformContribution)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={cardTitleStyle}>{t("NET")}</div>
              <div style={{ ...valueStyle, color: netColor }}>
                {fmtMoney(net)}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: netColor,
                }}
              >
                {net >= 0
                  ? t("{amount} kâr", { amount: fmtMoney(net) })
                  : t("−{amount} zarar", { amount: fmtMoney(Math.abs(net)) })}
              </div>
            </div>
          </div>

          {/* Kampanya bazında */}
          <TableCard title={t("Kampanya bazında")}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("Kampanya")}</th>
                  <th style={thNum}>{t("Komisyon")}</th>
                  <th style={thNum}>{t("Platform Gideri")}</th>
                  <th style={thNum}>{t("Net")}</th>
                </tr>
              </thead>
              <tbody>
                {(reportQ.data?.byCampaign ?? []).length === 0 ? (
                  <EmptyRow colSpan={4} text={t("Kayıt bulunamadı")} />
                ) : (
                  (reportQ.data?.byCampaign ?? []).map((c) => {
                    const cNet = Number(c.net ?? 0);
                    return (
                      <tr key={c.campaignId}>
                        <td style={tdStyle}>{c.title}</td>
                        <td style={tdNum}>{fmtMoney(c.commission)}</td>
                        <td style={tdNum}>
                          {fmtMoney(c.platformContribution)}
                        </td>
                        <td
                          style={{
                            ...tdNum,
                            color:
                              cNet >= 0
                                ? "var(--rezvix-success)"
                                : "var(--rezvix-danger)",
                            fontWeight: 600,
                          }}
                        >
                          {fmtMoney(cNet)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableCard>

          {/* İşletme bazında */}
          <TableCard title={t("İşletme bazında")}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("İşletme")}</th>
                  <th style={thNum}>{t("Ciro")}</th>
                  <th style={thNum}>{t("Komisyon")}</th>
                  <th style={thNum}>{t("İşletme Katkısı")}</th>
                  <th style={thNum}>{t("Platform Katkısı")}</th>
                </tr>
              </thead>
              <tbody>
                {(reportQ.data?.byStore ?? []).length === 0 ? (
                  <EmptyRow colSpan={5} text={t("Kayıt bulunamadı")} />
                ) : (
                  (reportQ.data?.byStore ?? []).map((s) => (
                    <tr key={s.storeId}>
                      <td style={tdStyle}>{s.name}</td>
                      <td style={tdNum}>{fmtMoney(s.gross)}</td>
                      <td style={tdNum}>{fmtMoney(s.commission)}</td>
                      <td style={tdNum}>{fmtMoney(s.businessContribution)}</td>
                      <td style={tdNum}>{fmtMoney(s.platformContribution)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ── MUTABAKAT ── */}
      {tab === "settlement" && (
        <>
          {settlementQ.isLoading && (
            <div style={{ color: "var(--rezvix-text-soft)", fontSize: 14 }}>
              {t("Yükleniyor…")}
            </div>
          )}
          {settlementQ.error && (
            <div style={{ color: "var(--rezvix-danger)", fontSize: 13 }}>
              {t("Veri alınamadı")}
            </div>
          )}

          <div
            style={{
              ...cardStyle,
              fontSize: 13,
              color: "var(--rezvix-text-muted)",
              background: "var(--rezvix-bg-soft)",
            }}
          >
            {t(
              "Para transferi manuel yapılır; aşağıdaki tutarlar kime ne ödeneceğini gösterir."
            )}
          </div>

          {/* Businesses */}
          <TableCard title={t("İşletmeler")}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("İşletme")}</th>
                  <th style={thNum}>{t("Ciro")}</th>
                  <th style={thNum}>{t("Komisyon")}</th>
                  <th style={thNum}>{t("İşletme Katkısı")}</th>
                  <th style={thNum}>{t("Ödenecek (Hakediş)")}</th>
                </tr>
              </thead>
              <tbody>
                {(settlementQ.data?.businesses ?? []).length === 0 ? (
                  <EmptyRow colSpan={5} text={t("Kayıt bulunamadı")} />
                ) : (
                  (settlementQ.data?.businesses ?? []).map((b) => (
                    <tr key={b.storeId}>
                      <td style={tdStyle}>{b.name}</td>
                      <td style={tdNum}>{fmtMoney(b.gross)}</td>
                      <td style={tdNum}>{fmtMoney(b.commission)}</td>
                      <td style={tdNum}>{fmtMoney(b.businessContribution)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>
                        {fmtMoney(b.entitlement)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>

          {/* Drivers */}
          <TableCard title={t("Sürücüler")}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>{t("Sürücü")}</th>
                  <th style={thNum}>{t("Hakediş")}</th>
                  <th style={thNum}>{t("Nakit Açığı")}</th>
                  <th style={thNum}>{t("Yolculuk")}</th>
                </tr>
              </thead>
              <tbody>
                {(settlementQ.data?.drivers ?? []).length === 0 ? (
                  <EmptyRow colSpan={4} text={t("Kayıt bulunamadı")} />
                ) : (
                  (settlementQ.data?.drivers ?? []).map((d) => (
                    <tr key={d._id}>
                      <td style={tdStyle}>{d._id}</td>
                      <td style={tdNum}>{fmtMoney(d.driverEarning)}</td>
                      <td style={tdNum}>{fmtMoney(d.cashShortfall)}</td>
                      <td style={tdNum}>
                        {Number(d.rides ?? 0).toLocaleString("tr-TR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
    </div>
  );
}
