// pages/admin/Dashboard.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";

type Counts = Partial<Record<"total"|"pending"|"confirmed"|"arrived"|"cancelled"|"no_show", number>>;
type Totals = { revenue?: number; deposits?: number };
type KpiResp = {
  totals?: {
    reservations?: Counts;
    revenue?: number;
    deposits?: number;
  };
};

type RangeKind = "today" | "week" | "year" | "custom";

function fmt(d: Date) { return d.toISOString().slice(0,10); }
function startOfWeekUTC(d = new Date()) {
  const day = d.getUTCDay(); // 0: Sun
  const diff = (day + 6) % 7; // Pazartesi başlangıç
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

export default function AdminDashboardPage() {
  const [kind, setKind] = React.useState<RangeKind>("today");
  const [start, setStart] = React.useState<string>(() => fmt(new Date()));
  const [end, setEnd] = React.useState<string>(() => fmt(new Date()));

  // preset seçildiğinde tarihleri güncelle
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

  const counts: Counts = data?.totals?.reservations || {};
  const revenue = data?.totals?.revenue || 0;     // ARRIVED + CONFIRMED olabilir (global KPI kuralına göre)
  const deposits = data?.totals?.deposits || 0;

  const total =
    counts.total ??
    ((counts.pending ?? 0) + (counts.confirmed ?? 0) + (counts.arrived ?? 0) + (counts.cancelled ?? 0) + (counts.no_show ?? 0));

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/banners", label: "Bannerlar" },
          { to: "/admin/commissions", label: "Komisyonlar" }, // ✅ menüye eklendi
          { to: "/admin/organizations", label: "Organizasyonlar" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" },
          { to: "/admin/notifications", label: "Bildirim Gönder" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Genel KPI</h2>

          {/* Tarih seçimi */}
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Ön Ayar</label>
              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={kind}
                onChange={(e)=>setKind(e.target.value as RangeKind)}
              >
                <option value="today">Bugün</option>
                <option value="week">Bu Hafta</option>
                <option value="year">Bu Yıl</option>
                <option value="custom">Özel Aralık</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">Başlangıç</label>
              <input
                type="date"
                className="border rounded-lg px-3 py-2 text-sm"
                value={start}
                onChange={(e)=>{ setStart(e.target.value); setKind("custom"); }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Bitiş</label>
              <input
                type="date"
                className="border rounded-lg px-3 py-2 text-sm"
                value={end}
                onChange={(e)=>{ setEnd(e.target.value); setKind("custom"); }}
              />
            </div>
          </div>
        </div>

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
          <Card title="Toplam Ciro (₺)">
            <div className="text-2xl font-semibold">{Number(revenue || 0).toLocaleString("tr-TR")}</div>
          </Card>
          <Card title="Toplam Depozito (₺)">
            <div className="text-2xl font-semibold">{Number(deposits || 0).toLocaleString("tr-TR")}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}