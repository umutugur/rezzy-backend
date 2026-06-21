import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { authStore } from "../../store/auth";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { DataTable, type Column } from "../../desktop/components/admin/DataTable";
import { orgReports, type OrgReport } from "../../api/marketOrgCatalog";
import { useI18n } from "../../i18n";

// ── Color palette (light, mirrors MarketReportsPage) ─────────────────────────
const C = {
  bg: "#f4f4f7",
  surface: "#ffffff",
  surfaceAlt: "#f1f3f9",
  border: "#e6e8ef",
  borderSoft: "#eef0f4",
  indigo: "#4f46e5",
  indigoSoft: "#6366f1",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
  cyan: "#0891b2",
  text: "#1b1c22",
  muted: "#5b6172",
  faint: "#9aa1b1",
};

const STATUS = {
  pending:   { label: "Bekliyor",     color: "#94a3b8" },
  confirmed: { label: "Onaylandı",    color: "#6366f1" },
  preparing: { label: "Hazırlanıyor", color: "#0891b2" },
  ready:     { label: "Hazır",        color: "#d97706" },
  delivered: { label: "Teslim",       color: "#16a34a" },
  cancelled: { label: "İptal",        color: "#dc2626" },
} as Record<string, { label: string; color: string }>;

const PAYMENT = {
  cash:   { label: "Nakit",  color: "#16a34a" },
  card:   { label: "Kart",   color: "#4f46e5" },
  online: { label: "Online", color: "#0891b2" },
} as Record<string, { label: string; color: string }>;

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
const moneyFull = (n: number) =>
  "₺" + (n ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type Preset = "7d" | "30d" | "90d" | "custom";

function presetRange(p: Preset): { from: string; to: string } {
  const today = new Date();
  if (p === "7d")  return { from: fmt(addDays(today, -6)),  to: fmt(today) };
  if (p === "90d") return { from: fmt(addDays(today, -89)), to: fmt(today) };
  return { from: fmt(addDays(today, -29)), to: fmt(today) }; // 30d default
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, asMoney }: any) {
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
            {asMoney && p.dataKey === "revenue" ? moneyFull(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function SectionCard({
  title, children, style,
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
      className="or-skel"
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
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
        {t("Bir zincire bağlı değilsiniz")}
      </div>
      <div style={{ fontSize: 13, color: "var(--rezvix-text-muted)", maxWidth: 360 }}>
        {t("Bu paneli kullanabilmek için bir zincir organizasyonuna üye olmanız gerekmektedir.")}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OrgReports() {
  const { t } = useI18n();
  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState(presetRange("30d"));

  const range = preset === "custom" ? custom : presetRange(preset);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["org-reports", orgId, range.from, range.to],
    queryFn: () => orgReports(orgId!, range.from, range.to),
    enabled: !!orgId,
  });

  // Gap-filled timeseries
  const series = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.timeseries.map((d) => [d.date, d]));
    const out: { date: string; label: string; revenue: number; orders: number }[] = [];
    let cur = new Date(range.from + "T00:00:00");
    const end = new Date(range.to + "T00:00:00");
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
  }, [data, range.from, range.to]);

  const statusData = (data?.byStatus ?? []).map((s) => ({
    name: STATUS[s.status]?.label ?? s.status,
    value: s.count,
    color: STATUS[s.status]?.color ?? C.faint,
  }));

  const paymentData = (data?.byPayment ?? []).map((p) => ({
    name: PAYMENT[p.method]?.label ?? p.method,
    value: p.count,
    revenue: p.revenue,
    color: PAYMENT[p.method]?.color ?? C.indigo,
  }));

  const presetBtns: { key: Preset; label: string }[] = [
    { key: "7d",  label: t("Son 7 gün")  },
    { key: "30d", label: t("Son 30 gün") },
    { key: "90d", label: t("Son 90 gün") },
    { key: "custom", label: t("Özel")    },
  ];

  // DataTable columns for per-branch
  type BranchRow = OrgReport["perBranch"][number];
  const branchCols: Column<BranchRow>[] = [
    {
      key: "name",
      header: t("Şube"),
      render: (b) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "var(--rezvix-primary-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
              flexShrink: 0,
            }}
          >
            🏪
          </div>
          <span style={{ color: C.text, fontWeight: 600, fontSize: 13.5 }}>
            {b.name}
          </span>
        </div>
      ),
    },
    {
      key: "orders",
      header: t("Sipariş"),
      render: (b) => (
        <span style={{ color: C.indigo, fontWeight: 700 }}>{b.orders}</span>
      ),
    },
    {
      key: "revenue",
      header: t("Ciro"),
      render: (b) => (
        <span style={{ color: C.green, fontWeight: 700 }}>{money(b.revenue)}</span>
      ),
    },
  ];

  // DataTable columns for top products
  type ProductRow = OrgReport["topProducts"][number];
  const productCols: Column<ProductRow>[] = [
    {
      key: "title",
      header: t("Ürün"),
      render: (p) => (
        <span style={{ color: C.text, fontWeight: 600, fontSize: 13.5 }}>
          {p.title}
        </span>
      ),
    },
    {
      key: "qty",
      header: t("Adet"),
      render: (p) => (
        <span style={{ color: C.amber, fontWeight: 700 }}>{p.qty}</span>
      ),
    },
    {
      key: "revenue",
      header: t("Ciro"),
      render: (p) => (
        <span style={{ color: C.green, fontWeight: 700 }}>{money(p.revenue)}</span>
      ),
    },
  ];

  if (!orgId) {
    return (
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          title={t("Raporlar")}
          subtitle={t("Zincir geneli raporlar ve analizler")}
        />
        <NoOrgState t={t} />
      </div>
    );
  }

  const isEmpty = data && data.kpis.orders === 0;

  return (
    <div style={{ padding: 32, background: C.bg, minHeight: "100%" }}>
      <style>{`
        @keyframes orUp {
          from { opacity: 0; transform: translateY(10px) }
          to   { opacity: 1; transform: none }
        }
        .or-sec { animation: orUp .5s cubic-bezier(.16,1,.3,1) both }
        .or-skel {
          background: linear-gradient(90deg,#eef0f4 25%,#f7f8fb 50%,#eef0f4 75%);
          background-size: 200% 100%;
          animation: orShimmer 1.3s infinite;
        }
        @keyframes orShimmer {
          from { background-position: 200% 0 }
          to   { background-position: -200% 0 }
        }
        .or-seg { transition: background .15s ease, color .15s ease }
        .or-date {
          background: #ffffff;
          border: 1px solid #e6e8ef;
          color: #1b1c22;
          border-radius: 9px;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
          color-scheme: light;
        }
      `}</style>

      {/* Header + date range */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <AdminPageHeader
          title={t("Raporlar")}
          subtitle={t("Zincir geneli raporlar ve analizler")}
        />

        <div
          style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
        >
          {/* Preset segment */}
          <div
            style={{
              display: "flex",
              gap: 3,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 11,
              padding: 3,
              boxShadow: "0 1px 2px rgba(17,20,40,.04)",
            }}
          >
            {presetBtns.map((b) => {
              const on = preset === b.key;
              return (
                <button
                  key={b.key}
                  className="or-seg"
                  onClick={() => setPreset(b.key)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 700,
                    background: on
                      ? "linear-gradient(135deg,#4f46e5,#6366f1)"
                      : "transparent",
                    color: on ? "#fff" : C.muted,
                    boxShadow: on
                      ? "0 4px 12px rgba(79,70,229,.28)"
                      : "none",
                  }}
                >
                  {b.label}
                </button>
              );
            })}
          </div>

          {preset === "custom" && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                className="or-date"
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={(e) =>
                  setCustom((c) => ({ ...c, from: e.target.value }))
                }
              />
              <span style={{ color: C.faint }}>—</span>
              <input
                className="or-date"
                type="date"
                value={custom.to}
                min={custom.from}
                max={fmt(new Date())}
                onChange={(e) =>
                  setCustom((c) => ({ ...c, to: e.target.value }))
                }
              />
            </div>
          )}
        </div>
      </div>

      {isError && (
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: "60px 20px",
            textAlign: "center",
            color: C.red,
          }}
        >
          {t("Rapor yüklenemedi.")}
        </div>
      )}

      {isLoading && (
        <div>
          <Skel h={300} br={16} />
          <div style={{ height: 14 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <Skel h={280} br={16} />
            <Skel h={280} br={16} />
          </div>
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
          <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.7 }}>
            📈
          </div>
          <div style={{ color: C.text, fontSize: 17, fontWeight: 600 }}>
            {t("Bu aralıkta veri yok")}
          </div>
          <div style={{ color: C.faint, fontSize: 13.5, marginTop: 6 }}>
            {t("Farklı bir tarih aralığı deneyin.")}
          </div>
        </div>
      )}

      {!isLoading && !isError && data && !isEmpty && (
        <>
          {/* Revenue / orders timeseries */}
          <div
            className="or-sec"
            style={{ animationDelay: "0ms", marginBottom: 18 }}
          >
            <SectionCard title={t("Gelir & Sipariş")}>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart
                  data={series}
                  margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="orRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="orOrd" x1="0" y1="0" x2="0" y2="1">
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
                  <Tooltip content={<ChartTooltip asMoney />} />
                  <Area
                    yAxisId="rev"
                    type="monotone"
                    dataKey="revenue"
                    name={t("Gelir")}
                    stroke={C.green}
                    strokeWidth={2.5}
                    fill="url(#orRev)"
                  />
                  <Area
                    yAxisId="ord"
                    type="monotone"
                    dataKey="orders"
                    name={t("Sipariş")}
                    stroke={C.indigo}
                    strokeWidth={2}
                    fill="url(#orOrd)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </SectionCard>
          </div>

          {/* Per-branch bar chart + table */}
          <div
            className="or-sec"
            style={{ animationDelay: "80ms", marginBottom: 18 }}
          >
            <SectionCard title={t("Şube Karşılaştırması")}>
              {data.perBranch.length ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={data.perBranch}
                      margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={C.border}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: C.faint }}
                        axisLine={{ stroke: C.border }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: C.faint }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => money(v)}
                      />
                      <Tooltip
                        content={<ChartTooltip asMoney />}
                        cursor={{ fill: "rgba(79,70,229,.06)" }}
                      />
                      <Bar
                        dataKey="revenue"
                        name={t("Ciro")}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={56}
                      >
                        {data.perBranch.map((_, i) => (
                          <Cell
                            key={i}
                            fill={
                              i % 2 === 0 ? C.indigo : C.indigoSoft
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ marginTop: 16 }}>
                    <DataTable<BranchRow>
                      columns={branchCols}
                      rows={data.perBranch}
                      rowKey={(b) => b.storeId}
                      loading={false}
                      emptyText={t("Şube bulunamadı.")}
                    />
                  </div>
                </>
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

          {/* Status donut + Payment bars */}
          {(statusData.length > 0 || paymentData.length > 0) && (
            <div
              className="or-sec"
              style={{
                animationDelay: "160ms",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
                marginBottom: 18,
              }}
            >
              {/* Status donut */}
              <SectionCard title={t("Durum Dağılımı")}>
                {statusData.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={statusData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={72}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {statusData.map((d, i) => (
                            <Cell key={i} fill={d.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px 14px",
                        marginTop: 6,
                      }}
                    >
                      {statusData.map((d, i) => (
                        <span
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            color: C.muted,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 2,
                              background: d.color,
                            }}
                          />
                          {d.name}{" "}
                          <b style={{ color: C.text }}>{d.value}</b>
                        </span>
                      ))}
                    </div>
                  </>
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

              {/* Payment bars */}
              <SectionCard title={t("Ödeme Yöntemi")}>
                {paymentData.length ? (
                  <ResponsiveContainer width="100%" height={232}>
                    <BarChart
                      data={paymentData}
                      margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={C.border}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: C.faint }}
                        axisLine={{ stroke: C.border }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: C.faint }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<ChartTooltip />}
                        cursor={{ fill: "rgba(79,70,229,.06)" }}
                      />
                      <Bar
                        dataKey="value"
                        name={t("Sipariş")}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={56}
                      >
                        {paymentData.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
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
          )}

          {/* Top products table */}
          <div
            className="or-sec"
            style={{ animationDelay: "240ms", marginBottom: 18 }}
          >
            <SectionCard title={t("Ürün Performansı")}>
              {data.topProducts.length ? (
                <DataTable<ProductRow>
                  columns={productCols}
                  rows={data.topProducts}
                  rowKey={(p) => p.title}
                  loading={false}
                  emptyText={t("Ürün bulunamadı.")}
                />
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
