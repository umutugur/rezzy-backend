import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";

type KpiResp = {
  counts?: Partial<Record<"total"|"pending"|"confirmed"|"arrived"|"cancelled"|"no_show", number>>;
  totals?: { gross?: number; deposit?: number };
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

  const counts = data?.counts || {};
  const totals = data?.totals || {};
  // total yoksa bütün statülerin toplamını al (no_show dahil)
  const total =
    counts.total ??
    ((counts.pending ?? 0) +
      (counts.confirmed ?? 0) +
      (counts.arrived ?? 0) +
      (counts.cancelled ?? 0) +
      (counts.no_show ?? 0));

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Toplam Ciro (₺)">
            <div className="text-2xl font-semibold">
              {(totals.gross ?? 0).toLocaleString("tr-TR")}
            </div>
          </Card>
          <Card title="Toplam Depozito (₺)">
            <div className="text-2xl font-semibold">
              {(totals.deposit ?? 0).toLocaleString("tr-TR")}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
