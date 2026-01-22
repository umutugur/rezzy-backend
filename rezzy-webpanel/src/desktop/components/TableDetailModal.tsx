// src/desktop/components/TableDetailModal.tsx
import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { restaurantCancelOrder } from "../../api/client";
import type { LiveTable } from "../../api/client";
import { authStore } from "../../store/auth";
import { getCurrencySymbolForRegion } from "../../utils/currency";

type TableDetail = {
  table?: LiveTable;
  session?: any;
  totals?: {
    cardTotal: number;
    payAtVenueTotal: number;
    grandTotal: number;
  };
  orders?: any[];
  serviceRequests?: any[];
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
  onCancelOrder?: (orderId: string) => void;
  cancelOrderPendingId?: string | null;
  hideCancelledOrders?: boolean;
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
    case "order_ready":
      return "Sipariş Hazır";
    default:
      return status;
  }
}

function channelLabel(ch?: string | null): string {
  if (!ch) return "Lokal Adisyon";
  if (ch === "QR") return "QR Menü";
  if (ch === "REZVIX") return "Rezvix Rezervasyon";
  if (ch === "WALK_IN") return "Walk-in Sipariş";
  return ch;
}

function channelClass(ch?: string | null): string {
  if (ch === "REZVIX") {
    return "bg-[#ede9ff] text-[#4c1d95] border border-[#a78bfa]";
  }
  if (ch === "QR") {
    return "bg-[#e0fdf7] text-[#036c5f] border border-[#34d399]";
  }
  if (ch === "WALK_IN") {
    return "bg-[#fff4e5] text-[#92400e] border border-[#fdba74]";
  }
  return "bg-slate-100 text-slate-600 border border-slate-200";
}

// Servis isteği tipine göre etiket
function currencySymbolFromSessionCurrency(v?: any): string | null {
  const c = String(v || "").trim().toUpperCase();
  if (!c) return null;
  if (c === "GBP") return "£";
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "TRY") return "₺";
  return null;
}

