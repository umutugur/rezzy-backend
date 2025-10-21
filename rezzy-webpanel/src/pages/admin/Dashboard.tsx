import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";

type Counts = Partial<
  Record<"total" | "pending" | "confirmed" | "arrived" | "cancelled" | "no_show", number>
>;

type Totals = {
  // Eski alanlar (geri uyumluluk)
  gross?: number;          // geçmişte "genel ciro" için kullanılmış olabilir
  deposit?: number;        // geçmişte "toplam depozito" için kullanılmış olabilir

  // Yeni/tercihli alanlar
  arrivedGross?: number;              // sadece arrived için toplam bedel
  depositFromConfirmedNoShow?: number; // confirmed + no_show için sadece depozito toplamı
};

type KpiResp = {
  counts?: Counts;
  totals?: Totals;
};

async function fetchKpi(): Promise<KpiResp> {
  const { data } = await api.get("/admin/kpi/global");
  return (data || {}) as KpiResp;
}

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-kpi-global"],
    queryFn: fetchKpi,
  });

  const counts: Counts = data?.counts || {};
  const totals: Totals = data?.totals || {};

  // Toplam rezervasyon sayısı (counts.total yoksa statülerin toplamı)
  const totalCount =
    counts.total ??
    ((counts.pending ?? 0) +
      (counts.confirmed ?? 0) +
      (counts.arrived ?? 0) +
      (counts.cancelled ?? 0) +
      (counts.no_show ?? 0));

  // ---- Finansal gösterimler (restoran dashboard ile aynı mantık)
  // 1) Depozito yalnız toplamı (confirmed + no_show)
  const displayDeposit =
    totals.depositFromConfirmedNoShow ??
    totals.deposit /* geri uyumluluk */ ??
    0;

  // 2) Arrived brüt ciro (yalnız arrived totalPrice toplami)
  //    Eğer yeni alan yoksa, gross - deposit şeklinde tahmin etmeye çalış.
  const arrivedGrossCalculated =
    totals.arrivedGross ??
    (typeof totals.gross === "number" && typeof displayDeposit === "number"
      ? Math.max(0, totals.gross - displayDeposit)
      : 0);

  // 3) Genel ciro = arrivedGross + confirmed/no_show depozitoları
  const displayGross = arrivedGrossCalculated + displayDeposit;

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
        <h2 className="text-lg font-semibold">Genel KPI</h2>

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
              (Sadece Onaylı ve Gelmedi rezervasyonların depozitoları)
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}