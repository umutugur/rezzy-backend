import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { showToast } from "../../ui/Toast";

type Row = {
  _id: string;
  dateTimeUTC: string;
  status: string;
  partySize?: number;
  totalPrice?: number;
  // backend farklı şekillerde döndürebilir:
  restaurant?: { name?: string; title?: string };
  restaurantName?: string;
  restaurantId?: any;
  user?: { name?: string; email?: string };
  userName?: string;
  userEmail?: string;
  userId?: any;
};
type Resp = { items: Row[]; total: number; page: number; limit: number };

const trStatus: Record<string, string> = {
  pending: "Bekleyen",
  confirmed: "Onaylı",
  arrived: "Geldi",
  cancelled: "İptal",
  no_show: "Gelmedi"
};

const getRestaurantLabel = (r: Row) =>
  r.restaurant?.name ||
  r.restaurant?.title ||
  (typeof r.restaurantId === "object" ? r.restaurantId?.name : undefined) ||
  r.restaurantName ||
  "-";

const getUserLabel = (r: Row) =>
  r.user?.name || (typeof r.userId === "object" ? r.userId?.name : undefined) || r.userName || "-";

const getUserEmail = (r: Row) =>
  r.user?.email || (typeof r.userId === "object" ? r.userId?.email : undefined) || r.userEmail || "-";

async function fetchAdminReservations(p: {
  status?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}): Promise<Resp> {
  const { data } = await api.get("/admin/reservations", { params: p });
  if (Array.isArray(data)) return { items: data, total: data.length, page: 1, limit: data.length };
  return data as Resp;
}

function toCSV(rows: Row[]) {
  const head = ["Tarih", "Restoran", "Kullanıcı", "E-posta", "Durum", "Kişi", "Tutar"];
  const esc = (s: any) => `"${(s ?? "").toString().replaceAll('"', '""')}"`;
  const lines = rows.map((r) =>
    [
      new Date(r.dateTimeUTC).toLocaleString(),
      getRestaurantLabel(r),
      getUserLabel(r),
      getUserEmail(r),
      trStatus[r.status] || r.status,
      r.partySize ?? "",
      (r.totalPrice ?? "").toString().replace(".", ",")
    ]
      .map(esc)
      .join(";")
  );
  return [head.map(esc).join(";"), ...lines].join("\n");
}

export default function AdminReservationsPage() {
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-reservations", status, from, to, page, limit],
    queryFn: () =>
      fetchAdminReservations({
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit
      })
  });

  const totalPages =
    data && data.limit > 0 ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const handleExport = async () => {
    try {
      const resp = await fetchAdminReservations({
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        page: 1,
        limit: 10000
      });
      const csv = toCSV(resp.items);
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rezervasyonlar-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("CSV indirildi", "success");
    } catch {
      showToast("CSV oluşturulamadı", "error");
    }
  };

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
          <h2 className="text-lg font-semibold">Tüm Rezervasyonlar</h2>
          <button onClick={handleExport} className="rounded-lg bg-gray-900 hover:bg-black text-white px-4 py-2">
            CSV Dışa Aktar
          </button>
        </div>

        <Card title="Filtreler">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Durum</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded-lg px-3 py-2">
                <option value="">Hepsi</option>
                <option value="pending">Bekleyen</option>
                <option value="confirmed">Onaylı</option>
                <option value="arrived">Geldi</option>
                <option value="cancelled">İptal</option>
                <option value="no_show">Gelmedi</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Başlangıç</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Bitiş</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Sayfa</label>
              <input type="number" min={1} value={page} onChange={(e) => setPage(Number(e.target.value) || 1)} className="w-24 border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Limit</label>
              <input type="number" min={1} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 20)} className="w-24 border rounded-lg px-3 py-2" />
            </div>
            <button onClick={() => refetch()} className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2" disabled={isFetching}>
              {isFetching ? "Getiriliyor…" : "Uygula"}
            </button>
          </div>
        </Card>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Liste çekilemedi</div>}

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">Tarih</th>
                <th className="py-2 px-4">Restoran</th>
                <th className="py-2 px-4">Kullanıcı</th>
                <th className="py-2 px-4">Durum</th>
                <th className="py-2 px-4">Kişi</th>
                <th className="py-2 px-4">Tutar (₺)</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((r) => (
                <tr key={r._id} className="border-t">
                  <td className="py-2 px-4">{new Date(r.dateTimeUTC).toLocaleString()}</td>
                  <td className="py-2 px-4">{getRestaurantLabel(r)}</td>
                  <td className="py-2 px-4">
                    {getUserLabel(r)} <span className="text-gray-500">({getUserEmail(r)})</span>
                  </td>
                  <td className="py-2 px-4">{trStatus[r.status] || r.status}</td>
                  <td className="py-2 px-4">{r.partySize ?? "-"}</td>
                  <td className="py-2 px-4">{r.totalPrice?.toLocaleString("tr-TR") ?? "-"}</td>
                </tr>
              ))}
              {(!data?.items || data.items.length === 0) && (
                <tr><td className="py-3 px-4 text-gray-500" colSpan={6}>Kayıt yok</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data && (
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Önceki</button>
            <div className="text-sm text-gray-600">Sayfa {page} / {totalPages} • Toplam {data.total}</div>
            <button className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki</button>
          </div>
        )}
      </div>
    </div>
  );
}
