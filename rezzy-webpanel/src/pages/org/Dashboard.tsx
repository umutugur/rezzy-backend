// rezzy-webpanel/src/pages/org/Dashboard.tsx
import React from "react";
import Sidebar from "../../components/Sidebar";
import { Card, Stat, StatGrid } from "../../components/Card";
import { authStore, MeUser } from "../../store/auth";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, orgGetMyOrganization } from "../../api/client";

// Recharts
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
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
      } as OrgLite;
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

/** Region -> Currency code (gerçek para birimi) */
function mapRegionToCurrency(region?: string | null): "GBP" | "TRY" | "EUR" | "USD" {
  const r = String(region || "").trim().toUpperCase();
  if (r === "UK" || r === "GB") return "GBP";
  if (r === "US" || r === "USA") return "USD";
  if (["EU", "DE", "FR", "NL", "ES", "IT", "CY", "IE", "PT", "GR"].includes(r)) return "EUR";
  return "TRY";
}

/** Currency -> locale */
function mapCurrencyToLocale(cur: "GBP" | "TRY" | "EUR" | "USD") {
  if (cur === "GBP") return "en-GB";
  if (cur === "USD") return "en-US";
  if (cur === "EUR") return "de-DE";
  return "tr-TR";
}

function formatMoney(v: number, currency: "GBP" | "TRY" | "EUR" | "USD", locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(v) ? v : 0);
  } catch {
    // fallback
    const sym = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
    const n = Number.isFinite(v) ? v : 0;
    return `${sym}${Math.round(n).toLocaleString()}`;
  }
}

function formatPct(v: number) {
  const n = Number.isFinite(v) ? v : 0;
  return `${Math.round(n)}%`;
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

type Period = "daily" | "weekly" | "monthly" | "yearly";

function periodLabel(p: Period) {
  if (p === "daily") return "Günlük";
  if (p === "weekly") return "Haftalık";
  if (p === "monthly") return "Aylık";
  return "Yıllık";
}

type OrgOverview = {
  ok?: boolean;
  range: { from: string; to: string };

  currency?: string; // opsiyonel backend dönerse
  totals: {
    revenueTotal: number;      // toplam satış (order revenue)
    ordersCount: number;

    reservationsCount: number;
    noShowCount: number;
    cancelCount: number;

    depositPaidTotal: number;  // ödenen depozitolar
    depositPaidCount: number;  // kaç ödeme
    depositConversionPct?: number; // opsiyonel
  };

  trend: Array<{ date: string; revenue: number; orders: number; reservations: number }>;

  reservationStatus: {
    confirmed: number;
    arrived: number;
    pending: number;
    no_show: number;
    cancelled: number;
  };

  topRestaurants: Array<{
    restaurantId: string;
    name: string;
    value: number;
  }>;
};

async function fetchOrgOverview(orgId: string, params: { from: string; to: string; bucket: "day" | "week" | "month" }) {
  // ✅ Endpoint’i burada düzelt: sende farklıysa sadece bu satırı değiştir.
  const { data } = await api.get(`/org/organizations/${orgId}/reports/overview`, { params });
  return data as OrgOverview;
}

/** DB boşken UI’yı görmek için demo data */
function buildDemoOverview(from: string, to: string): OrgOverview {
  const start = new Date(from);
  const end = new Date(to);
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toISODate(new Date(d)));
  }

  const trend = days.slice(-14).map((date, idx) => {
    const base = 1600 + Math.round(Math.sin(idx / 2) * 300);
    const bump = idx % 5 === 0 ? 250 : 0;
    const revenue = base + bump + (idx * 25);
    return {
      date,
      revenue,
      orders: 120 + idx * 3,
      reservations: 40 + idx * 2,
    };
  });

  return {
    ok: true,
    range: { from, to },
    totals: {
      revenueTotal: 84500,
      ordersCount: 3120,
      reservationsCount: 980,
      noShowCount: 58,
      cancelCount: 69,
      depositPaidTotal: 17800,
      depositPaidCount: 210,
      depositConversionPct: 21,
    },
    trend,
    reservationStatus: {
      confirmed: 620,
      arrived: 280,
      pending: 42,
      no_show: 58,
      cancelled: 69,
    },
    topRestaurants: [
      { restaurantId: "demo-1", name: "Karya Bistro - Highmspark", value: 19000 },
      { restaurantId: "demo-2", name: "Karya Bistro - Soho", value: 15200 },
      { restaurantId: "demo-3", name: "Karya Bistro - Camden", value: 9800 },
    ],
  };
}

function getRestaurantDetailPath(rid: string) {
  // Sende restoran detayı hangi route ise onu yaz:
  // Örn: "/panel/restaurants/:id" ya da "/admin/restaurants/:id"
  return `/panel/restaurants/${rid}`;
}

