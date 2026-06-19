// pages/admin/Dashboard.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { api } from "../../api/client";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { useI18n } from "../../i18n";

type Counts = Partial<Record<"total"|"pending"|"confirmed"|"arrived"|"cancelled"|"no_show", number>>;
type KpiResp = {
  totals?: {
    reservations?: Counts;
    revenue?: number;
    deposits?: number;
  };
};

type SeriesPoint = { date: string; count: number; revenue: number };
type ModuleData = { count: number; revenue: number; byStatus: Record<string, number>; series: SeriesPoint[] };
type ModulesResp = {
  range?: unknown;
  delivery?: ModuleData;
  market?: ModuleData;
  taxi?: ModuleData;
};

type ChartMetric = "revenue" | "count";

type RangeKind = "today" | "week" | "year" | "custom";

function fmt(d: Date) { return d.toISOString().slice(0,10); }
function startOfWeekUTC(d = new Date()) {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}
function startOfYearUTC(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

async function fetchKpi(p: { start?: string; end?: string }): Promise<KpiResp> {
  const { data } = await api.get("/admin/kpi/global", { params: { start: p.start, end: p.end } });
  return (data || {}) as KpiResp;
}

function mergeSeriesByDate(
  delivery: SeriesPoint[],
  market: SeriesPoint[],
  taxi: SeriesPoint[],
): Array<{ date: string; delivery: number; market: number; taxi: number }> {
  const map = new Map<string, { delivery: number; market: number; taxi: number }>();

  const ensure = (date: string) => {
    if (!map.has(date)) map.set(date, { delivery: 0, market: 0, taxi: 0 });
    return map.get(date)!;
  };

  delivery.forEach((p) => { ensure(p.date).delivery = p.revenue; });
  market.forEach((p) => { ensure(p.date).market = p.revenue; });
  taxi.forEach((p) => { ensure(p.date).taxi = p.revenue; });

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

function mergeSeriesByDateCount(
  delivery: SeriesPoint[],
  market: SeriesPoint[],
  taxi: SeriesPoint[],
): Array<{ date: string; delivery: number; market: number; taxi: number }> {
  const map = new Map<string, { delivery: number; market: number; taxi: number }>();

  const ensure = (date: string) => {
    if (!map.has(date)) map.set(date, { delivery: 0, market: 0, taxi: 0 });
    return map.get(date)!;
  };

  delivery.forEach((p) => { ensure(p.date).delivery = p.count; });
  market.forEach((p) => { ensure(p.date).market = p.count; });
  taxi.forEach((p) => { ensure(p.date).taxi = p.count; });

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

// ── Shared inline style helpers ────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "16px 20px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--rezvix-text-soft)",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: "var(--rezvix-text-main)",
  lineHeight: 1.1,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--rezvix-text-muted)",
  marginBottom: 10,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
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

const metricBtnBase: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid var(--rezvix-border-strong)",
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
};

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{title}</div>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

// ── Module card ───────────────────────────────────────────────────────────────

function ModuleCard({
  title,
  countLabel,
  count,
  revenueLabel,
  revenue,
}: {
  title: string;
  countLabel: string;
  count: React.ReactNode;
  revenueLabel: string;
  revenue: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{title}</div>
      <div style={labelStyle}>{countLabel}</div>
      <div style={{ ...valueStyle, fontSize: 22, marginBottom: 10 }}>{count}</div>
      <div style={labelStyle}>{revenueLabel}</div>
      <div style={{ ...valueStyle, fontSize: 20 }}>{revenue}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [kind, setKind] = React.useState<RangeKind>("today");
  const [start, setStart] = React.useState<string>(() => fmt(new Date()));
  const [end, setEnd] = React.useState<string>(() => fmt(new Date()));
  const [chartMetric, setChartMetric] = React.useState<ChartMetric>("revenue");

  React.useEffect(() => {
    const today = new Date();
    if (kind === "today") {
      setStart(fmt(today));
      setEnd(fmt(today));
    } else if (kind === "week") {
      const s = startOfWeekUTC(today);
      setStart(fmt(s));
      setEnd(fmt(today));
    } else if (kind === "year") {
      const s = startOfYearUTC(today);
      setStart(fmt(s));
      setEnd(fmt(today));
    }
  }, [kind]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-kpi-global", start, end],
    queryFn: () => fetchKpi({ start, end })
  });

  const { data: modules } = useQuery<ModulesResp>({
    queryKey: ["admin-kpi-modules", start, end],
    queryFn: async () => (await api.get("/admin/kpi/modules", { params: { start, end } })).data,
  });

  const counts: Counts = data?.totals?.reservations || {};
  const revenue = data?.totals?.revenue || 0;
  const deposits = data?.totals?.deposits || 0;

  const total =
    counts.total ??
    ((counts.pending ?? 0) + (counts.confirmed ?? 0) + (counts.arrived ?? 0) + (counts.cancelled ?? 0) + (counts.no_show ?? 0));

  const deliverySeries = modules?.delivery?.series ?? [];
  const marketSeries = modules?.market?.series ?? [];
  const taxiSeries = modules?.taxi?.series ?? [];

  const allEmpty =
    deliverySeries.length === 0 &&
    marketSeries.length === 0 &&
    taxiSeries.length === 0;

  const chartData =
    chartMetric === "revenue"
      ? mergeSeriesByDate(deliverySeries, marketSeries, taxiSeries)
      : mergeSeriesByDateCount(deliverySeries, marketSeries, taxiSeries);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      {/* Header */}
      <AdminPageHeader
        title={t("Genel KPI")}
        actions={
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Ön Ayar")}</label>
              <select
                style={inputBase}
                value={kind}
                onChange={(e) => setKind(e.target.value as RangeKind)}
              >
                <option value="today">{t("Bugün")}</option>
                <option value="week">{t("Bu Hafta")}</option>
                <option value="year">{t("Bu Yıl")}</option>
                <option value="custom">{t("Özel Aralık")}</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Başlangıç")}</label>
              <input
                type="date"
                style={inputBase}
                value={start}
                onChange={(e) => { setStart(e.target.value); setKind("custom"); }}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--rezvix-text-soft)" }}>{t("Bitiş")}</label>
              <input
                type="date"
                style={inputBase}
                value={end}
                onChange={(e) => { setEnd(e.target.value); setKind("custom"); }}
              />
            </div>
          </div>
        }
      />

      {isLoading && (
        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 14 }}>{t("Yükleniyor…")}</div>
      )}
      {error && (
        <div style={{ color: "var(--rezvix-danger)", fontSize: 13 }}>{t("Veri alınamadı")}</div>
      )}

      {/* KPI grid — row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <KpiCard title={t("Toplam Rezervasyon")} value={total} />
        <KpiCard title={t("Onaylı")} value={counts.confirmed ?? 0} />
        <KpiCard title={t("İptal")} value={counts.cancelled ?? 0} />
      </div>

      {/* KPI grid — row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <KpiCard title={t("Bekleyen")} value={counts.pending ?? 0} />
        <KpiCard title={t("Gelen")} value={counts.arrived ?? 0} />
        <KpiCard title={t("Gelmedi")} value={counts.no_show ?? 0} />
      </div>

      {/* KPI grid — row 3 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <KpiCard
          title={t("Toplam Ciro (₺)")}
          value={Number(revenue || 0).toLocaleString("tr-TR")}
        />
        <KpiCard
          title={t("Toplam Depozito (₺)")}
          value={Number(deposits || 0).toLocaleString("tr-TR")}
        />
      </div>

      {/* Modules section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 700,
          color: "var(--rezvix-text-main)",
          letterSpacing: "-0.01em",
        }}>
          {t("Modüller")}
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <ModuleCard
            title={t("Paket Servis 🛵")}
            countLabel={t("Sipariş")}
            count={modules?.delivery?.count ?? 0}
            revenueLabel={t("Ciro (₺)")}
            revenue={Number(modules?.delivery?.revenue ?? 0).toLocaleString("tr-TR")}
          />
          <ModuleCard
            title={t("Market 🛒")}
            countLabel={t("Sipariş")}
            count={modules?.market?.count ?? 0}
            revenueLabel={t("Ciro (₺)")}
            revenue={Number(modules?.market?.revenue ?? 0).toLocaleString("tr-TR")}
          />
          <ModuleCard
            title={t("Taksi 🚕")}
            countLabel={t("Yolculuk")}
            count={modules?.taxi?.count ?? 0}
            revenueLabel={t("Ciro (₺)")}
            revenue={Number(modules?.taxi?.revenue ?? 0).toLocaleString("tr-TR")}
          />
        </div>

        {/* Time-series chart */}
        {allEmpty ? (
          <div style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>{t("Veri yok")}</div>
        ) : (
          <div style={{
            ...cardStyle,
            padding: "16px 20px",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--rezvix-text-main)" }}>
                {t("Modül Trendi")}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  style={{
                    ...metricBtnBase,
                    background: chartMetric === "revenue" ? "var(--rezvix-primary)" : "var(--rezvix-bg-elevated)",
                    color: chartMetric === "revenue" ? "#fff" : "var(--rezvix-text-muted)",
                    borderColor: chartMetric === "revenue" ? "var(--rezvix-primary)" : "var(--rezvix-border-strong)",
                  }}
                  onClick={() => setChartMetric("revenue")}
                >
                  {t("Ciro")}
                </button>
                <button
                  style={{
                    ...metricBtnBase,
                    background: chartMetric === "count" ? "var(--rezvix-primary)" : "var(--rezvix-bg-elevated)",
                    color: chartMetric === "count" ? "#fff" : "var(--rezvix-text-muted)",
                    borderColor: chartMetric === "count" ? "var(--rezvix-primary)" : "var(--rezvix-border-strong)",
                  }}
                  onClick={() => setChartMetric("count")}
                >
                  {t("Sipariş Sayısı")}
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rezvix-border-subtle)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--rezvix-text-soft)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--rezvix-text-soft)" }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="delivery"
                  name={t("Paket Servis")}
                  stroke="#C2410C"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="market"
                  name={t("Market")}
                  stroke="#15803D"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="taxi"
                  name={t("Taksi")}
                  stroke="#D97706"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
