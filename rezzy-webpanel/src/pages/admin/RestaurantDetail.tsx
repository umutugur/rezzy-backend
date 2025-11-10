import React from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import {
  adminGetRestaurant,
  adminUpdateRestaurantCommission,
  adminListReservationsByRestaurant,
  adminUpdateRestaurant
} from "../../api/client";
import { showToast } from "../../ui/Toast";

// ---- Tipler
type RestaurantInfo = {
  _id: string;
  name: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  region?: string;
  isActive?: boolean;
  // Yeni model: 0..1 arası oran
  commissionRate?: number;
  // Eski alanlarla geriye dönük uyumluluk:
  commissionPct?: number; // 0..100 arası tutulmuş olabilir
  commission?: number;    // 0..100 arası tutulmuş olabilir
};

type Rsv = {
  _id: string;
  dateTimeUTC: string;
  status: string;
  partySize?: number;
  totalPrice?: number;
  user?: { name?: string; email?: string };
};

type RsvList = { items: Rsv[]; total: number; page: number; limit: number };

export default function AdminRestaurantDetailPage() {
  const params = useParams();
  const rid = params.rid ?? "";
  const qc = useQueryClient();

  const [commission, setCommission] = React.useState<string>("");
  const [isActive, setIsActive] = React.useState<boolean>(true);

  // Restoran bilgisi
  const infoQ = useQuery<RestaurantInfo | null>({
    queryKey: ["admin-restaurant", rid],
    queryFn: async () => (await adminGetRestaurant(rid)) as RestaurantInfo,
    enabled: !!rid
  });

  React.useEffect(() => {
    const d = infoQ.data;
    if (!d) return;

    // Komisyonu normalize et:
    // 1) Tercih edilen alan: commissionRate (0..1)
    // 2) Eski alanlar: commissionPct / commission (0..100)
    let pct = 5; // varsayılan %5
    if (typeof d.commissionRate === "number") {
      pct = d.commissionRate * 100;
    } else if (typeof d.commissionPct === "number") {
      pct = d.commissionPct;
    } else if (typeof d.commission === "number") {
      pct = d.commission;
    }
    setCommission(String(pct));

    // Aktif/pasif durumu
    setIsActive(typeof d.isActive === "boolean" ? d.isActive : true);
  }, [infoQ.data]);

  // Liste filtreleri
  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  // Restoranın rezervasyonları
  const rsvQ = useQuery<RsvList>({
    queryKey: ["admin-r-rsv", rid, status, from, to, page, limit],
    queryFn: async () =>
      (await adminListReservationsByRestaurant(rid, {
        status: status || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit
      })) as RsvList,
    enabled: !!rid
  });

  const activeMut = useMutation({
    mutationFn: (next: boolean) => adminUpdateRestaurant(rid, { isActive: next }),
    onSuccess: () => {
      showToast("Restoran durumu güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-restaurant", rid] });
    },
    onError: () => {
      showToast("Restoran durumu güncellenemedi", "error");
    }
  });

  // Komisyon kaydet
  const saveMut = useMutation({
    mutationFn: () => {
      const raw = Number(commission);
      if (Number.isNaN(raw) || raw < 0) {
        throw new Error("Geçerli bir komisyon oranı girin");
      }
      const rate = raw / 100; // % değerini 0..1'e çevir
      return adminUpdateRestaurantCommission(rid, rate);
    },
    onSuccess: () => {
      showToast("Komisyon güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["admin-restaurant", rid] });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Komisyon güncellenemedi";
      showToast(msg, "error");
    }
  });

  const totalPages =
    rsvQ.data && rsvQ.data.limit > 0 ? Math.ceil(rsvQ.data.total / rsvQ.data.limit) : 1;

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
        <h2 className="text-lg font-semibold">{infoQ.data?.name || "Restoran Detayı"}</h2>

        <Card title="Bilgiler">
          {infoQ.isLoading ? (
            "Yükleniyor…"
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-sm">Şehir</span>
                <div>{infoQ.data?.city || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Adres</span>
                <div>{infoQ.data?.address || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Telefon</span>
                <div>{infoQ.data?.phone || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">E-posta</span>
                <div>{infoQ.data?.email || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Bölge</span>
                <div>{infoQ.data?.region || "-"}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">Aktif</span>
                <input
                  type="checkbox"
                  checked={!!isActive}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIsActive(next);
                    activeMut.mutate(next);
                  }}
                  disabled={activeMut.isPending || infoQ.isLoading}
                />
              </div>
            </div>
          )}
        </Card>

        <Card title="Komisyon">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">% Oran</label>
              <input
                type="number"
                min={0}
                step={0.1}
                className="border rounded-lg px-3 py-2 w-40"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
            <button
              onClick={() => saveMut.mutate()}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
              disabled={saveMut.isPending}
            >
              Kaydet
            </button>
          </div>
        </Card>

        <Card title="Rezervasyonlar">
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Durum</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="">Hepsi</option>
                <option value="pending">Bekleyen</option>
                <option value="confirmed">Onaylı</option>
                <option value="arrived">Gelen</option>
                <option value="cancelled">İptal</option>
                <option value="no_show">No-show</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Başlangıç</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Bitiş</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Sayfa</label>
              <input
                type="number"
                min={1}
                value={page}
                onChange={(e) => setPage(Number(e.target.value) || 1)}
                className="w-24 border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Limit</label>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 20)}
                className="w-24 border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 px-4">Tarih</th>
                  <th className="py-2 px-4">Kullanıcı</th>
                  <th className="py-2 px-4">Durum</th>
                  <th className="py-2 px-4">Kişi</th>
                  <th className="py-2 px-4">Tutar (₺)</th>
                </tr>
              </thead>
              <tbody>
                {(rsvQ.data?.items ?? []).map((r) => (
                  <tr key={r._id} className="border-t">
                    <td className="py-2 px-4">
                      {r.dateTimeUTC ? new Date(r.dateTimeUTC).toLocaleString() : "-"}
                    </td>
                    <td className="py-2 px-4">
                      {r.user?.name || "-"}{" "}
                      <span className="text-gray-500">({r.user?.email || "-"})</span>
                    </td>
                    <td className="py-2 px-4">{r.status}</td>
                    <td className="py-2 px-4">{r.partySize ?? "-"}</td>
                    <td className="py-2 px-4">
                      {r.totalPrice != null ? r.totalPrice.toLocaleString("tr-TR") : "-"}
                    </td>
                  </tr>
                ))}
                {(!rsvQ.data?.items || rsvQ.data.items.length === 0) && (
                  <tr>
                    <td className="py-3 px-4 text-gray-500" colSpan={5}>
                      Kayıt yok
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {rsvQ.data && (
            <div className="flex items-center gap-2 mt-3">
              <button
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </button>
              <div className="text-sm text-gray-600">
                Sayfa {page} / {totalPages}
              </div>
              <button
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sonraki
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
