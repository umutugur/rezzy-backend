// src/desktop/components/WalkInOrderModal.tsx
import React from "react";
import { useRestaurantDesktopCurrency } from "../layouts/RestaurantDesktopLayout";

type MenuCategory = {
  _id: string;
  title: string;
};

type MenuItem = {
  _id: string;
  title: string;
  price: number;
  isAvailable?: boolean;
};

type DraftOrderItem = {
  itemId: string;
  title: string;
  price: number;
  qty: number;
  note?: string;
};

type CurrencyCode = "TRY" | "GBP";

type Props = {
  open: boolean;
  tableName: string;
  guestName: string;
  onChangeGuestName: (value: string) => void;

  categoriesLoading: boolean;
  categoriesError: boolean;
  categories: MenuCategory[];
  activeCategoryId: string | "all";
  onChangeActiveCategoryId: (id: string | "all") => void;

  visibleItems: MenuItem[];
  menuLoading: boolean;
  menuError: boolean;

  draftItems: Record<string, DraftOrderItem>;
  onChangeQty: (item: MenuItem, delta: number) => void;
  onChangeItemNote?: (itemId: string, note: string) => void;

  selectedItemCount: number;
  selectedTotal: number;

  // ✅ currency (optional): if omitted, derived from layout region
  currency?: CurrencyCode;

  onClose: () => void;
  onSubmit: () => void;
  submitPending: boolean;
};

