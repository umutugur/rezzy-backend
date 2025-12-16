import React, { useMemo, useState } from "react";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore, MeUser } from "../../store/auth";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  orgGetSummary,
  orgGetTimeseries,
  orgGetTopRestaurants,
} from "../../api/orgAnalytics";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

type OrgLite = {
  id: string;
  name: string;
  region?: string | null;
  role?: string;
};

function getUserOrganizations(u: MeUser | null): OrgLite[] {
  if (!u || !Array.isArray((u as any).organizations)) return [];
  return (u as any).organizations
    .map((o: any) => {
      const id =
        o.id ||
        o.organization?._id ||
        o.organizationId ||
        o.organization ||
        o._id ||
        null;
      if (!id) return null;

      return {
        id: String(id),
        name: o.name || o.organizationName || "İsimsiz Organizasyon",
        region: o.region ?? null,
        role: o.role,
      };
    })
    .filter(Boolean) as OrgLite[];
}

function prettyOrgRole(role?: string) {
  if (!role) return "-";
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_admin":
      return "Admin";
    case "org_finance":
      return "Finans";
    case "org_staff":
      return "Staff";
    default:
      return role;
  }
}

function mapRegionToCurrency(region?: string | null): "GBP" | "TRY" | "EUR" {
  const r = String(region || "").trim().toUpperCase();
  if (r === "UK" || r === "GBnGB") return "GBP"; // (typo-safe değil; aşağıda sağlamını da koydum)
  if (r === "UK" || r === "GB") return "GBP";
  if (r === "TR" || r === "TURKEY") return "TRY";
  if (r === "CY" || r === "KKTC") return "EUR"; // istersen TRY yaparız
  return "TRY";
}

function mapCurrencyToLocale(c: string): string {
  const cur = String(c || "").toUpperCase();
  if (cur === "GBP") return "en-GB";
  if (cur === "EUR") return "en-IE";
  return "tr-TR";
}