function formatMoney(amount: any, symbol: string): string {
  const n = Number(amount || 0);
  // tr-TR formatı korunuyor; sembol sona yazılıyor (mevcut UI alışkanlığı)
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${symbol}`;
}


function serviceRequestLabel(type: string): string {
  if (type === "waiter") return "Garson çağrısı";
  if (type === "bill") return "Hesap istendi";
  if (type === "order_ready") return "Sipariş hazır";
  return "Servis isteği";
}


function resolveOrderItemTitle(it: any): string {
  const candidates = [
    it?.title,
    it?.itemTitle,
    it?.name,
    it?.item?.title,
    it?.item?.name,
    it?.menuItem?.title,
    it?.menuItem?.name,
    it?.product?.title,
    it?.product?.name,
    it?.menuItemTitle,
  ];

  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return "Ürün";
}

function extractModifierLines(it: any, currencySymbol: string): string[] {
  // 1) If backend already provides a human-readable label, use it.
  const label = String(it?.modifierLabel ?? it?.modifiersLabel ?? it?.optionsLabel ?? "").trim();
  if (label) {
    // Keep as a single line; UI already prefixes with "Opsiyonlar:".
    return [label];
  }

  const mods =
    it?.selectedModifiers ||
    it?.modifiers ||
    it?.modifierSelections ||
    it?.modifierSelection ||
    it?.selectedModifierGroups;

  const out: string[] = [];

  // 2) Object map shape: { [groupId]: [{ title, price }, ...] }
  if (mods && typeof mods === "object" && !Array.isArray(mods)) {
    for (const k of Object.keys(mods)) {
      const arr = (mods as any)[k];
      if (!Array.isArray(arr)) continue;
      for (const m of arr) {
        if (!m) continue;
        const t = String(m.title || m.name || m.label || m.optionTitle || "").trim();
        if (!t) continue;
        const mp = Number(m.priceDelta ?? m.price ?? m.delta ?? 0);
        if (mp) out.push(`${t} (+${formatMoney(mp, currencySymbol)})`);
        else out.push(t);
      }
    }
    return out;
  }

  // 3) Array shapes
  if (Array.isArray(mods)) {
    for (const m of mods) {
      if (!m) continue;

      // New grouped API shape: { groupId, optionIds: string[] }
      if (Array.isArray((m as any).optionIds)) {
        const optionIds = ((m as any).optionIds as any[])
          .map((x) => String(x ?? "").trim())
          .filter(Boolean);

        // If backend includes option objects, prefer those titles
        const optionObjs = Array.isArray((m as any).options) ? (m as any).options : null;
        const optionTitles = optionObjs
          ? optionObjs
              .map((o: any) => String(o?.title || o?.name || o?.label || "").trim())
              .filter(Boolean)
          : [];

        const groupTitle = String((m as any).groupTitle || (m as any).title || "").trim();

        const joined =
          optionTitles.length > 0
            ? optionTitles.join(", ")
            : optionIds.length > 0
            ? optionIds.join(", ")
            : "";

        if (joined) {
          if (groupTitle) out.push(`${groupTitle}: ${joined}`);
          else out.push(joined);
        }
        continue;
      }

      // Flat selection shape: { groupId, optionId } or richer objects
      const t = String(
        (m as any).title ||
          (m as any).name ||
          (m as any).label ||
          (m as any).optionTitle ||
          (m as any).option?.title ||
          ""
      ).trim();

      const groupTitle = String((m as any).groupTitle || (m as any).groupName || (m as any).group?.title || "").trim();

      const mp = Number((m as any).priceDelta ?? (m as any).price ?? (m as any).delta ?? 0);

      if (t) {
        const base = groupTitle ? `${groupTitle}: ${t}` : t;
        if (mp) out.push(`${base} (+${formatMoney(mp, currencySymbol)})`);
        else out.push(base);
        continue;
      }

      // Last resort: show identifiers if present (helps debugging)
      const oid = String((m as any).optionId ?? "").trim();
      const gid = String((m as any).groupId ?? "").trim();
      if (oid && gid) out.push(`${gid}: ${oid}`);
      else if (oid) out.push(oid);
    }
  }

  return out;
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
  onCancelOrder,
  cancelOrderPendingId,
  hideCancelledOrders,
}) => {
  if (!open || !table) return null;

  const mins = minutesSince(table.lastOrderAt ?? null);
  const user = authStore.getUser();

  const qc = useQueryClient();

  const [localCancelPendingId, setLocalCancelPendingId] = React.useState<string | null>(null);

  const cancelOrderMut = useMutation({
    mutationFn: async (orderId: string) => {
      setLocalCancelPendingId(orderId);

      // Resolve restaurantId defensively (legacy + multi-membership)
      const userAny: any = user as any;
      const ridResolved = String(
        userAny?.restaurantId ||
          userAny?.restaurantMemberships?.[0]?.restaurantId ||
          userAny?.restaurantMemberships?.[0]?.restaurant ||
          ""
      ).trim();

      // Use panel cancel endpoint through client helper (it already contains the correct path)
      // If rid is missing, fall back to direct orders cancel route.
      if (ridResolved) {
        return await restaurantCancelOrder(ridResolved, orderId, { reason: "panel_cancel" });
      }

      // Fallback: legacy /api/orders/:orderId/cancel
      const { api } = await import("../../api/client");
      const { data } = await api.post(`/orders/${orderId}/cancel`, { reason: "panel_cancel" });
      return data;
    },
    onSuccess: async () => {
      // Broad invalidation (project query keys can vary between pages)
      await qc.invalidateQueries();
    },
    onError: () => {
      // Toast is already handled globally in api interceptor
    },
    onSettled: () => {
      setLocalCancelPendingId(null);
    },
  });

  const effectiveCancelPendingId = cancelOrderPendingId ?? localCancelPendingId;

  const handleCancelOrder = React.useCallback(
    (orderId: string) => {
      if (!orderId) return;
      cancelOrderMut.mutate(orderId);
    },
    [cancelOrderMut]
  );

  // ✅ Region (multi-organization aware)
  // Priority:
  //  1) user.region (if present)
  //  2) organization region matched by active restaurantMembership.organizationId
  //  3) first organization region
  //  4) TR
  const userRegionRaw = String((user as any)?.region ?? "").trim();

  const membershipOrgId = String((user as any)?.restaurantMemberships?.[0]?.organizationId ?? "").trim();
  const orgs = Array.isArray((user as any)?.organizations) ? (user as any).organizations : [];
  const matchedOrg = membershipOrgId
    ? orgs.find((o: any) => String(o?.id ?? "").trim() === membershipOrgId)
    : undefined;

  const resolvedRegion = String(
    userRegionRaw || matchedOrg?.region || orgs?.[0]?.region || "TR"
  )
    .trim()
    .toUpperCase();

  const currencySymbol =
    currencySymbolFromSessionCurrency((tableDetail as any)?.session?.currency) ||
    getCurrencySymbolForRegion(resolvedRegion);
  const hasSession = !!tableDetail?.session;
  const rawOrders = Array.isArray(tableDetail?.orders) ? tableDetail!.orders : [];
  const visibleOrders = React.useMemo(() => {
    if (!hideCancelledOrders) return rawOrders;
    return rawOrders.filter((o: any) => {
      const st = String(o?.status ?? "").trim().toLowerCase();
      const cancelled = o?.isCancelled === true || st === "cancelled" || st === "canceled";
      return !cancelled;
    });
  }, [rawOrders, hideCancelledOrders]);

  const hasOrders = visibleOrders.length > 0;
  const hasRequests = (tableDetail?.serviceRequests?.length ?? 0) > 0;

  const canCancelOrder = React.useCallback((o: any) => {
    const st = String(o?.status ?? "").trim().toLowerCase();
    const cancelled = o?.isCancelled === true || st === "cancelled" || st === "canceled";
    if (cancelled) return false;

    // Delivered / completed variants should not be cancellable
    if (
      st === "delivered" ||
      st === "completed" ||
      st === "closed" ||
      st === "paid" ||
      st === "refunded"
    ) {
      return false;
    }

    // Default: cancellable
    return true;
  }, []);

  const hasError = !!error;
  const errorMessage =
    error instanceof Error ? error.message : "Masa detayı getirilemedi.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(7,9,20,0.42)] backdrop-blur-md">
      {/* ✅ Full-screen / yatay container */}
      <div
        className={[
          "w-[98vw] h-[92vh]",
          "max-w-[1400px]", // çok geniş ekranlarda okunabilir kalsın
          "rounded-[26px] border border-black/10",
          "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.9),rgba(237,239,245,0.96))]",
          "shadow-[0_22px_60px_rgba(15,23,42,0.45)]",
          "px-6 py-5",
          "flex flex-col",
        ].join(" ")}
      >
        {/* Header (sabit) */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="space-y-1">
            <div className="text-[11px] tracking-[0.18em] uppercase text-slate-400">
              MASA DETAYI
            </div>
            <div className="text-[18px] font-semibold text-slate-900">
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

        {/* ✅ 2 kolon yatay layout */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-5">
          {/* Sol kolon (scroll) */}
          <div className="col-span-8 min-h-0 overflow-y-auto pr-1 space-y-3 text-[11px]">
            {isLoading && (
              <div className="text-slate-500">Masa detayı yükleniyor…</div>
            )}

            {hasError && !isLoading && (
              <div className="text-red-600">{errorMessage}</div>
            )}

            {!isLoading && !hasError && tableDetail && (
              <>
                {/* Rezervasyon şeridi (REZVIX için) */}
                {table.channel === "REZVIX" && tableDetail?.reservation && (
                  <div className="rounded-2xl bg-gradient-to-r from-[#312e81] via-[#1f2937] to-[#111827] text-[11px] text-slate-100 px-4 py-3 flex flex-col gap-1 shadow-[0_16px_40px_rgba(15,23,42,0.65)] border border-indigo-500/40">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-indigo-100">
                        Rezvix rezervasyonu
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
                          {formatMoney(tableDetail.reservation.depositAmount || 0, currencySymbol)}
                        </span>
                      </span>
                      <span>Durum: {tableDetail.reservation.status}</span>
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
                      {visibleOrders.length} kayıt
                    </div>
                  )}
                  </div>

                  {!hasOrders && (
                    <div className="text-[11px] text-slate-500">
                      Henüz sipariş yok.
                    </div>
                  )}

                  {visibleOrders.map((o: any, idx: number) => (
                    <div
                      key={o._id}
                      className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 flex gap-2 items-start shadow-[0_10px_26px_rgba(15,23,42,0.08)]"
                    >
                      <div className="w-6 h-6 rounded-full bg-slate-900 text-[10px] text-slate-50 flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-[12px] text-slate-900 shrink-0">
                              {formatTime(o.createdAt)}
                            </span>

                            {/* Status */}
                            {String(o?.status ?? "").trim() ? (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 border border-slate-200">
                                {String(o.status)}
                              </span>
                            ) : null}

                            {/* Cancelled marker */}
                            {(o?.isCancelled === true || String(o?.status ?? "").toLowerCase() === "cancelled" || String(o?.status ?? "").toLowerCase() === "canceled") ? (
                              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-700 border border-red-200">
                                İptal
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-[12px] text-slate-800">
                              {formatMoney(o.total || 0, currencySymbol)}
                            </span>

                            {canCancelOrder(o) ? (
                              <button
                                type="button"
                                className="px-2 py-1 text-[10px] rounded-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 disabled:opacity-60"
                                disabled={
                                  !!effectiveCancelPendingId &&
                                  effectiveCancelPendingId === String(o?._id ?? o?.id ?? "")
                                }
                                onClick={() => {
                                  const oid = String(o?._id ?? o?.id ?? "");
                                  if (!oid) return;
                                  if (confirm("Bu siparişi iptal etmek istiyor musun?")) {
                                    handleCancelOrder(oid);
                                  }
                                }}
                                title="Siparişi iptal et"
                              >
                                {effectiveCancelPendingId &&
                                effectiveCancelPendingId === String(o?._id ?? o?.id ?? "")
                                  ? "İptal ediliyor…"
                                  : "İptal"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-600 break-words space-y-1">
                          {(o.items || []).map((it: any, i2: number) => {
                            const title = resolveOrderItemTitle(it);
                            const qty = Number(it?.qty ?? 1);
                            const price = Number(it?.price ?? 0);
                            const modLines = extractModifierLines(it, currencySymbol);

                            return (
                              <div key={String(it?._id ?? it?.id ?? i2)} className="leading-4">
                                <div>
                                  {qty}× {title} ({formatMoney(price, currencySymbol)})
                                </div>
                                {modLines.length > 0 && (
                                  <div className="mt-0.5 text-[10px] text-slate-500">
                                    <span className="text-slate-400">Opsiyonlar:</span> {modLines.join(", ")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Servis istekleri */}
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-700">
                    Garson / Servis İstekleri
                  </div>

                  {!hasRequests && (
                    <div className="text-[11px] text-slate-500">
                      Açık servis isteği yok.
                    </div>
                  )}

                  {(tableDetail.serviceRequests || []).map((r: any) => (
                    <div
                      key={r._id}
                      className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-1.5 border border-amber-200"
                    >
                      <div>
                        <div className="text-[11px] font-medium text-amber-900">
                          {serviceRequestLabel(r.type)}
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

          {/* Sağ kolon (özet + aksiyonlar, sticky gibi) */}
          <div className="col-span-4 min-h-0 flex flex-col gap-4">
            {/* Adisyon özeti */}
            {!isLoading && !hasError && tableDetail?.totals && (
              <div className="rounded-[18px] bg-slate-900 text-slate-50 px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.7)] border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-semibold">Adisyon Özeti</div>
                  <div className="text-[10px] text-slate-300">
                    Açılış: {formatTime(tableDetail.session?.openedAt ?? null)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Kart</span>
                  <span className="font-semibold">
                    {formatMoney(tableDetail.totals.cardTotal, currencySymbol)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-slate-300">Nakit / Mekanda</span>
                  <span className="font-semibold">
                    {formatMoney(tableDetail.totals.payAtVenueTotal, currencySymbol)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] border-t border-slate-700 pt-2">
                  <span className="font-semibold text-slate-100">
                    Genel Toplam
                  </span>
                  <span className="font-semibold text-amber-300">
                    {formatMoney(tableDetail.totals.grandTotal, currencySymbol)}
                  </span>
                </div>
              </div>
            )}

            {/* Aksiyonlar */}
            <div className="mt-auto flex flex-col gap-1.5">
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
      </div>
    </div>
  );
};