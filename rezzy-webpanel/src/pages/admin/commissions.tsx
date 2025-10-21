// pages/admin/commissions.tsx
import React from "react";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { adminPreviewCommissions, adminExportCommissions } from "../../api/client";

function thisMonth() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function AdminCommissionsPage() {
  const [month, setMonth] = React.useState<string>(thisMonth());
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<any[]>([]);
  const [meta, setMeta] = React.useState<{ month: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminPreviewCommissions(month);
      setRows(data.restaurants || []);
      setMeta({ month: data.month });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const download = async () => {
    setLoading(true);
    try {
      const blob = await adminExportCommissions(month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rezzy-komisyon-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  const totalArrived = rows.reduce((a, r) => a + (r.arrivedCount || 0), 0);
  const totalRevenue = rows.reduce((a, r) => a + (r.revenueArrived || 0), 0);
  const totalCommission = rows.reduce((a, r) => a + (r.commissionAmount || 0), 0);

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/admin", label: "Dashboard" },
          { to: "/admin/restaurants", label: "Restoranlar" },
          { to: "/admin/users", label: "Kullanıcılar" },
          { to: "/admin/reservations", label: "Rezervasyonlar" },
          { to: "/admin/moderation", label: "Moderasyon" },
          { to: "/admin/commissions", label: "Komisyonlar" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Komisyon Raporu (Sadece <b>Arrived</b>)</h2>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e)=>setMonth(e.target.value)}
              className="border rounded-lg px-3 py-1.5"
            />
            <button
              onClick={download}
              disabled={loading}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
            >
              Excel İndir
            </button>
          </div>
        </div>

        <Card title={`Özet — ${meta?.month || month}`}>
          {loading ? (
            <div>Yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-gray-500">Kayıt yok</div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">Restoran</th>
                    <th className="py-2 px-4">Sahip</th>
                    <th className="py-2 px-4">Arrived</th>
                    <th className="py-2 px-4">Arrived Toplam (₺)</th>
                    <th className="py-2 px-4">Komisyon Oranı</th>
                    <th className="py-2 px-4">Komisyon (₺)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id} className="border-t">
                      <td className="py-2 px-4">{r.restaurantName}</td>
                      <td className="py-2 px-4">{r.ownerName || "-"} <span className="text-gray-500">{r.ownerEmail ? `(${r.ownerEmail})` : ""}</span></td>
                      <td className="py-2 px-4">{r.arrivedCount}</td>
                      <td className="py-2 px-4">{Number(r.revenueArrived || 0).toLocaleString("tr-TR")}</td>
                      <td className="py-2 px-4">{(Number(r.commissionRate || 0) * 100).toFixed(1)}%</td>
                      <td className="py-2 px-4">{Number(r.commissionAmount || 0).toLocaleString("tr-TR")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-2 px-4">GENEL</td>
                    <td />
                    <td className="py-2 px-4">{totalArrived}</td>
                    <td className="py-2 px-4">{totalRevenue.toLocaleString("tr-TR")}</td>
                    <td />
                    <td className="py-2 px-4">{totalCommission.toLocaleString("tr-TR")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}