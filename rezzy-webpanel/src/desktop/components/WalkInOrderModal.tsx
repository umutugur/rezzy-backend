// src/desktop/components/WalkInOrderModal.tsx
import React from "react";

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

  selectedItemCount: number;
  selectedTotal: number;

  // ✅ yeni
  currency: CurrencyCode;

  onClose: () => void;
  onSubmit: () => void;
  submitPending: boolean;
};

function formatMoney(amount: number, currency: CurrencyCode) {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    const symbol = currency === "GBP" ? "£" : "₺";
    return `${n.toFixed(2)}${symbol}`;
  }
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
  selectedItemCount,
  selectedTotal,
  currency,
  onClose,
  onSubmit,
  submitPending,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,9,20,0.46)] backdrop-blur-md">
      <div className="w-[min(980px,100%-80px)] h-[520px] max-h-[90vh] rounded-[26px] border border-black/10 bg-[radial-gradient(circle_at_top_left,rgba(88,57,255,0.10),rgba(255,255,255,0.98))] shadow-[0_24px_70px_rgba(15,23,42,0.55)] px-6 py-5 flex flex-col gap-3">
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
        <div className="mt-1">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-medium text-slate-600">
              Kategoriler
            </div>
            {categoriesLoading && (
              <span className="text-[10px] text-slate-500">
                Kategoriler yükleniyor…
              </span>
            )}
            {categoriesError && (
              <span className="text-[10px] text-red-500">
                Kategoriler alınamadı.
              </span>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => onChangeActiveCategoryId("all")}
              className={
                "min-w-[110px] h-11 px-4 rounded-full border text-[12px] font-medium flex items-center justify-center select-none transition " +
                (activeCategoryId === "all"
                  ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-600/30"
                  : "bg-white/90 text-slate-600 border-slate-200 hover:bg-slate-50")
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
                  "min-w-[110px] h-11 px-4 rounded-full border text-[12px] font-medium flex items-center justify-center select-none transition " +
                  (activeCategoryId === cat._id
                    ? "bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-600/30"
                    : "bg-white/90 text-slate-600 border-slate-200 hover:bg-slate-50")
                }
              >
                {cat.title}
              </button>
            ))}
          </div>
        </div>

        {/* Menü listesi */}
        <div className="mt-1 flex-1 min-h-0">
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 h-full overflow-y-auto">
            {menuLoading && (
              <div className="px-4 py-3 text-[12px] text-slate-500">
                Menü yükleniyor…
              </div>
            )}

            {menuError && !menuLoading && (
              <div className="px-4 py-3 text-[12px] text-red-500">
                Menü listesi getirilemedi.
              </div>
            )}

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
                    className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60 transition"
                  >
                    <div className="flex-1 mr-4">
                      <div className="text-[14px] font-medium text-slate-900">
                        {mi.title}
                      </div>
                      <div className="text-[12px] text-slate-500">
                        <span className="font-semibold">
                          {formatMoney(mi.price, currency)}
                        </span>
                        {isUnavailable && (
                          <span className="ml-1 text-[10px] text-red-500">
                            · Şu anda servis dışı
                          </span>
                        )}
                      </div>
                    </div>

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

        {/* Footer / Özet */}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            Seçili ürün:&nbsp;
            <span className="font-semibold text-slate-900">
              {selectedItemCount} adet
            </span>
            &nbsp; · Toplam:&nbsp;
            <span className="font-semibold text-slate-900">
              {formatMoney(selectedTotal, currency)}
            </span>
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