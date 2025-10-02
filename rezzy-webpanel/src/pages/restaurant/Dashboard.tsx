import React from "react";
import { useQuery } from "@tanstack/react-query";
import { restaurantGetInsights } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";

type Insight = {
  counts?: Partial<Record<"total"|"pending"|"confirmed"|"arrived"|"cancelled"|"no_show", number>>;
  totals?: { gross?: number; deposit?: number };
  range?: { from: string; to: string };
};

function rangeParams(sel: string): { from?: string; to?: string } {
  const today = new Date();
  const startOfMonth = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0,10);
  switch (sel) {
    case "month":   return { from: fmt(startOfMonth), to: fmt(today) };
    case "30":      return { from: fmt(daysAgo(30)), to: fmt(today) };
    case "90":      return { from: fmt(daysAgo(90)), to: fmt(today) };
    case "all":     return {};
    default:        return { from: fmt(daysAgo(90)), to: fmt(today) };
  }
}

export default function RestaurantDashboardPage() {
  const rid = asId(authStore.getUser()?.restaurantId) || "";
  const [sel, setSel] = React.useState<"month"|"30"|"90"|"all">("90");

  const { data, isLoading, error } = useQuery<Insight>({
    queryKey: ["restaurant-insights", rid, sel],
    queryFn: () => restaurantGetInsights(rid, rangeParams(sel)),
    enabled: !!rid
  });

  const counts = data?.counts || {};
  const totals = data?.totals || {};
  const total =
    counts.total ??
    ((counts.pending ?? 0) + (counts.confirmed ?? 0) + (counts.arrived ?? 0) + (counts.cancelled ?? 0) + (counts.no_show ?? 0));

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: "Dashboard" },
          { to: "/restaurant/reservations", label: "Rezervasyonlar" },
          { to: "/restaurant/profile", label: "Profil & Ayarlar" }
        ]}
      />
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Restoran Özeti</h2>
          <select
            value={sel}
            onChange={(e)=>setSel(e.target.value as any)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="month">Bu ay</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 90 gün</option>
            <option value="all">Tümü</option>
          </select>
        </div>

        {!rid && <div className="text-sm text-red-600">restaurantId bulunamadı.</div>}
        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Veri alınamadı</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Toplam Rezervasyon"><div className="text-2xl font-semibold">{total}</div></Card>
          <Card title="Onaylı"><div className="text-2xl font-semibold">{counts.confirmed ?? 0}</div></Card>
          <Card title="İptal"><div className="text-2xl font-semibold">{counts.cancelled ?? 0}</div></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Toplam Ciro (₺)"><div className="text-2xl font-semibold">{(totals.gross ?? 0).toLocaleString("tr-TR")}</div></Card>
          <Card title="Toplam Depozito (₺)"><div className="text-2xl font-semibold">{(totals.deposit ?? 0).toLocaleString("tr-TR")}</div></Card>
        </div>
      </div>
    </div>
  );
}