function fmtMoney(n: any, currency: string, locale: string) {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${v} ${currency}`;
  }
}
function fmtInt(n: any, locale: string) {
  const v = Number(n || 0);
  return new Intl.NumberFormat(locale).format(v);
}
function pct(n: number) {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function labelOfPreset(p: string) {
  switch (p) {
    case "day":
      return "Günlük";
    case "week":
      return "Haftalık";
    case "month":
      return "Aylık";
    case "year":
      return "Yıllık";
    default:
      return p;
  }
}

type Metric =
  | "sales"
  | "orders"
  | "reservations"
  | "no_show"
  | "cancelled"
  | "deposits";

function metricLabel(m: Metric, currency: string) {
  switch (m) {
    case "sales":
      return `Satış (${currency})`;
    case "orders":
      return "Sipariş (adet)";
    case "reservations":
      return "Rezervasyon (adet)";
    case "no_show":
      return "No-show (adet)";
    case "cancelled":
      return "İptal (adet)";
    case "deposits":
      return `Depozito (${currency})`;
    default:
      return m;
  }
}

// --- Demo data (DB boşken bile iyi görünmesi için) ---
function makeDemoTimeseries(metric: Metric, days = 14) {
  const now = new Date();
  const pts: Array<{ t: string; value: number }> = [];
  const base =
    metric === "sales" || metric === "deposits"
      ? 2400
      : metric === "orders"
      ? 120
      : metric === "reservations"
      ? 40
      : metric === "no_show"
      ? 4
      : 6;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const noise = Math.sin(i / 2) * 0.18 + (Math.random() - 0.5) * 0.22;
    const v = Math.max(0, Math.round(base * (1 + noise)));
    pts.push({ t: d.toISOString(), value: v });
  }
  return pts;
}

function makeDemoTop(metric: "sales" | "orders" | "reservations") {
  const names = [
    "Karya Bistro - Highmspark",
    "Karya Bistro - London",
    "Karya Bistro - Manchester",
    "Karya Bistro - Cambridge",
    "Karya Bistro - Leeds",
  ];
  return names.map((n, i) => ({
    restaurantId: String(i + 1),
    restaurantName: n,
    value:
      metric === "sales"
        ? Math.round(19000 - i * 2200 + Math.random() * 900)
        : metric === "orders"
        ? Math.round(520 - i * 70 + Math.random() * 20)
        : Math.round(180 - i * 20 + Math.random() * 10),
  }));
}

function ModernTooltip({ active, payload, label, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-white/95 shadow-sm px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-sm font-semibold">
        {valueFormatter(payload[0].value)}
      </div>
    </div>
  );
}

export default function OrgDashboardPage() {
  const user = authStore.getUser();
  const orgs = useMemo(() => getUserOrganizations(user), [user]);
  const nav = useNavigate();

  const [selectedOrgId, setSelectedOrgId] = useState<string>(() => orgs?.[0]?.id || "");
  React.useEffect(() => {
    if (!selectedOrgId && orgs?.[0]?.id) setSelectedOrgId(orgs[0].id);
  }, [orgs, selectedOrgId]);

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === selectedOrgId) || orgs[0] || null,
    [orgs, selectedOrgId]
  );

  const currency = mapRegionToCurrency(selectedOrg?.region);
  const locale = mapCurrencyToLocale(currency);

  const [preset, setPreset] = useState<"day" | "week" | "month" | "year">("month");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));

  const [tsMetric, setTsMetric] = useState<Metric>("sales");
  const [tsBucket, setTsBucket] = useState<"day" | "week" | "month">("day");
  const [topMetric, setTopMetric] = useState<"sales" | "orders" | "reservations">("sales");

  // ✅ demoMode artık query'leri kapatmaz. Sadece UI'yı override eder.
  const [demoMode, setDemoMode] = useState(false);

  const rangeParams = useMemo(() => {
    if (!selectedOrgId) return null;

    if (useCustomRange) {
      const fromISO = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const toISO = new Date(`${toDate}T23:59:59.999Z`).toISOString();
      return { from: fromISO, to: toISO };
    }

    return { preset };
  }, [selectedOrgId, preset, useCustomRange, fromDate, toDate]);

  const summaryQ = useQuery({
    queryKey: ["org-analytics", "summary", selectedOrgId, rangeParams],
    queryFn: () => orgGetSummary(selectedOrgId, rangeParams || { preset }),
    enabled: Boolean(selectedOrgId),
    staleTime: 30_000,
  });

  const tsQ = useQuery({
    queryKey: ["org-analytics", "timeseries", selectedOrgId, rangeParams, tsMetric, tsBucket],
    queryFn: () =>
      orgGetTimeseries(selectedOrgId, {
        ...(rangeParams || { preset }),
        metric: tsMetric,
        bucket: tsBucket,
        // UK ise doğru; TR'de de sorun yok. Bucket sınırını etkiler.
        tz: currency === "GBP" ? "Europe/London" : "Europe/Istanbul",
      }),
    enabled: Boolean(selectedOrgId),
    staleTime: 30_000,
  });

  const topQ = useQuery({
    queryKey: ["org-analytics", "top-restaurants", selectedOrgId, rangeParams, topMetric],
    queryFn: () =>
      orgGetTopRestaurants(selectedOrgId, {
        ...(rangeParams || { preset }),
        metric: topMetric,
        limit: 10,
      }),
    enabled: Boolean(selectedOrgId),
    staleTime: 30_000,
  });

  const totals = demoMode
    ? {
        salesTotal: 84500,
        ordersCount: 3120,
        reservationsCount: 980,
        noShowCount: 54,
        cancelledCount: 72,
        depositPaidTotal: 18600,
        depositPaidCount: 210,
      }
    : summaryQ.data?.totals;

  const points = demoMode ? makeDemoTimeseries(tsMetric, 14) : (tsQ.data?.points ?? []);
  const topRows = demoMode ? makeDemoTop(topMetric) : (topQ.data?.rows ?? []);

  const noShowRate =
    totals && totals.reservationsCount > 0
      ? (totals.noShowCount || 0) / totals.reservationsCount
      : 0;

  const cancelRate =
    totals && totals.reservationsCount > 0
      ? (totals.cancelledCount || 0) / totals.reservationsCount
      : 0;

  const depositConversion =
    totals && totals.reservationsCount > 0
      ? (totals.depositPaidCount || 0) / totals.reservationsCount
      : 0;

  const kpiCards = useMemo(() => {
    return [
      { title: "Toplam Satış", value: totals ? fmtMoney(totals.salesTotal, currency, locale) : "-" },
      { title: "Sipariş", value: totals ? fmtInt(totals.ordersCount, locale) : "-" },
      { title: "Rezervasyon", value: totals ? fmtInt(totals.reservationsCount, locale) : "-" },
      { title: "No-show Oranı", value: totals ? pct(noShowRate) : "-" },
      { title: "İptal Oranı", value: totals ? pct(cancelRate) : "-" },
      { title: "Depozito Dönüşüm", value: totals ? pct(depositConversion) : "-" },
    ];
  }, [totals, currency, locale, noShowRate, cancelRate, depositConversion]);

  const chartData = useMemo(() => {
    return points.map((p: any) => ({
      ...p,
      label: new Date(p.t).toLocaleDateString(locale, { month: "short", day: "2-digit" }),
    }));
  }, [points, locale]);

  const valueFormatter = (v: any) => {
    if (tsMetric === "sales" || tsMetric === "deposits") return fmtMoney(v, currency, locale);
    return fmtInt(v, locale);
  };

  const topValueFormatter = (v: any) => {
    if (topMetric === "sales") return fmtMoney(v, currency, locale);
    return fmtInt(v, locale);
  };

  // ✅ Tek yerden değiştir: senin gerçek route’un neyse bunu yap.
  // Eğer route yoksa SPA içinde yine URL değişir ama “aynı sayfa” kalıyorsa,
  // router’da bu path için route tanımlı değildir.
  const getRestaurantDetailPath = (rid: string) => `/panel/restaurants/${rid}`;

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/org", label: "Özet" },
          { to: "/org/branch-requests", label: "Şube Talepleri" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Organizasyon Paneli</h2>
            <div className="text-xs text-gray-500">
              KPI • Trend • Restoran karşılaştırma • {currency}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Organizasyon</span>
              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                disabled={orgs.length === 0}
              >
                {orgs.length === 0 ? (
                  <option value="">-</option>
                ) : (
                  orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
              />
              Demo aktif (örnek veriler)
            </label>
          </div>
        </div>

        <Card title="Bağlı Olduğunuz Organizasyonlar">
          {orgs.length === 0 ? (
            <div className="text-sm text-gray-500">
              Herhangi bir organizasyona bağlı değilsiniz.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">Ad</th>
                    <th className="py-2 px-4">Bölge</th>
                    <th className="py-2 px-4">Rolünüz</th>
                    <th className="py-2 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => {
                    const orgId = o.id;
                    return (
                      <tr key={orgId} className="border-t">
                        <td className="py-2 px-4">{o.name}</td>
                        <td className="py-2 px-4">{o.region || "-"}</td>
                        <td className="py-2 px-4">{prettyOrgRole(o.role)}</td>
                        <td className="py-2 px-4 text-right">
                          {orgId && (
                            <button
                              type="button"
                              className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                nav(`/org/organizations/${orgId}/menu`);
                              }}
                            >
                              Menüyü Yönet
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ✅ href kaldırıldı: SPA içi Link */}
          <p className="mt-3 text-xs text-gray-500">
            Yeni şube açma ihtiyaçlarınızı{" "}
            <Link to="/org/branch-requests" className="text-brand-700 underline">
              Şube Talepleri
            </Link>{" "}
            ekranından iletebilirsiniz.
          </p>
        </Card>

        <Card title={`Raporlar (Organizasyon Genel) • ${labelOfPreset(preset)}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Periyot</span>
              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={preset}
                onChange={(e) => setPreset(e.target.value as any)}
                disabled={useCustomRange || demoMode}
              >
                <option value="day">Günlük</option>
                <option value="week">Haftalık</option>
                <option value="month">Aylık</option>
                <option value="year">Yıllık</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={useCustomRange}
                onChange={(e) => setUseCustomRange(e.target.checked)}
                disabled={demoMode}
              />
              Tarih aralığı seç
            </label>

            {useCustomRange && !demoMode && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Başlangıç</span>
                  <input
                    type="date"
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Bitiş</span>
                  <input
                    type="date"
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="ml-auto text-xs text-gray-500">
              {demoMode
                ? "Demo aktif (örnek veriler)"
                : summaryQ.isFetching || tsQ.isFetching || topQ.isFetching
                ? "Güncelleniyor..."
                : "Canlı veri"}
            </div>
          </div>

          {/* KPI */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiCards.map((c) => (
              <div key={c.title} className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="text-[11px] tracking-wide text-gray-500">{c.title}</div>
                <div className="mt-1 text-base font-semibold">{c.value}</div>
              </div>
            ))}
          </div>

          {!demoMode && (summaryQ.isError || tsQ.isError || topQ.isError) && (
            <div className="mt-4 text-sm text-red-600">
              Rapor verisi alınırken hata oluştu. (Rol / endpoint / auth kontrol et)
            </div>
          )}

          {/* Charts */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">Trend</div>
                  <div className="text-xs text-gray-500">
                    {metricLabel(tsMetric, currency)} • bucket: {tsBucket}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={tsMetric}
                    onChange={(e) => setTsMetric(e.target.value as Metric)}
                  >
                    <option value="sales">Satış</option>
                    <option value="orders">Sipariş</option>
                    <option value="reservations">Rezervasyon</option>
                    <option value="no_show">No-show</option>
                    <option value="cancelled">İptal</option>
                    <option value="deposits">Depozito</option>
                  </select>

                  <select
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={tsBucket}
                    onChange={(e) => setTsBucket(e.target.value as any)}
                  >
                    <option value="day">Gün</option>
                    <option value="week">Hafta</option>
                    <option value="month">Ay</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 h-64">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<ModernTooltip valueFormatter={valueFormatter} />} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#4F46E5"
                        strokeWidth={2}
                        fill="url(#trendFill)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="font-semibold text-sm">Hızlı İstatistik</div>
              <div className="mt-1 text-xs text-gray-500">
                Rezervasyon davranış metrikleri
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">No-show oranı</div>
                  <div className="text-sm font-semibold">{pct(noShowRate)}</div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${Math.min(100, Math.round(noShowRate * 100))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">İptal oranı</div>
                  <div className="text-sm font-semibold">{pct(cancelRate)}</div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${Math.min(100, Math.round(cancelRate * 100))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">Depozito dönüşüm</div>
                  <div className="text-sm font-semibold">{pct(depositConversion)}</div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, Math.round(depositConversion * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Top restaurants */}
          <div className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-sm">Top Restoranlar</div>
                <div className="text-xs text-gray-500">
                  {topMetric === "sales" ? `Ciro (${currency})` : topMetric === "orders" ? "Sipariş" : "Rezervasyon"} bazlı
                </div>
              </div>

              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={topMetric}
                onChange={(e) => setTopMetric(e.target.value as any)}
              >
                <option value="sales">Satış</option>
                <option value="orders">Sipariş</option>
                <option value="reservations">Rezervasyon</option>
              </select>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-72">
                {topRows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topRows
                        .slice(0, 10)
                        .map((r) => ({
                          ...r,
                          name: String(r.restaurantName || r.restaurantId).slice(0, 28),
                        }))}
                      layout="vertical"
                      margin={{ left: 10, right: 16, top: 8, bottom: 8 }}
                      barCategoryGap={10}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.14} />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={160} />
                      <Tooltip content={<ModernTooltip valueFormatter={topValueFormatter} />} />
                      <Bar dataKey="value" name="Değer" fill="#4F46E5" radius={[8, 8, 8, 8]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="overflow-auto border rounded-xl">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-3">Restoran</th>
                      <th className="py-2 px-3 text-right">Değer</th>
                      <th className="py-2 px-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRows.length === 0 ? (
                      <tr className="border-t">
                        <td className="py-2 px-3 text-gray-500" colSpan={3}>
                          Veri yok.
                        </td>
                      </tr>
                    ) : (
                      topRows.slice(0, 10).map((r) => {
                        const rid = String(r.restaurantId);
                        const path = getRestaurantDetailPath(rid);

                        return (
                          <tr key={rid} className="border-t">
                            <td className="py-2 px-3">
                              {r.restaurantName || rid}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {topMetric === "sales"
                                ? fmtMoney(r.value, currency, locale)
                                : fmtInt(r.value, locale)}
                            </td>

                            {/* ✅ Refresh önleme: Link + preventDefault + nav */}
                            <td className="py-2 px-3 text-right">
                              <Link
                                to={path}
                                className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  nav(path);
                                }}
                                title="Restoran detayına git"
                              >
                                Detay
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                <div className="p-3 text-xs text-gray-500">
                  Not: URL değişiyor ama “aynı sayfa” kalıyorsa problem Deploy değil, router’da bu path’in route’u yok.
                  O durumda sadece <code>getRestaurantDetailPath</code>’i panelindeki gerçek route’a göre değiştir.
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}