function formatMoney(amount: number, currency: CurrencyCode) {
  const n = Number(amount || 0);
  const symbol = currency === "GBP" ? "£" : "₺";

  // We intentionally avoid Intl currency formatting here to keep
  // a consistent UI across the app: `1.234,00 ₺` / `1.234,00 £`.
  const formatted = n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${formatted} ${symbol}`;
}

export const WalkInOrderModal: React.FC<Props> = ({
  open,
  tableName,
  guestName,
  onChangeGuestName,
  categoriesLoading,
  categoriesError,
  categories,
  activeCategoryId,
  onChangeActiveCategoryId,
  visibleItems,
  menuLoading,
  menuError,
  draftItems,
  onChangeQty,
  onChangeItemNote,
  selectedItemCount,
  selectedTotal,
  currency,
  onClose,
  onSubmit,
  submitPending,
}) => {
  if (!open) return null;

  const { region } = useRestaurantDesktopCurrency();

  const defaultCurrency: CurrencyCode =
    region === "UK" || region === "GB" ? "GBP" : "TRY";

  const effectiveCurrency: CurrencyCode = currency ?? defaultCurrency;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,9,20,0.46)] backdrop-blur-md">
      <div className="w-[min(1160px,100%-56px)] h-[660px] max-h-[92vh] rounded-[26px] border border-black/10 bg-[radial-gradient(circle_at_top_left,rgba(88,57,255,0.10),rgba(255,255,255,0.98))] shadow-[0_24px_70px_rgba(15,23,42,0.55)] px-6 py-5 flex flex-col gap-3">
        {/* Başlık */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <div className="text-[11px] tracking-[0.18em] uppercase text-slate-400 mb-1">
              WALK-IN SİPARİŞ
            </div>
            <div className="text-[16px] font-semibold text-slate-900">
              Yeni Sipariş — {tableName || "Seçili masa"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-[11px] rounded-full border border-slate-200 bg-white/90 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            Kapat
          </button>
        </div>

        {/* Müşteri / Not */}
        <div className="mb-1">
          <div className="text-[11px] font-medium text-slate-600 mb-1">
            Müşteri / Not
          </div>
          <input
            type="text"
            value={guestName}
            onChange={(e) => onChangeGuestName(e.target.value)}
            className="w-full rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-[12px] text-slate-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
            placeholder="İsteğe bağlı; örn. 4 kişi, rezervasyonsuz masa"
          />
        </div>

        {/* Kategoriler */}
        <div className="mt-1 flex-1 min-h-0 grid grid-cols-12 gap-3">
          {/* Sol: kategori listesi */}
          <div className="col-span-3 min-h-0">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-medium text-slate-600">
                Kategoriler
              </div>
              {categoriesLoading && (
                <span className="text-[10px] text-slate-500">
                  Yükleniyor…
                </span>
              )}
              {categoriesError && (
                <span className="text-[10px] text-red-500">
                  Alınamadı
                </span>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-2 h-full overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeActiveCategoryId("all")}
                  className={
                    "h-12 px-3 rounded-2xl border text-[12px] font-medium flex items-center justify-center text-center select-none transition " +
                    (activeCategoryId === "all"
                      ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-600/25"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")
                  }
                >
                  Tümü
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat._id}
                    type="button"
                    onClick={() => onChangeActiveCategoryId(cat._id)}
                    className={
                      "h-12 px-3 rounded-2xl border text-[12px] font-medium flex items-center justify-center text-center select-none transition " +
                      (activeCategoryId === cat._id
                        ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-600/25"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50")
                    }
                    title={cat.title}
                  >
                    <span className="line-clamp-2 leading-[1.05]">
                      {cat.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sağ: ürün listesi */}
          <div className="col-span-6 min-h-0 flex flex-col">
            <div className="text-[11px] font-medium text-slate-600 mb-1">
              Ürünler
              {menuLoading && (
                <span className="ml-2 text-[10px] text-slate-500">Yükleniyor…</span>
              )}
              {menuError && !menuLoading && (
                <span className="ml-2 text-[10px] text-red-500">Getirilemedi</span>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/95 flex-1 min-h-0 overflow-y-auto">
              {!menuLoading && !menuError && visibleItems.length === 0 && (
                <div className="px-4 py-3 text-[12px] text-slate-500">
                  Bu kategori için henüz ürün yok.
                </div>
              )}

              {!menuLoading &&
                !menuError &&
                visibleItems.length > 0 &&
                visibleItems.map((mi) => {
                  const current = draftItems[mi._id]?.qty ?? 0;
                  const isUnavailable = mi.isAvailable === false;

                  const handleInc = () => onChangeQty(mi, 1);
                  const handleDec = () => onChangeQty(mi, -1);

                  return (
                    <div
                      key={mi._id}
                      className={
                        "flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-b-0 transition " +
                        (isUnavailable ? "opacity-60" : "hover:bg-slate-50/60")
                      }
                    >
                      {/* Ürüne tıklayınca +1 */}
                      <button
                        type="button"
                        onClick={handleInc}
                        disabled={isUnavailable}
                        className="flex-1 mr-4 text-left"
                        style={{ background: "transparent" }}
                      >
                        <div className="text-[14px] font-medium text-slate-900">
                          {mi.title}
                        </div>
                        <div className="text-[12px] text-slate-500">
                          <span className="font-semibold">
                            {formatMoney(mi.price, effectiveCurrency)}
                          </span>
                          {isUnavailable && (
                            <span className="ml-1 text-[10px] text-red-500">
                              · Şu anda servis dışı
                            </span>
                          )}
                        </div>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="w-11 h-11 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-[18px] font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition"
                          onClick={handleDec}
                          disabled={current <= 0}
                        >
                          –
                        </button>
                        <div className="min-w-[26px] text-center text-[13px] font-semibold text-slate-900">
                          {current}
                        </div>
                        <button
                          type="button"
                          className="w-11 h-11 rounded-full border border-purple-500 bg-purple-600 text-white flex items-center justify-center text-[18px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-purple-700 transition"
                          onClick={handleInc}
                          disabled={isUnavailable}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Sağ: seçilenler (taslak) */}
          <div className="col-span-3 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold text-slate-700">Seçilenler</div>
              <div className="text-[10px] text-slate-500">
                <span className="font-semibold text-slate-700">{selectedItemCount}</span> ürün ·{" "}
                <span className="font-semibold text-slate-700">{formatMoney(selectedTotal, effectiveCurrency)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-purple-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.92))] flex-1 min-h-0 overflow-y-auto shadow-[0_14px_34px_rgba(15,23,42,0.10)]">
              {Object.keys(draftItems || {}).length === 0 ? (
                <div className="px-4 py-4 text-[12px] text-slate-500">
                  <div className="font-medium text-slate-600">Henüz ürün eklenmedi.</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Soldan ürüne tıklayarak veya “+” ile ekleyebilirsin.
                  </div>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {Object.values(draftItems)
                    .slice()
                    .sort((a, b) => a.title.localeCompare(b.title, "tr"))
                    .map((di) => {
                      const lineTotal = Number(di.price || 0) * Number(di.qty || 0);
                      const canDec = (di.qty ?? 0) > 0;

                      return (
                        <div
                          key={di.itemId}
                          className="rounded-2xl border border-purple-100 bg-white/95 px-3 py-2 shadow-[0_10px_22px_rgba(15,23,42,0.06)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[12px] font-semibold text-slate-900 leading-snug break-words">{di.title}</div>
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                <span className="mr-2">
                                  Birim: <span className="font-semibold text-slate-700">{formatMoney(Number(di.price || 0), effectiveCurrency)}</span>
                                </span>
                                <span>
                                  Ara: <span className="font-semibold text-slate-700">{formatMoney(lineTotal, effectiveCurrency)}</span>
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5 pl-2">
                              <button
                                type="button"
                                className="w-8 h-8 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center text-[15px] font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition"
                                onClick={() => onChangeQty({ _id: di.itemId, title: di.title, price: di.price }, -1)}
                                disabled={!canDec}
                                aria-label="Azalt"
                              >
                                –
                              </button>
                              <div className="min-w-[22px] text-center text-[12px] font-semibold text-slate-900">
                                {di.qty}
                              </div>
                              <button
                                type="button"
                                className="w-8 h-8 rounded-full border border-purple-500 bg-purple-600 text-white flex items-center justify-center text-[15px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-purple-700 transition"
                                onClick={() => onChangeQty({ _id: di.itemId, title: di.title, price: di.price }, 1)}
                                aria-label="Arttır"
                              >
                                +
                              </button>

                              <button
                                type="button"
                                className="ml-1 w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-700 flex items-center justify-center text-[13px] font-semibold hover:bg-red-100 transition"
                                onClick={() => {
                                  const currentQty = Number(di.qty || 0);
                                  if (currentQty > 0) {
                                    onChangeQty({ _id: di.itemId, title: di.title, price: di.price }, -currentQty);
                                  }
                                }}
                                aria-label="Kaldır"
                                title="Kaldır"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Not (opsiyonel) */}
                          {typeof onChangeItemNote === "function" ? (
                            <div className="mt-2">
                              <input
                                type="text"
                                value={di.note ?? ""}
                                onChange={(e) => onChangeItemNote(di.itemId, e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                                placeholder="Not (opsiyonel)"
                              />
                            </div>
                          ) : di.note ? (
                            <div className="mt-2 text-[11px] text-slate-500">Not: {di.note}</div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer / Özet */}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Seçili ürün:&nbsp;
            <span className="font-semibold text-slate-900">
              {selectedItemCount} adet
            </span>
            &nbsp; · Toplam:&nbsp;
            <span className="font-semibold text-slate-900">
              {formatMoney(selectedTotal, effectiveCurrency)}
            </span>
            <span className="ml-2 text-[10px] text-slate-400">(seçilenler panelinden düzenleyebilirsin)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={submitPending || selectedItemCount === 0}
              onClick={onSubmit}
              className="px-5 py-2 rounded-full bg-gradient-to-r from-purple-600 to-purple-500 text-[12px] font-semibold text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-600/40 hover:translate-y-[-1px] transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {submitPending ? "Kaydediliyor…" : "Siparişi Kaydet"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};