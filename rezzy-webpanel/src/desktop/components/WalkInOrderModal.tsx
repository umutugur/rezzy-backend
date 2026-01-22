// src/desktop/components/WalkInOrderModal.tsx
import React from "react";
import { useRestaurantDesktopCurrency } from "../layouts/RestaurantDesktopLayout";

type MenuCategory = {
  _id: string;
  title: string;
};

type ModifierOption = {
  _id: string;
  title: string;
  price?: number;      // price delta
  priceDelta?: number; // allow either naming
  isActive?: boolean;
};

type ModifierGroup = {
  _id: string;
  title: string;
  description?: string;
  minSelect?: number;
  maxSelect?: number;
  isActive?: boolean;
  options?: ModifierOption[];
};

type MenuItem = {
  _id: string;
  title: string;
  price: number;
  isAvailable?: boolean;

  // If present, clicking item should open modifier picker
  // Some endpoints may return full groups, others only ids.
  modifierGroups?: ModifierGroup[] | { items?: ModifierGroup[] } | null;
  modifierGroupIds?: string[] | null;
};

type DraftOrderItem = {
  itemId: string;
  title: string;
  price: number; // unit price (base + modifier deltas if any)
  qty: number;
  note?: string;

  modifiers?: Array<{ groupId: string; optionId: string }>;
  selectedModifiers?: Array<{ groupId: string; optionId: string }>;
  modifierLabel?: string;
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
  // Optional lookup map to hydrate modifier groups when items only have modifierGroupIds
  modifierGroupsById?: Record<string, ModifierGroup> | ModifierGroup[] | { items?: ModifierGroup[] } | null;
  menuLoading: boolean;
  menuError: boolean;

  draftItems: Record<string, DraftOrderItem>;
  onChangeQty: (item: MenuItem, delta: number) => void;

  // If provided, modifier picker will call this; parent should store selected modifiers
  onAddWithModifiers?: (
    item: MenuItem,
    selectedModifiers: Array<{ groupId: string; optionId: string }>
  ) => void;

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
  modifierGroupsById,
  menuLoading,
  menuError,
  draftItems,
  onChangeQty,
  onAddWithModifiers,
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

  // Normalize modifierGroupsById so parent can pass either a map or an array-like payload
  const modifierGroupMap: Record<string, ModifierGroup> = React.useMemo(() => {
    const v: any = modifierGroupsById as any;

    // 1) Already a map
    if (v && typeof v === "object" && !Array.isArray(v)) {
      // Some callers may accidentally pass { items: [...] }
      if (Array.isArray(v.items)) {
        const out: Record<string, ModifierGroup> = {};
        for (const g of v.items) {
          if (!g || !(g as any)._id) continue;
          out[String((g as any)._id)] = g as any;
        }
        return out;
      }

      // If it looks like a proper id->group map, keep it
      const keys = Object.keys(v);
      // Heuristic: if it has many keys and the first value looks like a group, accept
      if (keys.length > 0) {
        const first = v[keys[0]];
        if (first && typeof first === "object" && (first as any)._id) return v as Record<string, ModifierGroup>;
      }

      // Otherwise it might be an empty object or a wrong shape
      return (v as Record<string, ModifierGroup>) || {};
    }

    // 2) Array of groups
    if (Array.isArray(v)) {
      const out: Record<string, ModifierGroup> = {};
      for (const g of v) {
        if (!g || !(g as any)._id) continue;
        out[String((g as any)._id)] = g as any;
      }
      return out;
    }

    return {};
  }, [modifierGroupsById]);

  // Keep a local cache of menu items we've seen so far.
  // This allows the "Seçilenler" panel to open the modifier picker with the full item shape
  // (even if the user switches categories).
  const itemCacheRef = React.useRef<Record<string, MenuItem>>({});

  React.useEffect(() => {
    if (!Array.isArray(visibleItems)) return;
    if (visibleItems.length === 0) return;
    const next = { ...itemCacheRef.current };
    for (const it of visibleItems) {
      if (!it || !it._id) continue;
      next[String(it._id)] = it;
    }
    itemCacheRef.current = next;
  }, [visibleItems]);

  // =========================
  // Modifier picker (internal)
  // =========================
  const [modifierPickerOpen, setModifierPickerOpen] = React.useState(false);
  const [modifierPickerItem, setModifierPickerItem] = React.useState<MenuItem | null>(null);
  const [modifierSelections, setModifierSelections] = React.useState<Record<string, Set<string>>>({});
  const [modifierError, setModifierError] = React.useState<string>("");

  function getItemModifierGroups(item: MenuItem): ModifierGroup[] {
    // 1) Prefer hydrated groups on the item itself
    const mg: any = (item as any).modifierGroups;
    if (Array.isArray(mg)) return mg as ModifierGroup[];
    if (mg && Array.isArray(mg.items)) return mg.items as ModifierGroup[];

    // 2) If only ids exist, try to hydrate from the lookup map (if provided)
    const idsRaw: any = (item as any).modifierGroupIds;
    const ids = Array.isArray(idsRaw)
      ? idsRaw
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
      : [];

    if (ids.length > 0) {
      const hydrated = ids
        .map((id) => modifierGroupMap[id])
        .filter(Boolean) as ModifierGroup[];
      return hydrated;
    }

    return [];
  }

  function itemHasAnyModifierConfig(item: MenuItem): boolean {
    const groups = getItemModifierGroups(item);
    if (groups.length > 0) return true;
    const ids: any = (item as any).modifierGroupIds;
    return Array.isArray(ids) && ids.length > 0;
  }

  function getGroupLimits(g: ModifierGroup) {
    const min = Math.max(0, Number(g.minSelect ?? 0));
    const max = Math.max(0, Number(g.maxSelect ?? 1));
    return { min, max };
  }

  function openModifierPicker(item: MenuItem) {
    setModifierError("");
    setModifierPickerItem(item);

    const next: Record<string, Set<string>> = {};
    const groups = getItemModifierGroups(item);

    // If we still cannot hydrate groups/options, show a deterministic error.
    if (groups.length === 0) {
      const ids: any = (item as any).modifierGroupIds;
      const hasIds = Array.isArray(ids) && ids.length > 0;

      const mapKeyCount = Object.keys(modifierGroupMap || {}).length;
      setModifierError(
        hasIds
          ? `Bu ürün opsiyonlu görünüyor ama opsiyon detayları yüklenmedi.\n\nBeklenen: modifierGroups + options verisi.\nMevcut: modifierGroupIds var (${Array.isArray(ids) ? ids.length : 0} adet), modifierGroupsById map key sayısı: ${mapKeyCount}.\n\nÇözüm: LiveTablesPage (parent) resolved menüden modifierGroups/option'ları alıp WalkInOrderModal'a modifierGroupsById olarak geçmeli.`
          : "Bu ürün için opsiyon bulunamadı."
      );
      setModifierPickerItem(item);
      setModifierSelections({});
      setModifierPickerOpen(true);
      return;
    }

    groups.forEach((g) => {
      next[String(g._id)] = new Set<string>();
    });

    setModifierSelections(next);
    setModifierPickerOpen(true);
  }

  function closeModifierPicker() {
    setModifierPickerOpen(false);
    setModifierPickerItem(null);
    setModifierSelections({});
    setModifierError("");
  }

  function toggleOption(group: ModifierGroup, option: ModifierOption) {
    const gid = String(group._id);
    const oid = String(option._id);
    const { max } = getGroupLimits(group);

    setModifierSelections((prev) => {
      const curr = prev[gid] ? new Set(prev[gid]) : new Set<string>();
      const has = curr.has(oid);

      if (has) {
        curr.delete(oid);
      } else {
        if (max <= 1) {
          curr.clear();
          curr.add(oid);
        } else {
          if (curr.size >= max) return prev;
          curr.add(oid);
        }
      }

      return { ...prev, [gid]: curr };
    });
  }

  function validateModifierSelections(item: MenuItem): string {
    const groups = getItemModifierGroups(item);
    for (const g of groups) {
      if (!g || g.isActive === false) continue;
      const gid = String(g._id);
      const set = modifierSelections[gid] ?? new Set<string>();
      const { min, max } = getGroupLimits(g);
      if (set.size < min) return `“${g.title}” için en az ${min} seçim zorunlu.`;
      if (max > 0 && set.size > max) return `“${g.title}” için en fazla ${max} seçim yapılabilir.`;
    }
    return "";
  }

  function buildSelectedModifiersPayload(item: MenuItem) {
    const groups = getItemModifierGroups(item);
    const out: Array<{ groupId: string; optionId: string }> = [];

    for (const g of groups) {
      if (!g || g.isActive === false) continue;
      const gid = String(g._id);
      const set = modifierSelections[gid] ?? new Set<string>();
      for (const oid of Array.from(set)) {
        out.push({ groupId: gid, optionId: String(oid) });
      }
    }

    return out;
  }

  function optionPriceDelta(opt: ModifierOption) {
    const d = Number(opt.priceDelta ?? opt.price ?? 0);
    return Number.isFinite(d) ? d : 0;
  }

  function confirmModifierPicker() {
    const item = modifierPickerItem;
    if (!item) return;

    const err = validateModifierSelections(item);
    if (err) {
      setModifierError(err);
      return;
    }

    const payload = buildSelectedModifiersPayload(item);

    if (typeof onAddWithModifiers === "function") {
  onAddWithModifiers(item, payload);
} else {
  setModifierError(
    "Bu ekranda opsiyon seçimi kaydedilemiyor (parent onAddWithModifiers bağlı değil). LiveTablesPage, WalkInOrderModal'a onAddWithModifiers prop'u göndermeli."
  );
  return;
}

    closeModifierPicker();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(7,9,20,0.46)] backdrop-blur-md">
      <div className="w-[min(1280px,100%-48px)] h-[740px] max-h-[92vh] rounded-[28px] border border-slate-200/70 bg-white/80 shadow-[0_28px_90px_rgba(15,23,42,0.55)] overflow-hidden">
        <div className="h-full w-full px-6 py-5 bg-[radial-gradient(circle_at_top_left,rgba(88,57,255,0.10),rgba(255,255,255,0.92))] flex flex-col gap-3">
        {/* Başlık */}
        <div className="flex items-start justify-between gap-3">
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
        <div className="h-px w-full bg-gradient-to-r from-slate-200/40 via-slate-200/80 to-slate-200/40" />

        {/* Müşteri / Not */}
        <div className="">
          <div className="text-[11px] font-medium text-slate-600 mb-1">
            Müşteri / Not
          </div>
          <input
            type="text"
            value={guestName}
            onChange={(e) => onChangeGuestName(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-[13px] text-slate-900 shadow-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
            placeholder="İsteğe bağlı; örn. 4 kişi, rezervasyonsuz masa"
          />
        </div>

        {/* Kategoriler */}
        <div className="flex-1 min-h-0 grid grid-cols-12 gap-4">
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

            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-2 h-full overflow-y-auto shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeActiveCategoryId("all")}
                  className={
                    "h-11 px-3 rounded-2xl border text-[12px] font-medium flex items-center justify-center text-center select-none transition " +
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
                      "h-11 px-3 rounded-2xl border text-[12px] font-medium flex items-center justify-center text-center select-none transition " +
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

            <div className="rounded-2xl border border-slate-200/80 bg-white/95 flex-1 min-h-0 overflow-y-auto shadow-sm">
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

                  const hasModifiers = itemHasAnyModifierConfig(mi);

                  const handleInc = () => {
                    if (hasModifiers) {
                      openModifierPicker(mi);
                      return;
                    }
                    onChangeQty(mi, 1);
                  };
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
                        <div className="text-[13px] font-semibold text-slate-900 leading-snug break-words">
                          {mi.title}
                        </div>
                        <div className="text-[12px] text-slate-500 flex items-center gap-2">
                          <span className="font-semibold">
                            {formatMoney(mi.price, effectiveCurrency)}
                          </span>

                          {hasModifiers ? (
                            <span className="inline-flex items-center rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200">
                              Opsiyonlu
                            </span>
                          ) : null}

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

            <div className="rounded-2xl border border-purple-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.90))] flex-1 min-h-0 overflow-y-auto shadow-[0_18px_46px_rgba(15,23,42,0.14)]">
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
                          className="rounded-2xl border border-purple-100 bg-white/95 px-3 py-2.5 shadow-[0_12px_26px_rgba(15,23,42,0.07)]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold text-slate-900 leading-snug break-words">{di.title}</div>
                              {di.modifierLabel ? (
  <div className="mt-1 text-[11px] text-purple-700/90 font-medium break-words">
    {di.modifierLabel}
  </div>
) : null}
                              <div className="mt-1 text-[11px] text-slate-500 grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <span>
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
                                onClick={() => {
                                  const full = itemCacheRef.current[String(di.itemId)];
                                  const fallback: MenuItem = { _id: di.itemId, title: di.title, price: Number(di.price || 0) };
                                  onChangeQty(full ?? fallback, -1);
                                }}
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
                                onClick={() => {
                                  const full = itemCacheRef.current[String(di.itemId)];
                                  const fallback: MenuItem = { _id: di.itemId, title: di.title, price: Number(di.price || 0) };
                                  const itemToUse = full ?? fallback;

                                  // If the item is option/modifier-based, adding from the right panel should open the picker
                                  // so each increment can carry its own modifier choices.
                                  if (itemHasAnyModifierConfig(itemToUse)) {
                                    openModifierPicker(itemToUse);
                                    return;
                                  }

                                  onChangeQty(itemToUse, 1);
                                }}
                                aria-label="Arttır"
                              >
                                +
                              </button>

                              <button
                                type="button"
                                className="ml-1 w-8 h-8 rounded-full border border-red-200 bg-red-50 text-red-700 flex items-center justify-center text-[13px] font-semibold hover:bg-red-100 transition"
                                onClick={() => {
                                  const currentQty = Number(di.qty || 0);
                                  if (currentQty <= 0) return;

                                  const full = itemCacheRef.current[String(di.itemId)];
                                  const fallback: MenuItem = { _id: di.itemId, title: di.title, price: Number(di.price || 0) };
                                  onChangeQty(full ?? fallback, -currentQty);
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
        <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/75 px-4 py-3 shadow-sm">
          <div className="text-[11px] text-slate-500">
            Seçili ürün:&nbsp;
            <span className="font-semibold text-slate-900">
              {selectedItemCount} adet
            </span>
            &nbsp; · Toplam:&nbsp;
            <span className="font-semibold text-slate-900">
              {formatMoney(selectedTotal, effectiveCurrency)}
            </span>
            <span className="ml-2 text-[10px] text-slate-400">(düzenleme: sağ panel)</span>
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
        {/* =========================
            Modifier Picker Modal
        ========================= */}
        {modifierPickerOpen && modifierPickerItem && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(7,9,20,0.52)] backdrop-blur-sm">
            <div className="w-[min(720px,100%-32px)] max-h-[88vh] rounded-[24px] border border-slate-200/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.55)] overflow-hidden">
              <div className="px-5 py-4 bg-[radial-gradient(circle_at_top_left,rgba(88,57,255,0.12),rgba(255,255,255,0.96))]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] tracking-[0.18em] uppercase text-slate-400 mb-1">OPSİYON SEÇ</div>
                    <div className="text-[15px] font-semibold text-slate-900 leading-snug">{modifierPickerItem.title}</div>
                    <div className="mt-1 text-[12px] text-slate-500">
                      Taban fiyat: <span className="font-semibold text-slate-700">{formatMoney(modifierPickerItem.price, effectiveCurrency)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={closeModifierPicker}
                    className="px-3 py-1 text-[11px] rounded-full border border-slate-200 bg-white/90 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                  >
                    Kapat
                  </button>
                </div>

                <div className="mt-3 h-px w-full bg-gradient-to-r from-slate-200/40 via-slate-200/80 to-slate-200/40" />

                {modifierError ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">{modifierError}</div>
                ) : null}

                <div className="mt-4 max-h-[56vh] overflow-y-auto pr-1">
                  {getItemModifierGroups(modifierPickerItem)
                    .filter((g) => g && g.isActive !== false)
                    .map((g) => {
                      const { min, max } = getGroupLimits(g);
                      const selected = modifierSelections[String(g._id)] ?? new Set<string>();
                      const opts = (g.options ?? []).filter((o) => o && o.isActive !== false);

                      return (
                        <div key={g._id} className="mb-4 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-slate-900">{g.title}</div>
                              {g.description ? (
                                <div className="mt-0.5 text-[11px] text-slate-500">{g.description}</div>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-[11px] text-slate-500">
                              {min > 0 ? (
                                <span className="font-semibold text-slate-700">En az {min}</span>
                              ) : (
                                <span>Opsiyonel</span>
                              )}{" "}
                              <span className="text-slate-400">·</span>{" "}
                              <span className="font-semibold text-slate-700">En fazla {Math.max(1, max)}</span>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2">
                            {opts.length === 0 ? (
                              <div className="text-[12px] text-slate-500">Bu grupta seçenek yok.</div>
                            ) : (
                              opts.map((o) => {
                                const oid = String(o._id);
                                const checked = selected.has(oid);
                                const delta = optionPriceDelta(o);
                                const disableAdd = !checked && max > 0 && max > 1 && selected.size >= max;

                                return (
                                  <button
                                    key={o._id}
                                    type="button"
                                    onClick={() => toggleOption(g, o)}
                                    disabled={disableAdd}
                                    className={
                                      "w-full rounded-2xl border px-3 py-2 text-left transition flex items-center justify-between gap-3 " +
                                      (checked ? "border-purple-500 bg-purple-50" : "border-slate-200 bg-white hover:bg-slate-50") +
                                      (disableAdd ? " opacity-60 cursor-not-allowed" : "")
                                    }
                                  >
                                    <div className="min-w-0">
                                      <div className="text-[12.5px] font-semibold text-slate-900 break-words">{o.title}</div>
                                      <div className="mt-0.5 text-[11px] text-slate-500">{checked ? "Seçili" : "Seç"}</div>
                                    </div>

                                    <div className="shrink-0 flex items-center gap-2">
                                      {delta !== 0 ? (
                                        <div className="text-[12px] font-semibold text-slate-700">
                                          {delta > 0 ? "+" : ""}{formatMoney(delta, effectiveCurrency)}
                                        </div>
                                      ) : (
                                        <div className="text-[12px] text-slate-400">+0</div>
                                      )}
                                      <div
                                        className={
                                          "w-5 h-5 rounded-full border flex items-center justify-center text-[11px] font-bold " +
                                          (checked ? "border-purple-500 bg-purple-600 text-white" : "border-slate-300 bg-white text-transparent")
                                        }
                                        aria-hidden
                                      >
                                        ✓
                                      </div>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>

                          <div className="mt-2 text-[11px] text-slate-500">
                            Seçim: <span className="font-semibold text-slate-700">{selected.size}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm">
                  <div className="text-[11px] text-slate-500">Seçimlerini onaylayınca ürün sepete eklenecek.</div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeModifierPicker}
                      className="px-4 py-2 rounded-full border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition"
                    >
                      Vazgeç
                    </button>
                      <button
                        type="button"
                        onClick={confirmModifierPicker}
                        disabled={getItemModifierGroups(modifierPickerItem).length === 0 || !!modifierError}
                        className="px-5 py-2 rounded-full bg-gradient-to-r from-purple-600 to-purple-500 text-[12px] font-semibold text-white shadow-lg shadow-purple-600/30 hover:shadow-purple-600/40 hover:translate-y-[-1px] transition disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Seçimleri Onayla
                      </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};