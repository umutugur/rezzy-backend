import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { authStore } from "../../store/auth";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { orgReports } from "../../api/marketOrgCatalog";
import { useI18n } from "../../i18n";

// ── Color palette (light, mirrors MarketReportsPage) ─────────────────────────
const C = {
  bg: "#f4f4f7",
  surface: "#ffffff",
  surfaceAlt: "#f1f3f9",
  border: "#e6e8ef",
  borderSoft: "#eef0f4",
  indigo: "#4f46e5",
  green: "#16a34a",
  amber: "#d97706",
  cyan: "#0891b2",
  text: "#1b1c22",
  muted: "#5b6172",
  faint: "#9aa1b1",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const money = (n: number) =>
  "₺" + (n ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#ffffff",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 12px 28px rgba(17,20,40,.12)",
      }}
    >
      {label != null && (
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
          {label}
        </div>
      )}
      {payload.map((p: any, i: number) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12.5,
            color: C.text,
            marginTop: i ? 3 : 0,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.color ?? p.fill,
            }}
          />
          <span style={{ color: C.muted }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>
            {p.dataKey === "revenue" ? money(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  icon, label, value, accent, delay,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
  delay: number;
}) {
  return (
    <div
      className="org-dash-kpi"
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
        animationDelay: `${delay}ms`,
        boxShadow: "0 1px 2px rgba(17,20,40,.04)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 90,
          height: 90,
          borderRadius: "50%",
          background: accent,
          opacity: 0.08,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: `${accent}1f`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          {icon}
        </div>
        <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div
        style={{
          color: C.text,
          fontSize: 27,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 1px 2px rgba(17,20,40,.04)",
        ...style,
      }}
    >
      <div
        style={{
          color: C.faint,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skel({ h, br = 12 }: { h: number; br?: number }) {
  return (
    <div
      className="org-dash-skel"
      style={{ height: h, borderRadius: br, marginBottom: 0 }}
    />
  );
}

// ── No-org empty state ────────────────────────────────────────────────────────
function NoOrgState({ t }: { t: (s: string) => string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.4 }}>🏢</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--rezvix-text-main)",
        }}
      >
        {t("Bir zincire bağlı değilsiniz")}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--rezvix-text-muted)",
          maxWidth: 360,
        }}
      >
        {t(
          "Bu paneli kullanabilmek için bir zincir organizasyonuna üye olmanız gerekmektedir.",
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrgDashboard() {
  const { t } = useI18n();
  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const today = new Date();
  const defaultFrom = fmt(addDays(today, -29));
  const defaultTo = fmt(today);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["org-reports", orgId, "dash"],
    queryFn: () => orgReports(orgId!, defaultFrom, defaultTo),
    enabled: !!orgId,
  });

  // Gap-filled timeseries for a continuous chart
  const series = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.timeseries.map((d) => [d.date, d]));
    const out: { date: string; label: string; revenue: number; orders: number }[] = [];
    let cur = new Date(defaultFrom + "T00:00:00");
    const end = new Date(defaultTo + "T00:00:00");
    let guard = 0;
    while (cur <= end && guard < 400) {
      const key = fmt(cur);
      const hit = map.get(key);
      out.push({
        date: key,
        label: `${pad(cur.getDate())}.${pad(cur.getMonth() + 1)}`,
        revenue: hit?.revenue ?? 0,
        orders: hit?.orders ?? 0,
      });
      cur = addDays(cur, 1);
      guard++;
    }
    return out;
  }, [data, defaultFrom, defaultTo]);

  if (!orgId) {
    return (
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          title={t("Genel Bakış")}
          subtitle={t("Zincir geneli performans")}
        />
        <NoOrgState t={t} />
      </div>
    );
  }

  const k = data?.kpis;
  const isEmpty = data && k && k.orders === 0;

  const topBranches = (data?.perBranch ?? [])
    .slice()
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const topProducts = (data?.topProducts ?? []).slice(0, 5);

  return (
    <div style={{ padding: 32, background: C.bg, minHeight: "100%" }}>
      <style>{`
        @keyframes orgDashUp {
          from { opacity: 0; transform: translateY(10px) }
          to   { opacity: 1; transform: none }
        }
        .org-dash-kpi {
          animation: orgDashUp .5s cubic-bezier(.16,1,.3,1) both;
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }
        .org-dash-kpi:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 26px rgba(17,20,40,.10);
          border-color: #d7dbe6;
        }
        .org-dash-sec { animation: orgDashUp .55s cubic-bezier(.16,1,.3,1) both }
        .org-dash-skel {
          background: linear-gradient(90deg,#eef0f4 25%,#f7f8fb 50%,#eef0f4 75%);
          background-size: 200% 100%;
          animation: orgDashShimmer 1.3s infinite;
        }
        @keyframes orgDashShimmer {
          from { background-position: 200% 0 }
          to   { background-position: -200% 0 }
        }
        .org-dash-row:hover { background: #f5f6fa }
      `}</style>

      <AdminPageHeader
        title={t("Genel Bakış")}
        subtitle={t("Zincir geneli performans")}
      />

      {isError && (
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: "60px 20px",
            textAlign: "center",
            color: "#dc2626",
          }}
        >
          {t("Veriler yüklenemedi.")}
        </div>
      )}

      {isLoading && (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <Skel key={i} h={108} br={16} />
            ))}
          </div>
          <Skel h={300} br={16} />
        </div>
      )}

      {isEmpty && (
        <div
          style={{
            background: C.surface,
            border: `1px dashed ${C.border}`,
            borderRadius: 16,
            padding: "72px 20px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.7 }}>📊</div>
          <div style={{ color: C.text, fontSize: 17, fontWeight: 600 }}>
            {t("Bu aralıkta veri yok")}
          </div>
          <div style={{ color: C.faint, fontSize: 13.5, marginTop: 6 }}>
            {t("Henüz sipariş bulunmuyor.")}
          </div>
        </div>
      )}

      {!isLoading && !isError && data && k && !isEmpty && (
        <>
          {/* KPI cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <KpiCard icon="💰" label={t("Ciro")} value={money(k.revenue)} accent={C.green} delay={0} />
            <KpiCard icon="🧾" label={t("Sipariş")} value={String(k.orders)} accent={C.indigo} delay={60} />
            <KpiCard icon="✅" label={t("Teslim Edilen")} value={String(k.delivered)} accent={C.cyan} delay={120} />
            <KpiCard icon="🛒" label={t("Ort. Sepet")} value={money(k.avgBasket)} accent={C.amber} delay={180} />
          </div>

          {/* Revenue / orders area chart */}
          <div className="org-dash-sec" style={{ animationDelay: "120ms", marginBottom: 18 }}>
            <SectionCard title={t("Gelir & Sipariş (Son 30 Gün)")}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart
                  data={series}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="odRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="odOrd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.indigo} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={C.border}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={{ stroke: C.border }}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    yAxisId="rev"
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={(v: number) => money(v)}
                  />
                  <YAxis
                    yAxisId="ord"
                    orientation="right"
                    tick={{ fontSize: 11, fill: C.faint }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    yAxisId="rev"
                    type="monotone"
                    dataKey="revenue"
                    name={t("Gelir")}
                    stroke={C.green}
                    strokeWidth={2.5}
                    fill="url(#odRev)"
                  />
                  <Area
                    yAxisId="ord"
                    type="monotone"
                    dataKey="orders"
                    name={t("Sipariş")}
                    stroke={C.indigo}
                    strokeWidth={2}
                    fill="url(#odOrd)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {/* Bottom two-column: Top branches + Top products */}
          <div
            className="org-dash-sec"
            style={{
              animationDelay: "200ms",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            {/* Top branches */}
            <SectionCard title={t("En İyi Şubeler")}>
              {topBranches.length ? (
                <div>
                  {topBranches.map((branch, i) => {
                    const max = topBranches[0].revenue || 1;
                    return (
                      <div
                        key={branch.storeId}
                        className="org-dash-row"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 8px",
                          borderRadius: 10,
                          borderBottom:
                            i < topBranches.length - 1
                              ? `1px solid ${C.borderSoft}`
                              : "none",
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            flexShrink: 0,
                            borderRadius: 8,
                            background:
                              i < 3 ? `${C.indigo}18` : C.surfaceAlt,
                            color: i < 3 ? C.indigo : C.faint,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: C.text,
                              fontSize: 13.5,
                              fontWeight: 600,
                              marginBottom: 5,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {branch.name}
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 3,
                              background: C.surfaceAlt,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.max(4, (branch.revenue / max) * 100)}%`,
                                background:
                                  "linear-gradient(90deg,#4f46e5,#16a34a)",
                                borderRadius: 3,
                              }}
                            />
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div
                            style={{
                              color: C.green,
                              fontWeight: 700,
                              fontSize: 13.5,
                            }}
                          >
                            {money(branch.revenue)}
                          </div>
                          <div style={{ color: C.faint, fontSize: 11.5 }}>
                            {branch.orders} {t("sipariş")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    color: C.faint,
                    fontSize: 13,
                    textAlign: "center",
                    padding: 30,
                  }}
                >
                  {t("Veri yok")}
                </div>
              )}
            </SectionCard>

            {/* Top products */}
            <SectionCard title={t("En Çok Satan Ürünler")}>
              {topProducts.length ? (
                <div>
                  {topProducts.map((p, i) => {
                    const max = topProducts[0].revenue || 1;
                    return (
                      <div
                        key={i}
                        className="org-dash-row"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "10px 8px",
                          borderRadius: 10,
                          borderBottom:
                            i < topProducts.length - 1
                              ? `1px solid ${C.borderSoft}`
                              : "none",
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            flexShrink: 0,
                            borderRadius: 8,
                            background:
                              i < 3 ? `${C.amber}22` : C.surfaceAlt,
                            color: i < 3 ? C.amber : C.faint,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {i + 1}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: C.text,
                              fontSize: 13.5,
                              fontWeight: 600,
                              marginBottom: 5,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.title}
                          </div>
                          <div
                            style={{
                              height: 4,
                              borderRadius: 3,
                              background: C.surfaceAlt,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${Math.max(4, (p.revenue / max) * 100)}%`,
                                background:
                                  "linear-gradient(90deg,#d97706,#4f46e5)",
                                borderRadius: 3,
                              }}
                            />
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div
                            style={{
                              color: C.green,
                              fontWeight: 700,
                              fontSize: 13.5,
                            }}
                          >
                            {money(p.revenue)}
                          </div>
                          <div style={{ color: C.faint, fontSize: 11.5 }}>
                            {p.qty} {t("adet")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    color: C.faint,
                    fontSize: 13,
                    textAlign: "center",
                    padding: 30,
                  }}
                >
                  {t("Veri yok")}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
