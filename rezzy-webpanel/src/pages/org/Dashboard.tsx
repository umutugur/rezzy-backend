// rezzy-webpanel/src/pages/org/Dashboard.tsx
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

function fmtMoney(n: any) {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return String(v.toFixed ? v.toFixed(0) : v);
  }
}

function fmtInt(n: any) {
  const v = Number(n || 0);
  return new Intl.NumberFormat("tr-TR").format(v);
}

function toDateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function OrgDashboardPage() {
  const user = authStore.getUser();
  const orgs = useMemo(() => getUserOrganizations(user), [user]);
  const nav = useNavigate();

  // ---- Selection
  const [selectedOrgId, setSelectedOrgId] = useState<string>(() => orgs?.[0]?.id || "");
  // org list değişince ilk org'a düş
  React.useEffect(() => {
    if (!selectedOrgId && orgs?.[0]?.id) setSelectedOrgId(orgs[0].id);
  }, [orgs, selectedOrgId]);

  // ---- Range preset + custom dates
  const [preset, setPreset] = useState<"day" | "week" | "month" | "year">("month");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateInputValue(d);
  });
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));

  const rangeParams = useMemo(() => {
    if (!selectedOrgId) return null;
    if (useCustomRange) {
      // backend resolveRange new Date(from/to) alıyor
      // date input => YYYY-MM-DD; ISO'ya çevirip gönderelim
      const fromISO = new Date(`${fromDate}T00:00:00.000Z`).toISOString();
      const toISO = new Date(`${toDate}T23:59:59.999Z`).toISOString();
      return { from: fromISO, to: toISO };
    }
    return { preset };
  }, [selectedOrgId, preset, useCustomRange, fromDate, toDate]);

  // ---- Timeseries controls
  const [tsMetric, setTsMetric] = useState<
    "sales" | "orders" | "reservations" | "no_show" | "cancelled" | "deposits"
  >("sales");
  const [tsBucket, setTsBucket] = useState<"day" | "week" | "month">("day");

  // ---- Top restaurants metric
  const [topMetric, setTopMetric] = useState<"sales" | "orders" | "reservations">("sales");

  // ---- Queries
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
        tz: "Europe/Istanbul",
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

  const totals = summaryQ.data?.totals;

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
              Bağlı organizasyonlarınızı yönetin ve raporları görüntüleyin.
            </div>
          </div>

          {/* Org selector */}
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
        </div>

        {/* Existing card (kept) */}
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

        {/* Reports */}
        <Card title="Raporlar (Organizasyon Genel)">
          {/* Range controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Periyot</span>
              <select
                className="text-sm border rounded px-2 py-1 bg-white"
                value={preset}
                onChange={(e) => setPreset(e.target.value as any)}
                disabled={useCustomRange}
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
              />
              Tarih aralığı seç
            </label>

            {useCustomRange && (
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
              {summaryQ.isFetching ? "Güncelleniyor..." : null}
            </div>
          </div>

          {/* KPI Grid */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-gray-500">Toplam Satış</div>
              <div className="text-base font-semibold">
                {totals ? fmtMoney(totals.salesTotal) : "-"}
              </div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-gray-500">Sipariş</div>
              <div className="text-base font-semibold">
                {totals ? fmtInt(totals.ordersCount) : "-"}
              </div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-gray-500">Rezervasyon</div>
              <div className="text-base font-semibold">
                {totals ? fmtInt(totals.reservationsCount) : "-"}
              </div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-gray-500">No-Show</div>
              <div className="text-base font-semibold">
                {totals ? fmtInt(totals.noShowCount) : "-"}
              </div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-gray-500">İptal</div>
              <div className="text-base font-semibold">
                {totals ? fmtInt(totals.cancelledCount) : "-"}
              </div>
            </div>
            <div className="rounded border bg-white p-3">
              <div className="text-xs text-gray-500">Depozito (Ödenen)</div>
              <div className="text-base font-semibold">
                {totals ? fmtMoney(totals.depositPaidTotal) : "-"}
              </div>
              <div className="text-[11px] text-gray-500 mt-1">
                {totals ? `${fmtInt(totals.depositPaidCount)} ödeme` : ""}
              </div>
            </div>
          </div>

          {/* Errors */}
          {(summaryQ.isError || tsQ.isError || topQ.isError) && (
            <div className="mt-4 text-sm text-red-600">
              Rapor verisi alınırken hata oluştu. (Auth/rol veya endpoint kontrol et)
            </div>
          )}

          {/* Timeseries */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm">Trend</div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="text-sm border rounded px-2 py-1 bg-white"
                    value={tsMetric}
                    onChange={(e) => setTsMetric(e.target.value as any)}
                  >
                    <option value="sales">Satış (₺)</option>
                    <option value="orders">Sipariş (adet)</option>
                    <option value="reservations">Rezervasyon (adet)</option>
                    <option value="no_show">No-show (adet)</option>
                    <option value="cancelled">İptal (adet)</option>
                    <option value="deposits">Depozito (₺)</option>
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

              <div className="mt-3 text-xs text-gray-500">
                Grafik kütüphanesi varsaymıyorum. Şimdilik “noktalar” listesini veriyorum; istersen Recharts/Chart.js ile burayı chart’a çeviririz.
              </div>

              <div className="mt-3 max-h-64 overflow-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-3">Tarih</th>
                      <th className="py-2 px-3 text-right">Değer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tsQ.data?.points ?? []).length === 0 ? (
                      <tr className="border-t">
                        <td className="py-2 px-3 text-gray-500" colSpan={2}>
                          Veri yok.
                        </td>
                      </tr>
                    ) : (
                      (tsQ.data?.points ?? []).map((p: any) => (
                        <tr key={String(p.t)} className="border-t">
                          <td className="py-2 px-3">{new Date(p.t).toLocaleString("tr-TR")}</td>
                          <td className="py-2 px-3 text-right">
                            {tsMetric === "sales" || tsMetric === "deposits"
                              ? fmtMoney(p.value)
                              : fmtInt(p.value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top restaurants */}
            <div className="rounded border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm">En İyi Restoranlar</div>
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

              <div className="mt-3 overflow-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-3">Restoran</th>
                      <th className="py-2 px-3 text-right">Değer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(topQ.data?.rows ?? []).length === 0 ? (
                      <tr className="border-t">
                        <td className="py-2 px-3 text-gray-500" colSpan={2}>
                          Veri yok.
                        </td>
                      </tr>
                    ) : (
                      (topQ.data?.rows ?? []).map((r: any) => (
                        <tr key={String(r.restaurantId)} className="border-t">
                          <td className="py-2 px-3">{r.restaurantName || String(r.restaurantId)}</td>
                          <td className="py-2 px-3 text-right">
                            {topMetric === "sales" ? fmtMoney(r.value) : fmtInt(r.value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                İstersen buradan restoran detay sayfasına drill-down ekleriz (restaurantId ile).
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}