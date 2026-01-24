// pages/admin/commissions.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { adminPreviewCommissions, adminExportCommissions } from "../../api/client";
import { showToast } from "../../ui/Toast";

function currentMonth() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

export default function AdminCommissionsPage() {
  const [month, setMonth] = React.useState<string>(currentMonth());

  const q = useQuery({
    queryKey: ["admin-commissions", month],
    queryFn: () => adminPreviewCommissions(month),
  });

  const rows = q.data?.restaurants || [];

  const downloadExcel = async () => {
    try {
      const blob = await adminExportCommissions(month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rezvix-komisyon-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast(e?.message || "Excel indirilemedi", "error");
    }
  };

  const totalArrived = rows.reduce((a,r)=>a + (r.arrivedCount || 0), 0);
  const totalRevenue = rows.reduce((a,r)=>a + (r.revenueArrived || 0), 0);
  const totalCommission = rows.reduce((a,r)=>a + (r.commissionAmount || 0), 0);

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
          <h2 className="text-lg font-semibold">Aylık Komisyonlar</h2>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Ay</label>
              <input
                type="month"
                className="border rounded-lg px-3 py-2 text-sm"
                value={month}
                onChange={(e)=>setMonth(e.target.value)}
              />
            </div>
            <button
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              onClick={downloadExcel}
              disabled={q.isLoading}
            >
              {q.isLoading ? "Hazırlanıyor…" : "Excel’e Aktar"}
            </button>
          </div>
        </div>

        {q.isLoading && <div>Yükleniyor…</div>}
        {q.error && <div className="text-red-600 text-sm">Veri alınamadı</div>}

        <Card title={`Özet • ${q.data?.month || month}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="text-xs text-gray-600">Arrived Rezervasyon</div>
              <div className="text-xl font-semibold">{totalArrived}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="text-xs text-gray-600">Arrived Toplam (₺)</div>
              <div className="text-xl font-semibold">{totalRevenue.toLocaleString("tr-TR")}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border">
              <div className="text-xs text-gray-600">Komisyon Toplamı (₺)</div>
              <div className="text-xl font-semibold">{totalCommission.toLocaleString("tr-TR")}</div>
            </div>
          </div>
        </Card>

        <div className="overflow-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">Restoran</th>
                <th className="py-2 px-4">Sahip</th>
                <th className="py-2 px-4">E-posta</th>
                <th className="py-2 px-4">Arrived</th>
                <th className="py-2 px-4">Arrived Toplam (₺)</th>
                <th className="py-2 px-4">Komisyon Oranı</th>
                <th className="py-2 px-4">Komisyon (₺)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r:any)=>(
                <tr key={r._id} className="border-t">
                  <td className="py-2 px-4">{r.restaurantName}</td>
                  <td className="py-2 px-4">{r.ownerName || "—"}</td>
                  <td className="py-2 px-4">{r.ownerEmail || "—"}</td>
                  <td className="py-2 px-4">{r.arrivedCount}</td>
                  <td className="py-2 px-4">{Number(r.revenueArrived || 0).toLocaleString("tr-TR")}</td>
                  <td className="py-2 px-4">{Number(r.commissionRate || 0)}</td>
                  <td className="py-2 px-4">{Number(r.commissionAmount || 0).toLocaleString("tr-TR")}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="py-4 px-4 text-gray-500" colSpan={7}>Kayıt yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}