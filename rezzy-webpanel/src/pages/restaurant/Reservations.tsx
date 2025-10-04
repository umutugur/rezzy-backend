import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, restaurantUpdateReservationStatus } from "../../api/client";
import { authStore } from "../../store/auth";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import Modal from "../../components/Modal";
import { showToast } from "../../ui/Toast";

// ---- Türler
type Row = {
  _id: string;
  dateTimeUTC: string;
  partySize: number;
  totalPrice?: number;
  depositAmount?: number;
  status: "pending" | "confirmed" | "arrived" | "cancelled" | "no_show" | string;
  receiptUrl?: string;
  user?: { name?: string; email?: string };
};
type Resp = { items: Row[]; total: number; page: number; limit: number };

// ---- Yardımcılar
const trStatus: Record<string, string> = {
  pending: "Bekleyen",
  confirmed: "Onaylı",
  arrived: "Geldi",
  no_show: "Gelmedi",
  cancelled: "İptal",
};
function fmtStatus(s: string) {
  return trStatus[s] ?? s;
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function fetchReservations(
  rid: string,
  p: { from?: string; to?: string; status?: string; page: number; limit: number }
): Promise<Resp> {
  const { data } = await api.get(`/restaurants/${rid}/reservations`, { params: p });
  return data as Resp;
}

export default function RestaurantReservationsPage() {
  const u = authStore.getUser();
  const rid = u?.restaurantId || "";

  // ---- UI state
  const [tab, setTab] = React.useState<"pending" | "upcoming" | "past">("upcoming");
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(20);

  const qc = useQueryClient();

  // ---- Sorgu paramları
  const params = React.useMemo(() => {
    const base: any = { page, limit };
    const today = new Date();

    if (tab === "pending") base.status = "pending";
    else if (tab === "upcoming") base.from = ymd(today);
    else if (tab === "past") base.to = ymd(today);

    if (statusFilter) base.status = statusFilter;
    return base as { from?: string; to?: string; status?: string; page: number; limit: number };
  }, [tab, statusFilter, page, limit]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["restaurant-reservations", rid, params],
    queryFn: () => fetchReservations(rid, params),
    enabled: !!rid,
  });

  const totalPages =
    data && data.limit > 0 ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  // ---- QR modal state
  const [qrOpen, setQrOpen] = React.useState(false);
  const [qrUrl, setQrUrl] = React.useState<string | null>(null);

  // ---- Durum güncelle
  const statusMut = useMutation({
    mutationFn: (payload: { id: string; status: "confirmed" | "cancelled" }) =>
      restaurantUpdateReservationStatus(payload.id, payload.status),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["restaurant-reservations", rid, params] });
      if (vars.status === "confirmed" && res?.qrDataUrl) {
        setQrUrl(res.qrDataUrl);
        setQrOpen(true);
      }
    },
  });

  // ---- QR açma
  const openQR = async (id: string) => {
    try {
      const resp = await api.get(`/reservations/${id}/qr`);
      const url = resp?.data?.qrDataUrl || resp?.data?.qrUrl;

      if (typeof url === "string" && url.length > 0) {
        setQrUrl(url);
        setQrOpen(true);
        return;
      }
      showToast("QR bulunamadı", "error");
    } catch (err: any) {
      showToast(err?.response?.data?.message || err?.message || "QR alınamadı", "error");
    }
  };

  const closeQR = () => {
    setQrUrl(null);
    setQrOpen(false);
  };

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: "Dashboard" },
          { to: "/restaurant/reservations", label: "Rezervasyonlar" },
          { to: "/restaurant/profile", label: "Profil & Ayarlar" },
        ]}
      />
      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rezervasyonlar</h2>

          {/* Sekmeler */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTab("pending");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg ${
                tab === "pending"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Bekleyen
            </button>
            <button
              onClick={() => {
                setTab("upcoming");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg ${
                tab === "upcoming"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Yaklaşan
            </button>
            <button
              onClick={() => {
                setTab("past");
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg ${
                tab === "past"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              Geçmiş
            </button>
          </div>
        </div>

        {/* Filtreler */}
        <Card title="Filtreler">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Durum</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="border rounded-lg px-3 py-2"
              >
                <option value="">Hepsi</option>
                <option value="pending">Bekleyen</option>
                <option value="confirmed">Onaylı</option>
                <option value="arrived">Geldi</option>
                <option value="no_show">Gelmedi</option>
                <option value="cancelled">İptal</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Sayfa</label>
              <input
                type="number"
                min={1}
                value={page}
                onChange={(e) =>
                  setPage(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-24 border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Limit</label>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(e) =>
                  setLimit(Math.max(1, Number(e.target.value) || 20))
                }
                className="w-24 border rounded-lg px-3 py-2"
              />
            </div>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              disabled={isFetching}
            >
              {isFetching ? "Getiriliyor…" : "Uygula"}
            </button>
          </div>
        </Card>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Liste çekilemedi</div>}

        {/* Tablo */}
        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">Tarih</th>
                <th className="py-2 px-4">Kullanıcı</th>
                <th className="py-2 px-4">Kişi</th>
                <th className="py-2 px-4">Tutar (₺)</th>
                <th className="py-2 px-4">Depozito (₺)</th>
                <th className="py-2 px-4">Durum</th>
                <th className="py-2 px-4">Aksiyon</th>
                <th className="py-2 px-4">Dekont / QR</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((r) => {
                const isPending = r.status === "pending";
                return (
                  <tr key={r._id} className="border-t">
                    <td className="py-2 px-4">
                      {new Date(r.dateTimeUTC).toLocaleString()}
                    </td>
                    <td className="py-2 px-4">
                      {r.user?.name || "-"}{" "}
                      <span className="text-gray-500">
                        {r.user?.email ? `(${r.user.email})` : ""}
                      </span>
                    </td>
                    <td className="py-2 px-4">{r.partySize}</td>
                    <td className="py-2 px-4">
                      {r.totalPrice?.toLocaleString("tr-TR")}
                    </td>
                    <td className="py-2 px-4">
                      {r.depositAmount?.toLocaleString("tr-TR")}
                    </td>
                    <td className="py-2 px-4">{fmtStatus(r.status)}</td>

                    <td className="py-2 px-4">
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60"
                          disabled={!isPending || statusMut.isPending}
                          onClick={() =>
                            statusMut.mutate({ id: r._id, status: "confirmed" })
                          }
                        >
                          Onayla
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                          disabled={!isPending || statusMut.isPending}
                          onClick={() =>
                            statusMut.mutate({ id: r._id, status: "cancelled" })
                          }
                        >
                          İptal
                        </button>
                      </div>
                    </td>

                    <td className="py-2 px-4">
                      <div className="flex items-center gap-3">
                        {r.receiptUrl ? (
                          <a
                            className="text-brand-700 underline"
                            href={r.receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Dekont
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {r.status === "confirmed" && (
                          <button
                            className="text-sm rounded-lg bg-gray-100 hover:bg-gray-200 px-2 py-1"
                            onClick={() => openQR(r._id)}
                          >
                            QR
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!data?.items || data.items.length === 0) && (
                <tr>
                  <td
                    className="py-3 px-4 text-gray-500"
                    colSpan={8}
                  >
                    Kayıt yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Sayfalama */}
        {data && (
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Önceki
            </button>
            <div className="text-sm text-gray-600">
              Sayfa {page} / {totalPages} • Toplam {data.total}
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

        {/* QR Modal */}
        <Modal open={qrOpen} onClose={closeQR} title="Rezervasyon QR">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="QR"
              className="max-h-[70vh] w-auto h-auto object-contain mx-auto"
            />
          ) : (
            <div className="text-sm text-gray-600">Yükleniyor…</div>
          )}
        </Modal>
      </div>
    </div>
  );
}
