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
import { Card } from "../../components/Card";
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
          <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("Genel KPI")}</h2>

          {/* Tarih seçimi */}
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">{t("Ön Ayar")}</label>
              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={kind}
                onChange={(e)=>setKind(e.target.value as RangeKind)}
              >
                <option value="today">{t("Bugün")}</option>
                <option value="week">{t("Bu Hafta")}</option>
                <option value="year">{t("Bu Yıl")}</option>
                <option value="custom">{t("Özel Aralık")}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">{t("Başlangıç")}</label>
              <input
                type="date"
                className="border rounded-lg px-3 py-2 text-sm"
                value={start}
                onChange={(e)=>{ setStart(e.target.value); setKind("custom"); }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">{t("Bitiş")}</label>
              <input
                type="date"
                className="border rounded-lg px-3 py-2 text-sm"
                value={end}
                onChange={(e)=>{ setEnd(e.target.value); setKind("custom"); }}
              />
            </div>
          </div>
        </div>

        {isLoading && <div>{t("Yükleniyor…")}</div>}
        {error && <div className="text-red-600 text-sm">{t("Veri alınamadı")}</div>}

        {/* KPI'lar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title={t("Toplam Rezervasyon")}><div className="text-2xl font-semibold">{total}</div></Card>
          <Card title={t("Onaylı")}><div className="text-2xl font-semibold">{counts.confirmed ?? 0}</div></Card>
          <Card title={t("İptal")}><div className="text-2xl font-semibold">{counts.cancelled ?? 0}</div></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title={t("Bekleyen")}><div className="text-2xl font-semibold">{counts.pending ?? 0}</div></Card>
          <Card title={t("Gelen")}><div className="text-2xl font-semibold">{counts.arrived ?? 0}</div></Card>
          <Card title={t("Gelmedi")}><div className="text-2xl font-semibold">{counts.no_show ?? 0}</div></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title={t("Toplam Ciro (₺)")}>
            <div className="text-2xl font-semibold">{Number(revenue || 0).toLocaleString("tr-TR")}</div>
          </Card>
          <Card title={t("Toplam Depozito (₺)")}>
            <div className="text-2xl font-semibold">{Number(deposits || 0).toLocaleString("tr-TR")}</div>
          </Card>
        </div>

        {/* ===== MODÜLLER ===== */}
        <div>
          <h2 className="text-lg font-semibold mb-3">{t("Modüller")}</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Paket Servis */}
            <Card title={t("Paket Servis 🛵")}>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t("Sipariş")}</div>
                <div className="text-2xl font-semibold">{modules?.delivery?.count ?? 0}</div>
                <div className="text-xs text-gray-500 mt-2">{t("Ciro (₺)")}</div>
                <div className="text-xl font-semibold">
                  {Number(modules?.delivery?.revenue ?? 0).toLocaleString("tr-TR")}
                </div>
              </div>
            </Card>

            {/* Market */}
            <Card title={t("Market 🛒")}>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t("Sipariş")}</div>
                <div className="text-2xl font-semibold">{modules?.market?.count ?? 0}</div>
                <div className="text-xs text-gray-500 mt-2">{t("Ciro (₺)")}</div>
                <div className="text-xl font-semibold">
                  {Number(modules?.market?.revenue ?? 0).toLocaleString("tr-TR")}
                </div>
              </div>
            </Card>

            {/* Taksi */}
            <Card title={t("Taksi 🚕")}>
              <div className="space-y-1">
                <div className="text-xs text-gray-500">{t("Yolculuk")}</div>
                <div className="text-2xl font-semibold">{modules?.taxi?.count ?? 0}</div>
                <div className="text-xs text-gray-500 mt-2">{t("Ciro (₺)")}</div>
                <div className="text-xl font-semibold">
                  {Number(modules?.taxi?.revenue ?? 0).toLocaleString("tr-TR")}
                </div>
              </div>
            </Card>
          </div>

          {/* Time-series chart */}
          {allEmpty ? (
            <div className="mt-4 text-sm text-gray-500">{t("Veri yok")}</div>
          ) : (
            <div className="mt-4 bg-white border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">{t("Modül Trendi")}</span>
                <div className="flex gap-1">
                  <button
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                      chartMetric === "revenue"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                    onClick={() => setChartMetric("revenue")}
                  >
                    {t("Ciro")}
                  </button>
                  <button
                    className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                      chartMetric === "count"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                    onClick={() => setChartMetric("count")}
                  >
                    {t("Sipariş Sayısı")}
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
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
