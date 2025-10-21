import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";

/** ---- API response tipleri (admin.controller.kpiGlobal ile uyumlu) ---- */
type ReservationsCounts = Partial<
  Record<"total" | "pending" | "confirmed" | "arrived" | "cancelled" | "no_show", number>
>;
type KpiTotalsFromApi = {
  reservations: ReservationsCounts;
  revenue: number;   // tüm statülerde totalPrice toplamı
  deposits: number;  // tüm statülerde depositAmount toplamı (breakdown yok)
  rates?: { confirm?: number; checkin?: number; cancel?: number };
  commission?: number;
};
type KpiResp = {
  range?: { start?: string | null; end?: string | null; groupBy?: string };
  totals?: KpiTotalsFromApi;
  // series, commissions vs. geliyor ama bu sayfada kullanılmıyor
};

function rangeParams(sel: "month" | "30" | "90" | "all"): { start?: string; end?: string } {
  const today = new Date();
  const startOfMonth = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (sel) {
    case "month":
      return { start: fmt(startOfMonth), end: fmt(today) };
    case "30":
      return { start: fmt(daysAgo(30)), end: fmt(today) };
    case "90":
      return { start: fmt(daysAgo(90)), end: fmt(today) };
    case "all":
    default:
      return {};
  }
}

async function fetchKpi(params: { start?: string; end?: string }): Promise<KpiResp> {
  const { data } = await api.get("/admin/kpi/global", { params });
  return (data || {}) as KpiResp;
}

export default function AdminDashboardPage() {
  const [sel, setSel] = React.useState<"month" | "30" | "90" | "all">("90");
  const params = React.useMemo(() => rangeParams(sel), [sel]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-kpi-global", params],
    queryFn: () => fetchKpi(params),
  });

  const totals = data?.totals || ({} as KpiTotalsFromApi);
  const counts = totals.reservations || {};

  // Toplam rezervasyon sayısı (total yoksa statülerin toplamı)
  const totalCount =
    counts.total ??
    ((counts.pending ?? 0) +
      (counts.confirmed ?? 0) +
      (counts.arrived ?? 0) +
      (counts.cancelled ?? 0) +
      (counts.no_show ?? 0));

  // --- Finans kartları ---
  // Backend global "deposits" breakdown vermiyor; restoran dashboard ile aynı görünümü
  // yakalamak için "arrivedBrüt + (confirmed+no_show depozitosu)" formülünü yaklaşık gösteriyoruz:
  //   arrivedBrüt ≈ revenue - deposits
  //   displayDeposit ≈ deposits
  const revenue = Number(totals.revenue || 0);
  const deposits = Number(totals.deposits || 0);

  const arrivedGrossApprox = Math.max(0, revenue - deposits);
  const displayDeposit = deposits; // breakdown yoksa, mevcut depozitonun tamamını göster
  const displayGross = arrivedGrossApprox + displayDeposit;

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Genel KPI</h2>
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value as any)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="month">Bu ay</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 90 gün</option>
            <option value="all">Tümü</option>
          </select>
        </div>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Veri alınamadı</div>}

        {/* Sayaçlar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Toplam Rezervasyon">
            <div className="text-2xl font-semibold">{totalCount}</div>
          </Card>
          <Card title="Onaylı">
            <div className="text-2xl font-semibold">{counts.confirmed ?? 0}</div>
          </Card>
          <Card title="İptal">
            <div className="text-2xl font-semibold">{counts.cancelled ?? 0}</div>
          </Card>
        </div>

        {/* Finansal özet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Toplam Ciro (₺)">
            <div className="text-2xl font-semibold">
              {Number(displayGross).toLocaleString("tr-TR")}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              (Gelen rezervasyonların toplam bedeli + Onaylı/Gelmedi depozitoları)
            </div>
          </Card>

          <Card title="Toplam Depozito (₺)">
            <div className="text-2xl font-semibold">
              {Number(displayDeposit).toLocaleString("tr-TR")}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              (Sadece Onaylı ve Gelmedi rezervasyonların depozitoları — breakdown yoksa toplam depozito gösterilir)
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}