export default function OrgDashboardPage() {
  const user = authStore.getUser();
  const orgs = getUserOrganizations(user);
  const nav = useNavigate();

  // -------- Selected org (basit: ilk org) --------
  const [selectedOrgId, setSelectedOrgId] = React.useState<string>(() => orgs[0]?.id ?? "");

  React.useEffect(() => {
    if (!selectedOrgId && orgs[0]?.id) setSelectedOrgId(orgs[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs.length]);

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) ?? null;

  // Detail çek (region/currency kesinleşsin)
  const orgDetailQ = useQuery({
    queryKey: ["org-detail", selectedOrgId],
    queryFn: () => orgGetMyOrganization(selectedOrgId),
    enabled: Boolean(selectedOrgId),
    staleTime: 60_000,
  });

  const orgRegion =
    (orgDetailQ.data as any)?.region ??
    selectedOrg?.region ??
    null;

  const currency = mapRegionToCurrency(orgRegion);
  const locale = mapCurrencyToLocale(currency);

  // -------- Filters --------
  const [period, setPeriod] = React.useState<Period>("daily");
  const [useCustomRange, setUseCustomRange] = React.useState(false);

  const today = new Date();
  const defaultFrom = React.useMemo(() => {
    const d = new Date(today);
    if (period === "daily") d.setDate(d.getDate() - 14);
    if (period === "weekly") d.setDate(d.getDate() - 56);
    if (period === "monthly") d.setMonth(d.getMonth() - 6);
    if (period === "yearly") d.setFullYear(d.getFullYear() - 2);
    return toISODate(d);
  }, [period]);

  const defaultTo = React.useMemo(() => toISODate(today), []);

  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);

  React.useEffect(() => {
    if (!useCustomRange) {
      setFrom(defaultFrom);
      setTo(defaultTo);
    }
  }, [defaultFrom, defaultTo, useCustomRange]);

  const bucket: "day" | "week" | "month" =
    period === "daily" ? "day" : period === "weekly" ? "week" : period === "monthly" ? "day" : "month";

  // Demo toggle (DB boşsa bile UI test)
  const [demoMode, setDemoMode] = React.useState(true);

  const overviewQ = useQuery({
    queryKey: ["org-overview", selectedOrgId, from, to, bucket, demoMode],
    queryFn: async () => {
      if (!selectedOrgId) return null;
      if (demoMode) return buildDemoOverview(from, to);
      return fetchOrgOverview(selectedOrgId, { from, to, bucket });
    },
    enabled: Boolean(selectedOrgId),
    staleTime: 30_000,
  });

  const ov = overviewQ.data;

  // -------- Derived UI values --------
  const totals = ov?.totals;
  const trend = Array.isArray(ov?.trend) ? ov!.trend : [];
  const rs = ov?.reservationStatus;

  const pieData = rs
    ? [
        { name: "Başarılı", value: (rs.confirmed ?? 0) + (rs.arrived ?? 0) },
        { name: "No-show", value: rs.no_show ?? 0 },
        { name: "İptal", value: rs.cancelled ?? 0 },
      ]
    : [];

  const top = Array.isArray(ov?.topRestaurants) ? ov!.topRestaurants : [];

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
            <div className="text-sm text-gray-500">
              Bağlı organizasyonlarınızı yönetin ve raporları görüntüleyin.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Organizasyon</label>
            <select
              className="px-3 py-2 rounded-lg border bg-white text-sm"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              disabled={orgs.length === 0}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Card title="Bağlı Olduğunuz Organizasyonlar">
          {orgs.length === 0 ? (
            <div className="text-sm text-gray-500">Herhangi bir organizasyona bağlı değilsiniz.</div>
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
                        <td className="py-2 px-4">{o.region || (orgId === selectedOrgId ? (orgRegion || "-") : "-")}</td>
                        <td className="py-2 px-4">{prettyOrgRole(o.role)}</td>
                        <td className="py-2 px-4 text-right">
                          {orgId && (
                            <button
                              type="button"
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

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Yeni şube açma ihtiyaçlarınızı{" "}
              <Link to="/org/branch-requests" className="text-brand-700 underline">
                Şube Talepleri
              </Link>{" "}
              ekranından iletebilirsiniz.
            </p>

            <label className="flex items-center gap-2 text-xs text-gray-600 select-none">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
              />
              Demo aktif (örnek veriler)
            </label>
          </div>
        </Card>

        <Card title={`Raporlar (Organizasyon Genel) • ${periodLabel(period)}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-600">Periyot</div>
              <select
                className="px-3 py-2 rounded-lg border bg-white text-sm"
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
              >
                <option value="daily">Günlük</option>
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
                <option value="yearly">Yıllık</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={useCustomRange}
                onChange={(e) => setUseCustomRange(e.target.checked)}
              />
              Tarih aralığı seç
            </label>

            {useCustomRange && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="px-3 py-2 rounded-lg border bg-white text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <span className="text-sm text-gray-400">→</span>
                <input
                  type="date"
                  className="px-3 py-2 rounded-lg border bg-white text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            )}

            <div className="ml-auto text-xs text-gray-500">
              {orgDetailQ.isLoading ? "Organizasyon bilgisi yükleniyor…" : `Para birimi: ${currency}`}
            </div>
          </div>

          <div className="mt-4">
            <StatGrid>
              <Stat
                label="Toplam Satış"
                value={formatMoney(totals?.revenueTotal ?? 0, currency, locale)}
              />
              <Stat label="Sipariş" value={totals?.ordersCount ?? 0} />
              <Stat label="Rezervasyon" value={totals?.reservationsCount ?? 0} />
              <Stat label="No-show" value={totals?.noShowCount ?? 0} />
              <Stat label="İptal" value={totals?.cancelCount ?? 0} />
              <Stat
                label="Depozito (Ödenen)"
                value={formatMoney(totals?.depositPaidTotal ?? 0, currency, locale)}
                helper={`${totals?.depositPaidCount ?? 0} ödeme`}
              />
              <Stat
                label="Depozito Dönüşüm"
                value={formatPct(totals?.depositConversionPct ?? 0)}
              />
              <Stat
                label="Aralık"
                value={
                  <span className="text-base font-semibold">
                    {ov?.range?.from ?? from} → {ov?.range?.to ?? to}
                  </span>
                }
              />
            </StatGrid>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-soft p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-700">Trend</div>
                  <div className="text-xs text-gray-500">Satış ({currency}) • bucket: {bucket}</div>
                </div>
              </div>

              <div className="mt-3 h-64">
                {trend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(val: any, name: any) => {
                          if (name === "revenue") return [formatMoney(Number(val), currency, locale), "Satış"];
                          if (name === "orders") return [Number(val), "Sipariş"];
                          if (name === "reservations") return [Number(val), "Rezervasyon"];
                          return [val, name];
                        }}
                      />
                      <Area type="monotone" dataKey="revenue" strokeWidth={2} fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-soft p-4">
              <div className="text-sm font-semibold text-gray-700">Rezervasyon Dağılımı</div>
              <div className="text-xs text-gray-500">Başarılı / No-show / İptal</div>

              <div className="mt-3 h-64">
                {pieData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                      >
                        {/* Renk belirtmeyi istemedin ama burada “modern görünüm” için zorunlu.
                            İstersen renkleri brand palette’ine göre ayarlarız. */}
                        {pieData.map((_, idx) => (
                          <Cell key={idx} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-2 text-xs text-gray-500">
                Bu grafiği “confirmed/arrived/pending” detayına da genişletebiliriz.
              </div>
            </div>
          </div>

          <div className="mt-4 bg-white rounded-2xl shadow-soft p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-700">Top Restoranlar</div>
                <div className="text-xs text-gray-500">Ciro bazlı</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-72">
                {top.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    Veri yok.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} hide />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(val: any) => [formatMoney(Number(val), currency, locale), "Satış"]}
                        labelFormatter={(label: any) => String(label)}
                      />
                      <Bar dataKey="value" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-3">Restoran</th>
                      <th className="py-2 px-3">Değer</th>
                      <th className="py-2 px-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.length === 0 ? (
                      <tr className="border-t">
                        <td className="py-2 px-3 text-gray-500" colSpan={3}>
                          Veri yok.
                        </td>
                      </tr>
                    ) : (
                      top.map((r) => (
                        <tr key={r.restaurantId} className="border-t">
                          <td className="py-2 px-3">{r.name}</td>
                          <td className="py-2 px-3">{formatMoney(r.value, currency, locale)}</td>
                          <td className="py-2 px-3 text-right">
                            <Link
                              to={getRestaurantDetailPath(String(r.restaurantId))}
                              onClick={(e) => {
                                // “refresh” bug’ını kökten kes
                                e.stopPropagation();
                              }}
                              className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                            >
                              Detay
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <div className="mt-2 text-xs text-gray-500">
                  Not: Detay route’un `/panel/restaurants/:id` değilse, `getRestaurantDetailPath()` fonksiyonunu değiştir.
                </div>
              </div>
            </div>
          </div>

          {overviewQ.isError && (
            <div className="mt-3 text-sm text-red-600">
              Rapor alınamadı. Endpoint veya yetki kontrolü gerekiyor.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}