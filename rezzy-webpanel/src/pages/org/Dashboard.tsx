// rezzy-webpanel/src/pages/org/Dashboard.tsx
import React, { useMemo, useState } from "react";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore, MeUser } from "../../store/auth";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  orgGetSummary,
  orgGetTimeseries,
  orgGetTopRestaurants,
  orgGetRestaurantSummary,
} from "../../api/orgAnalytics";
import { orgUpdateMyOrganization } from "../../api/client";

import { getCurrencySymbolForRegion } from "../../utils/currency";
import { DEFAULT_LANGUAGE, LANG_OPTIONS } from "../../utils/languages";
import { showToast } from "../../ui/Toast";
import { useI18n, setLocale } from "../../i18n";
import { setActiveOrgId } from "../../i18n/panel";

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

/* ---------------- Types ---------------- */
type OrgLite = {
  id: string;
  name: string;
  region?: string | null;
  defaultLanguage?: string | null;
  role?: string;
};

type Metric =
  | "sales"
  | "orders"
  | "reservations"
  | "no_show"
  | "cancelled"
  | "deposits";

/* ---------------- Helpers ---------------- */
function getUserOrganizations(
  u: MeUser | null,
  t: (key: string, options?: any) => string
): OrgLite[] {
  if (!u || !Array.isArray((u as any).organizations)) return [];
  return (u as any).organizations
    .map((o: any) => {
      const id =
        o.id || o.organization?._id || o.organizationId || o.organization || o._id || null;

      if (!id) return null;

      return {
        id: String(id),
        name: o.name || o.organizationName || t("İsimsiz Organizasyon"),
        region: o.region ?? null,
        defaultLanguage: o.defaultLanguage ?? null,
        role: o.role,
      };
    })
    .filter(Boolean) as OrgLite[];
}

function prettyOrgRole(role: string | undefined, t: (key: string, options?: any) => string) {
  if (!role) return "-";
  switch (role) {
    case "org_owner":
      return t("Owner");
    case "org_admin":
      return t("Admin");
    case "org_finance":
      return t("Finans");
    case "org_staff":
      return t("Staff");
    default:
      return role;
  }
}

function mapRegionToLocale(region?: string | null): string {
  const r = String(region || "").trim().toUpperCase();
  if (r === "UK" || r === "GB") return "en-GB";
  if (r === "US" || r === "USA") return "en-US";
  return "tr-TR";
}

function fmtMoneyWithSymbol(value: any, symbol: string, locale = "tr-TR") {
  const v = Number(value || 0);
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
  return symbol ? `${n} ${symbol}` : n;
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

function labelOfPreset(p: string, t: (key: string, options?: any) => string) {
  switch (p) {
    case "day":
      return t("Günlük");
    case "week":
      return t("Haftalık");
    case "month":
      return t("Aylık");
    case "year":
      return t("Yıllık");
    default:
      return p;
  }
}

function metricLabel(
  m: Metric,
  symbol: string,
  t: (key: string, options?: any) => string
) {
  switch (m) {
    case "sales":
      return symbol
        ? t("Satış ({symbol})", { symbol })
        : t("Satış");
    case "orders":
      return t("Sipariş (adet)");
    case "reservations":
      return t("Rezervasyon (adet)");
    case "no_show":
      return t("No-show (adet)");
    case "cancelled":
      return t("İptal (adet)");
    case "deposits":
      return symbol
        ? t("Depozito ({symbol})", { symbol })
        : t("Depozito");
    default:
      return m;
  }
}

/* --- Demo data (DB boşken bile iyi görünmesi için) --- */
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
      <div className="text-sm font-semibold">{valueFormatter(payload[0].value)}</div>
    </div>
  );
}

