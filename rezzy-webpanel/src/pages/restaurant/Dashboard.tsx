// pages/restaurant/Dashboard.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { restaurantGetInsights, api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";

type Insight = {
  counts?: Partial<Record<"total"|"pending"|"confirmed"|"arrived"|"cancelled"|"no_show", number>>;
  totals?: { gross?: number; deposit?: number };
  range?: { from: string; to: string };
};

type Row = {
  _id: string;
  dateTimeUTC: string;
  partySize: number;
  status: "pending" | "confirmed" | "arrived" | "cancelled" | "no_show" | string;
  user?: { name?: string; email?: string };
  totalPrice?: number;
  depositAmount?: number;
};

function rangeParams(sel: string): { from?: string; to?: string } {
  const today = new Date();
  const startOfMonth = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0,10);
  switch (sel) {
    case "month": return { from: fmt(startOfMonth), to: fmt(today) };
    case "30":    return { from: fmt(daysAgo(30)),   to: fmt(today) };
    case "90":    return { from: fmt(daysAgo(90)),   to: fmt(today) };
    case "all":   return {};
    default:      return { from: fmt(daysAgo(90)),   to: fmt(today) };
  }
}

const trStatus: Record<string, string> = {
  pending: "Bekleyen",
  confirmed: "Onaylı",
  arrived: "Geldi",
  no_show: "Gelmedi",
  cancelled: "İptal",
};
function fmtStatus(s: string) { return trStatus[s] ?? s; }

function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDT(iso: string) {
  try { return new Date(iso).toLocaleString("tr-TR"); } catch { return iso; }
}
function pillClass(s: string) {
  switch (s) {
    case "pending":   return "bg-yellow-100 text-yellow-800";
    case "confirmed": return "bg-blue-100 text-blue-800";
    case "arrived":   return "bg-green-100 text-green-800";
    case "no_show":   return "bg-gray-200 text-gray-700";
    case "cancelled": return "bg-red-100 text-red-800";
    default:          return "bg-gray-100 text-gray-700";
  }
}

async function fetchUpcoming(rid: string): Promise<Row[]> {
  const { data } = await api.get(`/restaurants/${rid}/reservations`, {
    params: { from: ymd(new Date()), limit: 8 }
  });
  // backend hem {items:[]} hem [] dönebiliyor olabilir
  return Array.isArray(data) ? data as Row[] : (data?.items ?? []);
}

export default function RestaurantDashboardPage() {
  const rid = asId(authStore.getUser()?.restaurantId) || "";
  const [sel, setSel] = React.useState<"month"|"30"|"90"|"all">("90");

  const { data, isLoading, error } = useQuery<Insight>({
    queryKey: ["restaurant-insights", rid, sel],
    queryFn: () => restaurantGetInsights(rid, rangeParams(sel)),
    enabled: !!rid
  });

  const upc = useQuery<Row[]>({
    queryKey: ["restaurant-upcoming", rid],
    queryFn: () => fetchUpcoming(rid),
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
          // İstersen menüye bunları da ekleyebilirsin:
          // { to: "/restaurant/opening-hours", label: "Çalışma Saatleri" },
          // { to: "/restaurant/tables", label: "Masalar" },
          // { to: "/restaurant/menus", label: "Menüler" },
          // { to: "/restaurant/photos", label: "Fotoğraflar" },
          // { to: "/restaurant/policies", label: "Politikalar" },
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

        {/* KPI'lar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Toplam Rezervasyon"><div className="text-2xl font-semibold">{total}</div></Card>
          <Card title="Onaylı"><div className="text-2xl font-semibold">{counts.confirmed ?? 0}</div></Card>
          <Card title="İptal"><div className="text-2xl font-semibold">{counts.cancelled ?? 0}</div></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Bekleyen"><div className="text-2xl font-semibold">{counts.pending ?? 0}</div></Card>
          <Card title="Gelen"><div className="text-2xl font-semibold">{counts.arrived ?? 0}</div></Card>
          <Card title="Gelmedi"><div className="text-2xl font-semibold">{counts.no_show ?? 0}</div></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Toplam Ciro (₺)"><div className="text-2xl font-semibold">{(totals.gross ?? 0).toLocaleString("tr-TR")}</div></Card>
          <Card title="Toplam Depozito (₺)"><div className="text-2xl font-semibold">{(totals.deposit ?? 0).toLocaleString("tr-TR")}</div></Card>
        </div>

        {/* Yaklaşan Rezervasyonlar */}
        <Card title="Yaklaşan Rezervasyonlar">
          {upc.isLoading ? (
            <div>Yükleniyor…</div>
          ) : (upc.data?.length ?? 0) === 0 ? (
            <div className="text-sm text-gray-500">Kayıt yok</div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">Tarih</th>
                    <th className="py-2 px-4">Kullanıcı</th>
                    <th className="py-2 px-4">Kişi</th>
                    <th className="py-2 px-4">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {upc.data!.map((r)=>(
                    <tr key={r._id} className="border-t">
                      <td className="py-2 px-4">{fmtDT(r.dateTimeUTC)}</td>
                      <td className="py-2 px-4">
                        {r.user?.name || "-"}{" "}
                        <span className="text-gray-500">{r.user?.email ? `(${r.user.email})` : ""}</span>
                      </td>
                      <td className="py-2 px-4">{r.partySize}</td>
                      <td className="py-2 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${pillClass(r.status)}`}>
                          {fmtStatus(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
