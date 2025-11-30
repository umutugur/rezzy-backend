// src/desktop/components/TableDetailModal.tsx
import React from "react";
import type { LiveTable } from "../../api/client";

type TableDetail = {
  table: any;
  session: any;
  totals?: {
    cardTotal: number;
    payAtVenueTotal: number;
    grandTotal: number;
  };
  orders: any[];
  serviceRequests: any[];
  reservation?: any;
};

type Props = {
  open: boolean;
  table?: LiveTable;
  tableDetail?: TableDetail;
  isLoading: boolean;
  error: unknown;
  onClose: () => void;
  onOpenWalkInModal: () => void;
  onResolveService: () => void;
  resolveServicePending: boolean;
  onCloseSession: () => void;
  closeSessionPending: boolean;
  onPrintLastOrder: () => void;
  onPrintFullBill: () => void;
};

function formatTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function minutesSince(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return undefined;
  return Math.round(diffMs / 60000);
}

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

function channelLabel(ch?: string | null): string {
  if (!ch) return "Lokal Adisyon";
  if (ch === "QR") return "QR Menü";
  if (ch === "REZZY") return "Rezzy Rezervasyon";
  if (ch === "WALK_IN") return "Walk-in Sipariş";
  return ch;
}

function channelClass(ch?: string | null): string {
  if (ch === "REZZY") {
    // Rezzy rezervasyon: daha premium mor ton
    return "bg-[#ede9ff] text-[#4c1d95] border border-[#a78bfa]";
  }
  if (ch === "QR") {
    // QR: hafif turkuaz/yeşil
    return "bg-[#e0fdf7] text-[#036c5f] border border-[#34d399]";
  }
  if (ch === "WALK_IN") {
    // Walk-in: sıcak amber
    return "bg-[#fff4e5] text-[#92400e] border border-[#fdba74]";
  }
  return "bg-slate-100 text-slate-600 border border-slate-200";
}

