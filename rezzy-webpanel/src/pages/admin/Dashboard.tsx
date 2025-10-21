import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";

type KpiResp = {
  totals?: {
    reservations?: Partial<Record<"total"|"pending"|"confirmed"|"arrived"|"cancelled"|"no_show", number>>;
    breakdown?: { arrivedRevenue?: number; depositFromConfirmedNoShow?: number };
    commission?: number;
  };
};

async function fetchKpi(): Promise<KpiResp> {
  const { data } = await api.get("/admin/kpi/global");
  return (data || {}) as KpiResp;
}

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-kpi-global"],
    queryFn: fetchKpi
  });

  const counts = data?.totals?.reservations || {};
  const total =
    counts.total ??
    ((counts.pending ?? 0) +
     (counts.confirmed ?? 0) +
     (counts.arrived ?? 0) +
     (counts.cancelled ?? 0) +
     (counts.no_show ?? 0));

  const arrivedRevenue = Number(data?.totals?.breakdown?.arrivedRevenue || 0);
  const depositCnfNoShow = Number(data?.totals?.breakdown?.depositFromConfirmedNoShow || 0);
  const grossForDashboard = arrivedRevenue + depositCnfNoShow;
  const totalCommission = Number(data?.totals?.commission || 0);

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" }
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">Genel KPI</h2>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Veri alınamadı</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Toplam Rezervasyon">
            <div className="text-2xl font-semibold">{total}</div>
          </Card>
          <Card title="Onaylı">
            <div className="text-2xl font-semibold">{counts.confirmed ?? 0}</div>
          </Card>
          <Card title="İptal">
            <div className="text-2xl font-semibold">{counts.cancelled ?? 0}</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="Toplam Ciro (₺)">
            <div className="text-2xl font-semibold">
              {grossForDashboard.toLocaleString("tr-TR")}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              (Gelen rezervasyonların toplam bedeli + Onaylı/Gelmedi depozitoları)
            </div>
          </Card>

          <Card title="Toplam Depozito (₺)">
            <div className="text-2xl font-semibold">
              {depositCnfNoShow.toLocaleString("tr-TR")}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              (Sadece Onaylı ve Gelmedi rezervasyonların depozitoları)
            </div>
          </Card>

          <Card title="Toplam Komisyon (₺)">
            <div className="text-2xl font-semibold">
              {totalCommission.toLocaleString("tr-TR")}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              (Underattendance kuralı uygulanarak hesaplanmış toplam komisyon)
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}