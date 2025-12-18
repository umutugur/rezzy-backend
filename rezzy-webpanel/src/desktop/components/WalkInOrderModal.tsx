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

function normalizeText(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeVisibleItems = Array.isArray(visibleItems) ? visibleItems : [];
  const safeDraftItems =
    draftItems && typeof draftItems === "object" ? draftItems : {};
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setQ("");
    }
  }, [open]);

  if (!open) return null;

  const filteredItems = React.useMemo(() => {
    const query = normalizeText(q);
    if (!query) return safeVisibleItems;

    return safeVisibleItems.filter((mi) =>
      normalizeText(mi.title).includes(query)
    );
  }, [safeVisibleItems, q]);

  const hasItems = filteredItems.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,9,20,0.50)] backdrop-blur-md">
      <div
        className={[
          "w-[min(1240px,100%-60px)]",
          "h-[min(760px,92vh)]",
          "rounded-[28px] border border-black/10",
          "bg-[radial-gradient(circle_at_top_left,rgba(88,57,255,0.12),rgba(255,255,255,0.98))]",
          "shadow-[0_28px_90px_rgba(15,23,42,0.60)]",
          "px-6 py-5",
          "flex flex-col",
          "gap-4",
        ].join(" ")}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.18em] uppercase text-slate-400 mb-1">
              WALK-IN SİPARİŞ
            </div>
            <div className="text-[18px] font-semibold text-slate-900">
              Yeni Sipariş —{" "}
              <span className="text-slate-800">{tableName || "Seçili masa"}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Ürüne tıkla: +1. Eksiltme için “–” butonu.
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

        {/* Top inputs row */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-8">
            <div className="text-[11px] font-medium text-slate-600 mb-1">
              Müşteri / Not
            </div>
            <input
              type="text"
              value={guestName}
              onChange={(e) => onChangeGuestName(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-[12px] text-slate-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
              placeholder="İsteğe bağlı; örn. 4 kişi, rezervasyonsuz masa"
            />
          </div>

          <div className="col-span-4">
            <div className="text-[11px] font-medium text-slate-600 mb-1">
              Ürün Ara
            </div>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white/95 px-4 py-2.5 text-[12px] text-slate-900 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
              placeholder="örn. omlet, kahve…"
            />
          </div>
        </div>

        {/* Body: left categories, right items */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-4">
          {/* LEFT: categories */}
          <div className="col-span-4 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold text-slate-700">
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

            <div className="rounded-2xl border border-slate-200/80 bg-white/92 p-3 h-full overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeActiveCategoryId("all")}
                  className={[
                    "h-[56px] rounded-2xl border text-[12px] font-semibold",
                    "flex items-center justify-center",
                    "transition select-none",
                    activeCategoryId === "all"
                      ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white border-purple-600 shadow-[0_14px_30px_rgba(126,34,206,0.30)]"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                  ].join(" ")}
                >
                  Tümü
                </button>

                {safeCategories.map((cat) => {
                  const active = activeCategoryId === cat._id;
                  return (
                    <button
                      key={cat._id}
                      type="button"
                      onClick={() => onChangeActiveCategoryId(cat._id)}
                      className={[
                        "h-[56px] rounded-2xl border text-[12px] font-semibold px-3",
                        "flex items-center justify-center text-center leading-tight",
                        "transition select-none",
                        active
                          ? "bg-gradient-to-r from-purple-600 to-purple-500 text-white border-purple-600 shadow-[0_14px_30px_rgba(126,34,206,0.30)]"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                      ].join(" ")}
                      title={cat.title}
                    >
                      <span className="line-clamp-2">{cat.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: items */}
          <div className="col-span-8 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold text-slate-700">
                Ürünler
              </div>

              <div className="text-[11px] text-slate-500">
                Seçili:{" "}
                <span className="font-semibold text-slate-900">
                  {selectedItemCount}
                </span>{" "}
                · Toplam:{" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(selectedTotal, currency)}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/95 h-full overflow-y-auto">
              {menuLoading && (
                <div className="px-4 py-4 text-[12px] text-slate-500">
                  Menü yükleniyor…
                </div>
              )}

              {menuError && !menuLoading && (
                <div className="px-4 py-4 text-[12px] text-red-500">
                  Menü listesi getirilemedi.
                </div>
              )}

              {!menuLoading && !menuError && !hasItems && (
                <div className="px-4 py-4 text-[12px] text-slate-500">
                  {q ? "Aramaya uygun ürün bulunamadı." : "Bu kategoride ürün yok."}
                </div>
              )}

              {!menuLoading &&
                !menuError &&
                hasItems &&
                filteredItems.map((mi) => {
                  const current = (safeDraftItems as any)[mi._id]?.qty ?? 0;
                  const isUnavailable = mi.isAvailable === false;

                  const inc = () => {
                    if (isUnavailable) return;
                    onChangeQty(mi, 1);
                  };
                  const dec = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onChangeQty(mi, -1);
                  };

                  return (
                    <div
                      key={mi._id}
                      role="button"
                      tabIndex={0}
                      onClick={inc}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") inc();
                      }}
                      className={[
                        "group px-4 py-3 border-b border-slate-100 last:border-b-0",
                        "flex items-center justify-between gap-3",
                        "transition",
                        isUnavailable
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer hover:bg-slate-50/70",
                      ].join(" ")}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-[14px] font-semibold text-slate-900 truncate">
                            {mi.title}
                          </div>

                          {current > 0 && (
                            <span className="inline-flex items-center rounded-full bg-purple-600 text-white text-[11px] font-semibold px-2 py-0.5">
                              {current} adet
                            </span>
                          )}

                          {isUnavailable && (
                            <span className="inline-flex items-center rounded-full bg-red-50 text-red-600 border border-red-200 text-[10px] font-semibold px-2 py-0.5">
                              Servis dışı
                            </span>
                          )}
                        </div>

                        <div className="text-[12px] text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-700">
                            {formatMoney(mi.price, currency)}
                          </span>
                          <span className="ml-2 text-[10px] text-slate-400">
                            (tıkla +1)
                          </span>
                        </div>
                      </div>

                      {/* Right controls */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={dec}
                          disabled={current <= 0}
                          className="w-10 h-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-[18px] font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition"
                          title="Eksilt"
                        >
                          –
                        </button>

                        <div className="w-12 text-center">
                          <div className="text-[13px] font-semibold text-slate-900">
                            {current}
                          </div>
                          <div className="text-[10px] text-slate-400">adet</div>
                        </div>

                        <div
                          className={[
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            "border border-purple-500",
                            isUnavailable
                              ? "bg-slate-100 text-slate-400"
                              : "bg-purple-600 text-white group-hover:bg-purple-700",
                            "transition",
                          ].join(" ")}
                          title="Tıkla +1"
                        >
                          +
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[11px] text-slate-500">
            Toplam:{" "}
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