export const TableDetailModal: React.FC<Props> = ({
  open,
  table,
  tableDetail,
  isLoading,
  error,
  onClose,
  onOpenWalkInModal,
  onResolveService,
  resolveServicePending,
  onCloseSession,
  closeSessionPending,
  onPrintLastOrder,
  onPrintFullBill,
}) => {
  if (!open || !table) return null;

  const mins = minutesSince(table.lastOrderAt ?? null);
  const hasSession = !!tableDetail?.session;
  const hasOrders = !!tableDetail && tableDetail.orders?.length > 0;
  const hasRequests =
    !!tableDetail && tableDetail.serviceRequests?.length > 0;
  const hasError = !!error;
  const errorMessage =
    error instanceof Error
      ? error.message
      : "Masa detayı getirilemedi.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,9,20,0.42)] backdrop-blur-md">
      <div className="w-[420px] max-w-[92vw] rounded-[26px] border border-black/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),rgba(237,239,245,0.96))] shadow-[0_22px_60px_rgba(15,23,42,0.45)] px-5 py-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="space-y-1">
            <div className="text-[11px] tracking-[0.18em] uppercase text-slate-400">
              MASA DETAYI
            </div>
            <div className="text-[17px] font-semibold text-slate-900">
              {table.name}{" "}
              <span className="text-[12px] font-normal text-slate-500">
                ({table.capacity || 2} kişilik)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-700">
                Kat {table.floor ?? 1}
              </span>

              <span
                className={
                  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium " +
                  channelClass(table.channel as string | undefined)
                }
              >
                {channelLabel(table.channel as string | undefined)}
              </span>

              <span className="inline-flex items-center rounded-full bg-slate-900/90 text-amber-300 px-2.5 py-1 text-[11px] font-medium">
                Durum:
                <span className="ml-1 text-white">
                  {statusLabel(table.status)}
                </span>
              </span>

              {typeof mins === "number" && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                  Son hareket:
                  <span className="ml-1 font-medium text-slate-800">
                    {mins === 0 ? "0 dk" : `${mins} dk`}
                  </span>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] rounded-full border border-slate-200 bg-white/90 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            Kapat
          </button>
        </div>

        {/* Rezervasyon şeridi (REZZY için) */}
        {table.channel === "REZZY" && tableDetail?.reservation && (
          <div className="rounded-2xl bg-gradient-to-r from-[#312e81] via-[#1f2937] to-[#111827] text-[11px] text-slate-100 px-4 py-3 flex flex-col gap-1 shadow-[0_16px_40px_rgba(15,23,42,0.65)] border border-indigo-500/40">
            <div className="flex items-center justify-between">
              <span className="font-medium text-indigo-100">
                Rezzy rezervasyonu
              </span>
              <span className="text-[10px] text-indigo-200">
                {formatTime(tableDetail.reservation.dateTimeUTC)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-200">
                Misafir:{" "}
                <span className="font-semibold">
                  {tableDetail.reservation.displayName ||
                    tableDetail.reservation.guestName ||
                    "İsimsiz misafir"}
                </span>
              </span>
              <span className="text-slate-200">
                {tableDetail.reservation.partySize || 2} kişi
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-300 mt-1">
              <span>
                Depozito:{" "}
                <span className="font-semibold">
                  {(tableDetail.reservation.depositAmount || 0).toFixed(2)}₺
                </span>
              </span>
              <span>Durum: {tableDetail.reservation.status}</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="mt-1 flex-1 min-h-[220px] max-h-[360px] overflow-y-auto pr-1 space-y-3 text-[11px]">
          {isLoading && (
            <div className="text-slate-500">Masa detayı yükleniyor…</div>
          )}

          {hasError && !isLoading && (
            <div className="text-red-600">{errorMessage}</div>
          )}

          {!isLoading && !hasError && tableDetail && (
            <>
              {/* Adisyon özeti */}
              {tableDetail.totals && (
                <div className="rounded-[18px] bg-slate-900 text-slate-50 px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.7)] border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] font-semibold">
                      Adisyon Özeti
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Açılış:{" "}
                      {formatTime(tableDetail.session?.openedAt ?? null)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">Kart</span>
                    <span className="font-semibold">
                      {tableDetail.totals.cardTotal.toFixed(2)}₺
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-300">Nakit / Mekanda</span>
                    <span className="font-semibold">
                      {tableDetail.totals.payAtVenueTotal.toFixed(2)}₺
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] border-t border-slate-700 pt-2">
                    <span className="font-semibold text-slate-100">
                      Genel Toplam
                    </span>
                    <span className="font-semibold text-amber-300">
                      {tableDetail.totals.grandTotal.toFixed(2)}₺
                    </span>
                  </div>
                </div>
              )}

              {/* Siparişler */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Siparişler
                  </div>
                  {hasOrders && (
                    <div className="text-[10px] text-slate-400">
                      {tableDetail.orders.length} kayıt
                    </div>
                  )}
                </div>

                {!hasOrders && (
                  <div className="text-[11px] text-slate-500">
                    Henüz sipariş yok.
                  </div>
                )}

                {tableDetail.orders.map((o: any, idx: number) => (
                  <div
                    key={o._id}
                    className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 flex gap-2 items-start shadow-[0_10px_26px_rgba(15,23,42,0.08)]"
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-900 text-[10px] text-slate-50 flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-[12px] text-slate-900">
                          {formatTime(o.createdAt)}
                        </span>
                        <span className="font-semibold text-[12px] text-slate-800">
                          {o.total.toFixed(2)}₺
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {o.items
                          .map(
                            (it: any) =>
                              `${it.qty}× ${it.title} (${it.price}₺)`
                          )
                          .join(", ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Servis istekleri */}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-slate-700">
                  Garson / Hesap İstekleri
                </div>

                {!hasRequests && (
                  <div className="text-[11px] text-slate-500">
                    Açık servis isteği yok.
                  </div>
                )}

                {tableDetail.serviceRequests.map((r: any) => (
                  <div
                    key={r._id}
                    className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-1.5 border border-amber-200"
                  >
                    <div>
                      <div className="text-[11px] font-medium text-amber-900">
                        {r.type === "waiter"
                          ? "Garson çağrısı"
                          : "Hesap istendi"}
                      </div>
                      <div className="text-[10px] text-amber-800/80">
                        {formatTime(r.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpenWalkInModal}
            disabled={!table}
            className="w-full rounded-full bg-gradient-to-r from-purple-600 to-purple-500 px-4 py-2 text-[12px] font-semibold text-white shadow-[0_14px_30px_rgba(126,34,206,0.4)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Yeni Sipariş Ekle — {table.name}
          </button>

          <button
            type="button"
            onClick={onResolveService}
            disabled={resolveServicePending || !hasRequests}
            className="w-full rounded-full bg-sky-500 px-4 py-2 text-[12px] font-medium text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {resolveServicePending ? "İşleniyor…" : "Çağrı / Hesap Çözüldü"}
          </button>

          <button
            type="button"
            onClick={onCloseSession}
            disabled={closeSessionPending || !hasSession}
            className="w-full rounded-full bg-emerald-600 px-4 py-2 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {closeSessionPending ? "Adisyon Kapatılıyor…" : "Adisyonu Kapat"}
          </button>

          <button
            type="button"
            onClick={onPrintLastOrder}
            disabled={!hasOrders}
            className="w-full rounded-full bg-slate-900 px-4 py-2 text-[12px] font-medium text-slate-50 hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Son Siparişi Yazdır
          </button>

          <button
            type="button"
            onClick={onPrintFullBill}
            disabled={!tableDetail}
            className="w-full rounded-full bg-[#7b2c2c] px-4 py-2 text-[12px] font-medium text-[#fff7f3] hover:bg-[#9b3636] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Hesap Yazdır
          </button>
        </div>
      </div>
    </div>
  );
};