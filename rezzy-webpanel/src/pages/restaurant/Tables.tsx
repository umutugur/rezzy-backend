import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore } from "../../store/auth";
import {
  api,
  restaurantGetLiveTables,
  restaurantGetTableDetail,
  restaurantCloseTableSession,
  restaurantResolveTableService,
  restaurantUpdateTablesLayout,
  type LiveTable,
} from "../../api/client";

// --- Eski tablo CRUD tipi (profil & basic liste) ---
type TableItem = { _id?: string; name: string; capacity: number; isActive?: boolean };

// =======================
// Eski CRUD API helper’ları
// =======================
async function fetchTables(rid: string): Promise<TableItem[]> {
  const { data } = await api.get(`/restaurants/${rid}`);
  return data?.tables || [];
}

async function updateTables(rid: string, tables: TableItem[]) {
  const { data } = await api.put(`/restaurants/${rid}/tables`, { tables });
  return data;
}

// =======================
// Canlı masa yardımcıları
// =======================
function statusLabel(status: LiveTable["status"]): string {
  switch (status) {
    case "empty":
      return "Boş";
    case "occupied":
      return "Dolu";
    case "order_active":
      return "Sipariş Var";
    case "waiter_call":
      return "Garson Çağrısı";
    case "bill_request":
      return "Hesap İstendi";
    default:
      return status;
  }
}

function statusClasses(status: LiveTable["status"]): string {
  switch (status) {
    case "empty":
      return "border-gray-200 bg-gray-50";
    case "occupied":
      return "border-amber-300 bg-amber-50";
    case "order_active":
      return "border-emerald-400 bg-emerald-50";
    case "waiter_call":
      return "border-sky-400 bg-sky-50";
    case "bill_request":
      return "border-rose-400 bg-rose-50";
    default:
      return "border-gray-200 bg-gray-50";
  }
}

function formatTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export default function TablesPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();

  // =======================
  // CANLI MASALAR
  // =======================
  const {
    data: liveData,
    isLoading: liveLoading,
    error: liveError,
  } = useQuery({
    queryKey: ["live-tables", rid],
    queryFn: () => restaurantGetLiveTables(rid),
    enabled: !!rid,
    refetchInterval: 5000, // 5 sn’de bir güncelle
  });

  const liveTables: LiveTable[] =
    (liveData?.tables || []).slice().sort((a, b) =>
      a.floor === b.floor
        ? a.name.localeCompare(b.name, "tr")
        : a.floor - b.floor
    );

  const [selectedTableKey, setSelectedTableKey] = React.useState<string | null>(
    null
  );

  const {
    data: tableDetail,
    isLoading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ["table-detail", rid, selectedTableKey],
    queryFn: () => restaurantGetTableDetail(rid, selectedTableKey as string),
    enabled: !!rid && !!selectedTableKey,
  });

  const closeSessionMut = useMutation({
    mutationFn: () =>
      restaurantCloseTableSession(rid, selectedTableKey as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-tables", rid] });
      refetchDetail();
    },
  });

  const resolveServiceMut = useMutation({
    mutationFn: () =>
      restaurantResolveTableService(rid, selectedTableKey as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-tables", rid] });
      refetchDetail();
    },
  });

  // layout kaydetme (şimdilik sadece hook; drag&drop ekleyince kullanacağız)
  const layoutMut = useMutation({
    mutationFn: (payload: Array<{ id: string; floor?: number; posX?: number; posY?: number }>) =>
      restaurantUpdateTablesLayout(rid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live-tables", rid] }),
  });

  // =======================
  // ESKİ MASA CRUD
  // =======================
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tables", rid],
    queryFn: () => fetchTables(rid),
    enabled: !!rid,
  });

  const [rows, setRows] = React.useState<TableItem[]>([]);
  React.useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  const mut = useMutation({
    mutationFn: (payload: TableItem[]) => updateTables(rid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tables", rid] }),
  });

  const addRow = () =>
    setRows((prev) => [...prev, { name: "", capacity: 2, isActive: true }]);
  const delRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));

  // =======================
  // RENDER
  // =======================
  if (!rid) {
    return (
      <div className="flex">
        <Sidebar
          items={[
            { to: "/restaurant", label: "Dashboard" },
            { to: "/restaurant/reservations", label: "Rezervasyonlar" },
            { to: "/restaurant/opening-hours", label: "Çalışma Saatleri" },
            { to: "/restaurant/tables", label: "Masalar" },
            { to: "/restaurant/menus", label: "Menüler" },
            { to: "/restaurant/photos", label: "Fotoğraflar" },
            { to: "/restaurant/profile", label: "Profil & Ayarlar" },
          ]}
        />
        <div className="flex-1 p-6">
          Restoran ID bulunamadı.
        </div>
      </div>
    );
  }

  const selected =
    selectedTableKey &&
    liveTables.find((t) => String(t.id) === String(selectedTableKey));

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: "Dashboard" },
          { to: "/restaurant/reservations", label: "Rezervasyonlar" },
          { to: "/restaurant/opening-hours", label: "Çalışma Saatleri" },
          { to: "/restaurant/tables", label: "Masalar" },
          { to: "/restaurant/menus", label: "Menüler" },
          { to: "/restaurant/photos", label: "Fotoğraflar" },
          { to: "/restaurant/profile", label: "Profil & Ayarlar" },
        ]}
      />

      <div className="flex-1 space-y-8">
        {/* ================= CANLI MASALAR (C seçeneği) ================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Canlı Masalar</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                Boş
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Dolu
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Sipariş Var
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Garson Çağrısı
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Hesap İstendi
              </span>
            </div>
          </div>

          {liveLoading && <div className="text-sm text-gray-500">Canlı veriler yükleniyor…</div>}
          {liveError && (
            <div className="text-sm text-red-600">
              Canlı masalar getirilemedi.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {liveTables.map((t) => (
              <button
                key={String(t.id)}
                type="button"
                onClick={() => setSelectedTableKey(String(t.id))}
                className={[
                  "relative flex flex-col items-start rounded-2xl border px-4 py-3 text-left shadow-sm transition",
                  "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500",
                  statusClasses(t.status),
                  selectedTableKey === String(t.id)
                    ? "ring-2 ring-brand-500"
                    : "",
                ].join(" ")}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 shadow">
                      {/* masa ikonu */}
                      <span className="text-lg">🍽️</span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        {t.name || "İsimsiz"}
                      </div>
                      <div className="text-xs text-gray-600">
                        {t.capacity || 2} kişilik • Kat {t.floor ?? 1}
                      </div>
                    </div>
                  </div>
                  {t.openServiceRequests > 0 && (
                    <span className="inline-flex items-center rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {t.openServiceRequests} çağrı
                    </span>
                  )}
                </div>

                <div className="mt-2 flex w-full items-center justify-between text-xs">
                  <span className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-gray-800">
                    {statusLabel(t.status)}
                  </span>
                  <span className="text-[11px] text-gray-600">
                    Son sipariş: {formatTime(t.lastOrderAt)}
                  </span>
                </div>

                <div className="mt-2 w-full rounded-xl bg-white/70 px-3 py-2 text-[11px] text-gray-700">
                  <div className="flex items-center justify-between">
                    <span>Nakit / Mekanda</span>
                    <span className="font-semibold">
                      {t.totals?.payAtVenueTotal?.toFixed(2) ?? "0.00"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span>Kart</span>
                    <span className="font-semibold">
                      {t.totals?.cardTotal?.toFixed(2) ?? "0.00"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-semibold">Toplam</span>
                    <span className="font-semibold">
                      {t.totals?.grandTotal?.toFixed(2) ?? "0.00"}{" "}
                      {t.hasActiveSession ? "" : ""}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {liveTables.length === 0 && !liveLoading && (
              <div className="col-span-full text-sm text-gray-500">
                Henüz tanımlı masa yok. Aşağıdaki listeden masa ekleyebilirsiniz.
              </div>
            )}
          </div>

          {/* Sağ / alt detay panel */}
          {selectedTableKey && (
            <Card>
            <div className="mt-4 flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">
                    Masa Detayı{" "}
                    {selected && `— ${selected.name} (${selected.capacity || 2} kişilik)`}
                  </h3>
                  {detailLoading && (
                    <div className="text-sm text-gray-500">Detay yükleniyor…</div>
                  )}
                  {detailError && (
                    <div className="text-sm text-red-600">
                      Masa detayı getirilemedi.
                    </div>
                  )}
                  {tableDetail && (
                    <div className="space-y-3 text-sm">
                      <div className="flex flex-wrap gap-3">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs">
                          Durum:{" "}
                          <span className="ml-1 font-medium">
                            {statusLabel(tableDetail.table.status)}
                          </span>
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs">
                          Kat: {tableDetail.table.floor ?? 1}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs">
                          Adisyon:{" "}
                          {tableDetail.session ? "Açık" : "Yok"}
                        </span>
                      </div>

                      {tableDetail.totals && (
                        <div className="rounded-xl bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between text-xs">
                            <span>Kart</span>
                            <span className="font-semibold">
                              {tableDetail.totals.cardTotal.toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span>Nakit / Mekanda</span>
                            <span className="font-semibold">
                              {tableDetail.totals.payAtVenueTotal.toFixed(2)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="font-semibold">Toplam</span>
                            <span className="font-semibold">
                              {tableDetail.totals.grandTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Siparişler */}
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-gray-700">
                          Siparişler
                        </div>
                        {tableDetail.orders.length === 0 && (
                          <div className="text-xs text-gray-500">
                            Henüz sipariş yok.
                          </div>
                        )}
                        {tableDetail.orders.map((o) => (
                          <div
                            key={o._id}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {new Date(o.createdAt).toLocaleTimeString(
                                  "tr-TR",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </span>
                              <span className="font-semibold">
                                {o.total.toFixed(2)}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-gray-600">
                              {o.items
                                .map(
                                  (it: any) =>
                                    `${it.qty}× ${it.title} (${it.price})`
                                )
                                .join(", ")}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Servis istekleri */}
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-gray-700">
                          Garson / Hesap İstekleri
                        </div>
                        {tableDetail.serviceRequests.length === 0 && (
                          <div className="text-xs text-gray-500">
                            Açık servis isteği yok.
                          </div>
                        )}
                        {tableDetail.serviceRequests.map((r) => (
                          <div
                            key={r._id}
                            className="flex items-center justify-between rounded-lg bg-yellow-50 px-3 py-1.5 text-xs"
                          >
                            <div>
                              <div className="font-medium">
                                {r.type === "waiter"
                                  ? "Garson çağrısı"
                                  : "Hesap istendi"}
                              </div>
                              <div className="text-[11px] text-gray-600">
                                {new Date(r.createdAt).toLocaleTimeString(
                                  "tr-TR",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTableKey(null)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Kapat
                  </button>

                  <button
                    type="button"
                    disabled={
                      resolveServiceMut.isPending ||
                      !tableDetail ||
                      tableDetail.serviceRequests.length === 0
                    }
                    onClick={() => resolveServiceMut.mutate()}
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-300"
                  >
                    {resolveServiceMut.isPending
                      ? "İşleniyor…"
                      : "Çağrı / Hesap Çözüldü"}
                  </button>

                  <button
                    type="button"
                    disabled={
                      closeSessionMut.isPending ||
                      !tableDetail ||
                      !tableDetail.session
                    }
                    onClick={() => closeSessionMut.mutate()}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {closeSessionMut.isPending
                      ? "Adisyon Kapatılıyor…"
                      : "Adisyonu Kapat"}
                  </button>
                </div>
              </div>
            </Card>
          )}
        </section>

        {/* ================= MASA TANIMLARI (eski liste) ================= */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Masa Tanımları</h2>
          {isLoading && <div>Yükleniyor…</div>}
          {error && (
            <div className="text-red-600 text-sm">Veri getirilemedi</div>
          )}

          <Card>
            <div className="space-y-3">
              {rows.map((t, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center"
                >
                  <input
                    className="border rounded-lg px-3 py-2"
                    placeholder="Masa adı"
                    value={t.name}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    className="border rounded-lg px-3 py-2"
                    placeholder="Kapasite"
                    value={t.capacity}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? { ...x, capacity: Number(e.target.value) || 0 }
                            : x
                        )
                      )
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Aktif</span>
                    <input
                      type="checkbox"
                      checked={t.isActive ?? true}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, isActive: e.target.checked } : x
                          )
                        )
                      }
                    />
                  </label>
                  <button
                    className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm"
                    onClick={() => delRow(idx)}
                  >
                    Sil
                  </button>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="text-sm text-gray-500">Kayıt yok</div>
              )}
              <button
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm"
                onClick={addRow}
              >
                Yeni Masa
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={() => mut.mutate(rows)}
                disabled={mut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {mut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
              {mut.isSuccess && (
                <span className="ml-3 text-sm text-green-700">
                  Güncellendi.
                </span>
              )}
              {mut.isError && (
                <span className="ml-3 text-sm text-red-700">
                  Hata oluştu.
                </span>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}