/* ---------------- UI: Drawer ---------------- */
function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">{title}</div>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200"
            onClick={onClose}
          >
            Kapat
          </button>
        </div>
        <div className="p-4 overflow-auto h-[calc(100%-57px)]">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function OrgDashboardPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const user = authStore.getUser();
  const { t } = useI18n();
  const orgs = useMemo(() => getUserOrganizations(user, t), [user, t]);

  const [selectedOrgId, setSelectedOrgId] = useState<string>(() => orgs?.[0]?.id || "");
  React.useEffect(() => {
    if (!selectedOrgId && orgs?.[0]?.id) setSelectedOrgId(orgs[0].id);
  }, [orgs, selectedOrgId]);

  React.useEffect(() => {
    if (selectedOrgId) setActiveOrgId(selectedOrgId);
  }, [selectedOrgId]);

  const selectedOrg = useMemo(
    () => orgs.find((o) => o.id === selectedOrgId) || orgs[0] || null,
    [orgs, selectedOrgId]
  );
  const [orgLang, setOrgLang] = useState<string>(
    selectedOrg?.defaultLanguage || DEFAULT_LANGUAGE
  );
  const [orgLangBase, setOrgLangBase] = useState<string>(
    selectedOrg?.defaultLanguage || DEFAULT_LANGUAGE
  );

  React.useEffect(() => {
    const nextLang = selectedOrg?.defaultLanguage || DEFAULT_LANGUAGE;
    setOrgLang(nextLang);
    setOrgLangBase(nextLang);
    setLocale(nextLang);
  }, [selectedOrg?.id]);

  const updateOrgLangMut = useMutation({
    mutationFn: (lang: string) =>
      orgUpdateMyOrganization(selectedOrgId, { defaultLanguage: lang }),
    onSuccess: (_resp, lang) => {
      showToast(t("Organizasyon dili güncellendi"), "success");
      setOrgLangBase(lang);
      setLocale(lang);
      const u = authStore.getUser();
      if (u?.organizations?.length) {
        const nextOrgs = u.organizations.map((o: any) =>
          String(o?.id ?? o?.organization ?? o?._id) === String(selectedOrgId)
            ? { ...o, defaultLanguage: lang }
            : o
        );
        authStore.setUser({ ...u, organizations: nextOrgs });
      }
      qc.invalidateQueries({ queryKey: ["org-analytics", "summary", selectedOrgId] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message || err?.message || t("Dil güncellenemedi");
      showToast(msg, "error");
      setOrgLang(orgLangBase);
    },
  });

  const currencySymbol = selectedOrg?.region
    ? getCurrencySymbolForRegion(selectedOrg.region)
    : "₺";
  const locale = mapRegionToLocale(selectedOrg?.region);

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

  const [demoMode, setDemoMode] = useState(false);

  const [openRestaurantId, setOpenRestaurantId] = useState<string | null>(null);
  const [openRestaurantName, setOpenRestaurantName] = useState<string>("");

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
        tz: ["UK", "GB"].includes(String(selectedOrg?.region || "").trim().toUpperCase())
          ? "Europe/London"
          : "Europe/Istanbul",
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

  const restSummaryQ = useQuery({
    queryKey: ["org-analytics", "restaurant-summary", openRestaurantId, rangeParams],
    queryFn: () => orgGetRestaurantSummary(String(openRestaurantId), rangeParams || { preset }),
    enabled: Boolean(openRestaurantId) && !demoMode,
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
      {
        title: t("Toplam Satış"),
        value: totals
          ? fmtMoneyWithSymbol(totals.salesTotal, currencySymbol, locale)
          : "-",
      },
      { title: t("Sipariş"), value: totals ? fmtInt(totals.ordersCount, locale) : "-" },
      {
        title: t("Rezervasyon"),
        value: totals ? fmtInt(totals.reservationsCount, locale) : "-",
      },
      { title: t("No-show oranı"), value: totals ? pct(noShowRate) : "-" },
      { title: t("İptal oranı"), value: totals ? pct(cancelRate) : "-" },
      { title: t("Depozito dönüşüm"), value: totals ? pct(depositConversion) : "-" },
    ];
  }, [t, totals, currencySymbol, locale, noShowRate, cancelRate, depositConversion]);

  const chartData = useMemo(() => {
    return points.map((p: any) => ({
      ...p,
      label: new Date(p.t).toLocaleDateString(locale, { month: "short", day: "2-digit" }),
    }));
  }, [points, locale]);

  const valueFormatter = (v: any) => {
    if (tsMetric === "sales" || tsMetric === "deposits") {
      return fmtMoneyWithSymbol(v, currencySymbol, locale);
    }
    return fmtInt(v, locale);
  };

  const topValueFormatter = (v: any) => {
    if (topMetric === "sales") return fmtMoneyWithSymbol(v, currencySymbol, locale);
    return fmtInt(v, locale);
  };

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/org", label: "Özet" },
          { to: "/org/branch-requests", label: "Şube Talepleri" },
        ]}
      />

      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t("Organizasyon Paneli")}</h2>
            <div className="text-xs text-gray-500">
              {t("KPI • Trend • Restoran karşılaştırma")}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t("Organizasyon")}</span>
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

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t("Dil")}</span>
              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={orgLang}
                onChange={(e) => setOrgLang(e.target.value)}
                disabled={!selectedOrgId}
              >
                {LANG_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                onClick={() => updateOrgLangMut.mutate(orgLang)}
                disabled={
                  !selectedOrgId ||
                  updateOrgLangMut.isPending ||
                  orgLang === orgLangBase
                }
              >
                {t("Kaydet")}
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
              />
              {t("Demo aktif (örnek veriler)")}
            </label>
          </div>
        </div>

        {/* Orgs */}
        <Card title={t("Bağlı Olduğunuz Organizasyonlar")}>
          {orgs.length === 0 ? (
            <div className="text-sm text-gray-500">
              {t("Herhangi bir organizasyona bağlı değilsiniz.")}
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">{t("Ad")}</th>
                    <th className="py-2 px-4">{t("Bölge")}</th>
                    <th className="py-2 px-4">{t("Rolünüz")}</th>
                    <th className="py-2 px-4 text-right">{t("İşlemler")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => {
                    const orgId = o.id;
                    return (
                      <tr key={orgId} className="border-t">
                        <td className="py-2 px-4">{o.name}</td>
                        <td className="py-2 px-4">{o.region || "-"}</td>
                        <td className="py-2 px-4">{prettyOrgRole(o.role, t)}</td>
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
                              {t("Menüyü Yönet")}
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
            {t("Yeni şube açma ihtiyaçlarınızı")}{" "}
            <Link to="/org/branch-requests" className="text-brand-700 underline">
              {t("Şube Talepleri")}
            </Link>{" "}
            {t("ekranından iletebilirsiniz.")}
          </p>
        </Card>

        {/* Reports */}
        <Card
          title={`${t("Raporlar (Organizasyon Genel)")} • ${labelOfPreset(
            preset,
            t
          )}`}
        >
          {/* Range controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t("Periyot")}</span>
              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={preset}
                onChange={(e) => setPreset(e.target.value as any)}
                disabled={useCustomRange || demoMode}
              >
                <option value="day">{t("Günlük")}</option>
                <option value="week">{t("Haftalık")}</option>
                <option value="month">{t("Aylık")}</option>
                <option value="year">{t("Yıllık")}</option>
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={useCustomRange}
                onChange={(e) => setUseCustomRange(e.target.checked)}
                disabled={demoMode}
              />
              {t("Tarih aralığı seç")}
            </label>

            {useCustomRange && !demoMode && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{t("Başlangıç")}</span>
                  <input
                    type="date"
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{t("Bitiş")}</span>
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
                ? t("Demo aktif (örnek veriler)")
                : summaryQ.isFetching || tsQ.isFetching || topQ.isFetching
                ? t("Güncelleniyor...")
                : t("Canlı veri")}
            </div>
          </div>

          {/* KPI Grid */}
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
              {t("Rapor verisi alınırken hata oluştu.")}
            </div>
          )}

          {/* Charts row */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Trend */}
            <div className="rounded-xl border bg-white p-4 shadow-sm lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">{t("Trend")}</div>
                  <div className="text-xs text-gray-500">
                    {metricLabel(tsMetric, currencySymbol, t)} •{" "}
                    {t("bucket")}:{" "}
                    {tsBucket === "day"
                      ? t("Gün")
                      : tsBucket === "week"
                      ? t("Hafta")
                      : t("Ay")}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={tsMetric}
                    onChange={(e) => setTsMetric(e.target.value as Metric)}
                  >
                    <option value="sales">{t("Satış")}</option>
                    <option value="orders">{t("Sipariş")}</option>
                    <option value="reservations">{t("Rezervasyon")}</option>
                    <option value="no_show">{t("No-show")}</option>
                    <option value="cancelled">{t("İptaller")}</option>
                    <option value="deposits">{t("Depozito")}</option>
                  </select>

                  <select
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={tsBucket}
                    onChange={(e) => setTsBucket(e.target.value as any)}
                  >
                    <option value="day">{t("Gün")}</option>
                    <option value="week">{t("Hafta")}</option>
                    <option value="month">{t("Ay")}</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 h-64">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    {t("Veri yok.")}
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

            {/* Quick stats */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="font-semibold text-sm">{t("Hızlı İstatistik")}</div>
              <div className="mt-1 text-xs text-gray-500">
                {t("Rezervasyon davranış metrikleri")}
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">{t("No-show oranı")}</div>
                  <div className="text-sm font-semibold">{pct(noShowRate)}</div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-rose-500"
                    style={{ width: `${Math.min(100, Math.round(noShowRate * 100))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">{t("İptal oranı")}</div>
                  <div className="text-sm font-semibold">{pct(cancelRate)}</div>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${Math.min(100, Math.round(cancelRate * 100))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">{t("Depozito dönüşüm")}</div>
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
                <div className="font-semibold text-sm">{t("Top Restoranlar")}</div>
                <div className="text-xs text-gray-500">
                  {topMetric === "sales"
                    ? t("Ciro ({symbol})", { symbol: currencySymbol })
                    : topMetric === "orders"
                    ? t("Sipariş")
                    : t("Rezervasyon")}{" "}
                  {t("bazlı")}
                </div>
              </div>

              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={topMetric}
                onChange={(e) => setTopMetric(e.target.value as any)}
              >
                <option value="sales">{t("Satış")}</option>
                <option value="orders">{t("Sipariş")}</option>
                <option value="reservations">{t("Rezervasyon")}</option>
              </select>
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Chart */}
              <div className="h-72">
                {topRows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    {t("Veri yok.")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topRows.slice(0, 10).map((r) => ({
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
                      <Bar
                        dataKey="value"
                        name={t("Değer")}
                        fill="#4F46E5"
                        radius={[8, 8, 8, 8]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Table */}
              <div className="overflow-auto border rounded-xl">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-3">{t("Restoran")}</th>
                      <th className="py-2 px-3 text-right">{t("Değer")}</th>
                      <th className="py-2 px-3 text-right">{t("İşlem")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRows.length === 0 ? (
                      <tr className="border-t">
                        <td className="py-2 px-3 text-gray-500" colSpan={3}>
                          {t("Veri yok.")}
                        </td>
                      </tr>
                    ) : (
                      topRows.slice(0, 10).map((r) => {
                        const rid = String(r.restaurantId);
                        const rname = String(r.restaurantName || rid);

                        return (
                          <tr key={rid} className="border-t">
                            <td className="py-2 px-3">{rname}</td>
                            <td className="py-2 px-3 text-right">
                              {topMetric === "sales"
                                ? fmtMoneyWithSymbol(r.value, currencySymbol, locale)
                                : fmtInt(r.value, locale)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenRestaurantId(rid);
                                  setOpenRestaurantName(rname);
                                }}
                                title={t("Restoran raporunu görüntüle")}
                              >
                                {t("Detay")}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                <div className="p-3 text-xs text-gray-500">
                  {t("Detay raporu yan panelde açılır.")}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Drawer */}
      <Drawer
        open={Boolean(openRestaurantId)}
        title={<span>{t("Restoran Raporu")} • {openRestaurantName}</span>}
        onClose={() => {
          setOpenRestaurantId(null);
          setOpenRestaurantName("");
        }}
      >
        {demoMode ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              {t("Demo açıkken restoran raporu gösterilmez. Demo’yu kapatıp tekrar deneyin.")}
            </div>
          </div>
        ) : restSummaryQ.isLoading ? (
          <div className="text-sm text-gray-500">{t("Yükleniyor...")}</div>
        ) : restSummaryQ.isError ? (
          <div className="text-sm text-red-600">{t("Restoran raporu alınamadı.")}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="text-[11px] tracking-wide text-gray-500">{t("Satış")}</div>
                <div className="mt-1 text-base font-semibold">
                  {fmtMoneyWithSymbol(restSummaryQ.data?.totals?.salesTotal, currencySymbol, locale)}
                </div>
              </div>
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="text-[11px] tracking-wide text-gray-500">{t("Sipariş")}</div>
                <div className="mt-1 text-base font-semibold">
                  {fmtInt(restSummaryQ.data?.totals?.ordersCount, locale)}
                </div>
              </div>
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="text-[11px] tracking-wide text-gray-500">{t("Rezervasyon")}</div>
                <div className="mt-1 text-base font-semibold">
                  {fmtInt(restSummaryQ.data?.totals?.reservationsCount, locale)}
                </div>
              </div>
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="text-[11px] tracking-wide text-gray-500">{t("No-show")}</div>
                <div className="mt-1 text-base font-semibold">
                  {fmtInt(restSummaryQ.data?.totals?.noShowCount, locale)}
                </div>
              </div>
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="text-[11px] tracking-wide text-gray-500">{t("İptaller")}</div>
                <div className="mt-1 text-base font-semibold">
                  {fmtInt(restSummaryQ.data?.totals?.cancelledCount, locale)}
                </div>
              </div>
              <div className="rounded-xl border bg-white p-3 shadow-sm">
                <div className="text-[11px] tracking-wide text-gray-500">{t("Depozito")}</div>
                <div className="mt-1 text-base font-semibold">
                  {fmtMoneyWithSymbol(
                    restSummaryQ.data?.totals?.depositPaidTotal,
                    currencySymbol,
                    locale
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
