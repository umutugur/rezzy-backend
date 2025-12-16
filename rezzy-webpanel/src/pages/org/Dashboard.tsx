import React, { useMemo, useState } from "react";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore, MeUser } from "../../store/auth";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  orgGetSummary,
  orgGetTimeseries,
  orgGetTopRestaurants,
} from "../../api/orgAnalytics";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
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

function fmtMoneyTRY(n: any) {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${v}`;
  }
}
function fmtInt(n: any) {
  const v = Number(n || 0);
  return new Intl.NumberFormat("tr-TR").format(v);
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

function metricLabel(m: Metric) {
  switch (m) {
    case "sales":
      return "Satış (₺)";
    case "orders":
      return "Sipariş (adet)";
    case "reservations":
      return "Rezervasyon (adet)";
    case "no_show":
      return "No-show (adet)";
    case "cancelled":
      return "İptal (adet)";
    case "deposits":
      return "Depozito (₺)";
    default:
      return m;
  }
}

function makeDemoTimeseries(metric: Metric, days = 14) {
  const now = new Date();
  const pts: Array<{ t: string; value: number }> = [];
  let base =
    metric === "sales" || metric === "deposits"
      ? 2000
      : metric === "orders"
      ? 80
      : metric === "reservations"
      ? 30
      : metric === "no_show"
      ? 4
      : 6;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const noise = Math.sin(i / 2) * 0.18 + (Math.random() - 0.5) * 0.22;
    const v = Math.max(
      0,
      Math.round(base * (1 + noise) * (metric === "sales" ? 1 : 1))
    );
    pts.push({ t: d.toISOString(), value: v });
  }
  return pts;
}

function makeDemoTop(metric: "sales" | "orders" | "reservations") {
  const names = [
    "Karya Bistro Merkez",
    "Karya Bistro Girne",
    "Karya Bistro Lefkoşa",
    "Karya Bistro Manchester",
    "Karya Bistro London",
  ];
  return names.map((n, i) => ({
    restaurantId: String(i + 1),
    restaurantName: n,
    value:
      metric === "sales"
        ? Math.round(12000 - i * 1800 + Math.random() * 900)
        : metric === "orders"
        ? Math.round(420 - i * 60 + Math.random() * 20)
        : Math.round(160 - i * 20 + Math.random() * 10),
  }));
}

// ---- chart colors (no hard brand; just readable defaults)
const PIE_COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#6B7280"];

export default function OrgDashboardPage() {
  const user = authStore.getUser();
  const orgs = useMemo(() => getUserOrganizations(user), [user]);
  const nav = useNavigate();

  const [selectedOrgId, setSelectedOrgId] = useState<string>(() => orgs?.[0]?.id || "");
  React.useEffect(() => {
    if (!selectedOrgId && orgs?.[0]?.id) setSelectedOrgId(orgs[0].id);
  }, [orgs, selectedOrgId]);

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

  // ✅ Demo mode: veritabanı boşken bile dashboard anlaşılır gözüksün
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
    enabled: Boolean(selectedOrgId) && !demoMode,
    staleTime: 30_000,
  });

  const tsQ = useQuery({
    queryKey: ["org-analytics", "timeseries", selectedOrgId, rangeParams, tsMetric, tsBucket],
    queryFn: () =>
      orgGetTimeseries(selectedOrgId, {
        ...(rangeParams || { preset }),
        metric: tsMetric,
        bucket: tsBucket,
        tz: "Europe/Istanbul",
      }),
    enabled: Boolean(selectedOrgId) && !demoMode,
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
    enabled: Boolean(selectedOrgId) && !demoMode,
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

  const hasRealData =
    !demoMode &&
    Boolean(totals) &&
    (Number(totals?.ordersCount || 0) > 0 ||
      Number(totals?.reservationsCount || 0) > 0 ||
      Number(totals?.salesTotal || 0) > 0);

  // Derived rates (works even if zeros)
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

  const reservationOutcomePie = useMemo(() => {
    const total = Number(totals?.reservationsCount || 0);
    const noShow = Number(totals?.noShowCount || 0);
    const cancelled = Number(totals?.cancelledCount || 0);
    const success = Math.max(0, total - noShow - cancelled);
    return [
      { name: "Başarılı", value: success },
      { name: "No-show", value: noShow },
      { name: "İptal", value: cancelled },
    ];
  }, [totals]);

  const kpiCards = useMemo(() => {
    return [
      { title: "Toplam Satış", value: totals ? fmtMoneyTRY(totals.salesTotal) : "-" },
      { title: "Sipariş", value: totals ? fmtInt(totals.ordersCount) : "-" },
      { title: "Rezervasyon", value: totals ? fmtInt(totals.reservationsCount) : "-" },
      { title: "No-show Oranı", value: totals ? pct(noShowRate) : "-" },
      { title: "İptal Oranı", value: totals ? pct(cancelRate) : "-" },
      { title: "Depozito Dönüşüm", value: totals ? pct(depositConversion) : "-" },
    ];
  }, [totals, noShowRate, cancelRate, depositConversion]);

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
              Organizasyon performansı • KPI • Trend • Drill-down
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
              Demo Modu
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
                              className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                              onClick={() => nav(`/org/organizations/${orgId}/menu`)}
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

          <p className="mt-3 text-xs text-gray-500">
            Yeni şube açma ihtiyaçlarınızı{" "}
            <a href="/org/branch-requests" className="text-brand-700 underline">
              Şube Talepleri
            </a>{" "}
            ekranından iletebilirsiniz.
          </p>
        </Card>

        <Card title={`Raporlar (Organizasyon Genel) • ${labelOfPreset(preset)}`}>
          {/* Range controls */}
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
                : hasRealData
                ? "Canlı veri"
                : "Veri yok (normal)"}
            </div>
          </div>

          {/* KPI Grid */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiCards.map((c) => (
              <div key={c.title} className="rounded border bg-white p-3">
                <div className="text-xs text-gray-500">{c.title}</div>
                <div className="text-base font-semibold">{c.value}</div>
              </div>
            ))}
          </div>

          {/* Errors */}
          {!demoMode && (summaryQ.isError || tsQ.isError || topQ.isError) && (
            <div className="mt-4 text-sm text-red-600">
              Rapor verisi alınırken hata oluştu. (Auth/rol veya endpoint kontrol et)
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Trend line */}
            <div className="rounded border bg-white p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-semibold text-sm">Trend</div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={tsMetric}
                    onChange={(e) => setTsMetric(e.target.value as Metric)}
                  >
                    <option value="sales">Satış (₺)</option>
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

              <div className="mt-1 text-xs text-gray-500">
                {metricLabel(tsMetric)} • bucket: {tsBucket}
              </div>

              <div className="mt-3 h-64">
                {points.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points.map((p) => ({
                      ...p,
                      label: new Date(p.t).toLocaleDateString("tr-TR", { month: "short", day: "2-digit" }),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: any) =>
                          tsMetric === "sales" || tsMetric === "deposits"
                            ? fmtMoneyTRY(value)
                            : fmtInt(value)
                        }
                      />
                      <Line type="monotone" dataKey="value" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Reservation outcome pie */}
            <div className="rounded border bg-white p-4">
              <div className="font-semibold text-sm">Rezervasyon Dağılımı</div>
              <div className="mt-1 text-xs text-gray-500">
                Başarılı / No-show / İptal
              </div>

              <div className="mt-3 h-64">
                {reservationOutcomePie.every((x) => x.value === 0) ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reservationOutcomePie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {reservationOutcomePie.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtInt(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Top restaurants bar */}
          <div className="mt-4 rounded border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-sm">Top Restoranlar</div>
                <div className="text-xs text-gray-500">
                  {topMetric === "sales" ? "Ciro" : topMetric === "orders" ? "Sipariş" : "Rezervasyon"} bazlı
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
                          name: (r.restaurantName || String(r.restaurantId)).slice(0, 18),
                        }))}
                      layout="vertical"
                      margin={{ left: 20, right: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={120} />
                      <Tooltip
                        formatter={(value: any) =>
                          topMetric === "sales" ? fmtMoneyTRY(value) : fmtInt(value)
                        }
                      />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="overflow-auto border rounded">
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
                      topRows.slice(0, 10).map((r) => (
                        <tr key={String(r.restaurantId)} className="border-t">
                          <td className="py-2 px-3">{r.restaurantName || String(r.restaurantId)}</td>
                          <td className="py-2 px-3 text-right">
                            {topMetric === "sales" ? fmtMoneyTRY(r.value) : fmtInt(r.value)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                              onClick={() => nav(`/panel/restaurants/${r.restaurantId}`)}
                              title="Restoran detayına git"
                            >
                              Detay
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <div className="p-3 text-xs text-gray-500">
                  Not: Detay linki senin panel route’una göre değişebilir. Eğer `/panel/restaurants/:id` yoksa söyle, route’u senin yapına göre düzeltirim.
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}