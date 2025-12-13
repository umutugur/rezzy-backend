import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authStore } from "../../store/auth";
import {
  restaurantListCategories,
  restaurantCreateCategory,
  restaurantUpdateCategory,
  restaurantListItems,
  restaurantCreateItem,
  restaurantUpdateItem,
  restaurantDeleteItem,
  restaurantGetResolvedMenu,
} from "../../api/client";
import { Card } from "../../components/Card";

/* =======================
   Types
======================= */
type Category = {
  _id: string;
  title: string;
  description?: string;
  order: number;
  isActive: boolean;
  orgCategoryId?: string | null;
};

type Item = {
  _id: string;
  categoryId: string;
  title: string;
  description?: string;
  price: number;
  photoUrl?: string;
  tags: string[];
  order: number;
  isActive: boolean;
  isAvailable: boolean;
  orgItemId?: string | null;
};

type ResolvedSource = "org" | "org_override" | "local";

type ResolvedMenuItem = {
  _id: string;
  title: string;
  description?: string | null;
  price: number;
  photoUrl?: string | null;
  tags?: string[];
  order?: number;
  isActive?: boolean;
  isAvailable?: boolean;
  orgItemId?: string | null;
  source?: ResolvedSource;
};

type ResolvedMenuCategory = {
  _id: string;
  title: string;
  description?: string | null;
  order?: number;
  isActive?: boolean;
  items: ResolvedMenuItem[];
  orgCategoryId?: string | null;
  source?: ResolvedSource;
};

type ResolvedMenuResponse = {
  categories: ResolvedMenuCategory[];
  organizationId?: string | null;
  restaurantId?: string;
};

/* =======================
   Helpers
======================= */
function sortByOrder<T extends { order?: number }>(arr: T[]) {
  return (arr || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function money(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("tr-TR");
}

function norm(s?: string | null) {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * orgCategoryId yoksa bile “override”ı yakalamak için heuristik (fallback).
 * - title + order aynı olan ilk local category’yi alır
 */
function findOverrideCategoryForOrgHeuristic(localCats: Category[], orgCat: ResolvedMenuCategory) {
  const title = norm(orgCat.title);
  const ord = orgCat.order ?? 0;

  const candidates = localCats
    .filter((c) => norm(c.title) === title && (c.order ?? 0) === ord)
    .sort((a, b) => String(a._id).localeCompare(String(b._id)));

  return candidates[0] ?? null;
}

function badgeForCategory(src: ResolvedSource) {
  if (src === "org") return { text: "Merkez Menü", cls: "bg-blue-50 text-blue-700 border border-blue-100" };
  if (src === "org_override")
    return { text: "Bu Şubede Düzenlendi", cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  return { text: "Bu Şubeye Özel", cls: "bg-gray-100 text-gray-700 border border-gray-200" };
}

function badgeForItem(src: ResolvedSource) {
  if (src === "org") return { text: "Merkez Menü", cls: "bg-blue-50 text-blue-700 border border-blue-100" };
  if (src === "org_override")
    return { text: "Bu Şubede Düzenlendi", cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  return { text: "Bu Şubeye Özel", cls: "bg-gray-100 text-gray-700 border border-gray-200" };
}

/**
 * ✅ Deterministic + collision-safe key
 * Render key = selection key (KRİTİK)
 */
function resolvedCategoryKey(c: ResolvedMenuCategory) {
  const src: ResolvedSource = (c.source ?? "local") as ResolvedSource;
  if (src === "org") return `org:${String(c._id)}`;
  if (src === "org_override") return `org_override:${String(c.orgCategoryId || c._id)}`;
  return `local:${String(c._id)}`;
}

function localCategoryKey(localId: string) {
  return `local:${String(localId)}`;
}

function resolvedItemKey(i: ResolvedMenuItem) {
  const src: ResolvedSource = (i.source ?? "local") as ResolvedSource;
  if (src === "org") return `org:${String(i._id)}`;
  // local / override: orgItemId varsa bile selection/render key’i item’ın kendi _id’si (resolved düzeyinde) kalabilir.
  // Çünkü burada listede duplicate render ile uğraşmıyoruz; determinism için yine unique prefix kullanalım.
  return `${src}:${String(i.orgItemId || i._id)}`;
}

/* =======================
   View model
======================= */
type CategoryCardVM = {
  key: string; // render key + selection key
  title: string;
  description?: string | null;
  order: number;
  isActive: boolean;
  source: ResolvedSource;
  resolved?: ResolvedMenuCategory | null;
  local?: Category | null;
  kind: "active_resolved" | "closed_local";
};

export default function MenuManagerPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();

  const [mode, setMode] = React.useState<"manage" | "preview">("manage");

  // ---------------- Queries ----------------
  const catQ = useQuery({
    queryKey: ["menu-categories", rid],
    queryFn: () => restaurantListCategories(rid),
    enabled: !!rid,
  });

  const resolvedQ = useQuery({
    queryKey: ["menu-resolved", rid],
    queryFn: () => restaurantGetResolvedMenu(rid) as Promise<ResolvedMenuResponse>,
    enabled: !!rid,
  });

  const localCats: Category[] = (catQ.data ?? []) as any;
  const resolvedCats: ResolvedMenuCategory[] = sortByOrder(resolvedQ.data?.categories ?? []);

  const refreshAll = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
    qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    qc.invalidateQueries({ queryKey: ["menu-items", rid] });
  }, [qc, rid]);

  // ---------------- Build category cards ----------------
  const { activeCards, closedCards, allCards } = React.useMemo(() => {
    const active: CategoryCardVM[] = resolvedCats.map((c) => {
      const src: ResolvedSource = (c.source ?? "local") as ResolvedSource;
      return {
        key: resolvedCategoryKey(c),
        title: c.title,
        description: c.description ?? null,
        order: c.order ?? 0,
        isActive: c.isActive !== false,
        source: src,
        resolved: c,
        local: null,
        kind: "active_resolved",
      };
    });

    const closedLocalCats = (localCats || []).filter((c) => c.isActive === false);

    const closed: CategoryCardVM[] = sortByOrder(
      closedLocalCats.map((lc) => {
        const src: ResolvedSource = lc.orgCategoryId ? "org_override" : "local";
        return {
          key: localCategoryKey(lc._id), // ✅ closed always keyed by local _id
          title: lc.title,
          description: lc.description ?? null,
          order: lc.order ?? 0,
          isActive: false,
          source: src,
          resolved: null,
          local: lc,
          kind: "closed_local",
        } satisfies CategoryCardVM;
      })
    ).filter((x) => !active.some((a) => a.key === x.key)); // defensive

    return {
      activeCards: sortByOrder(active),
      closedCards: closed,
      allCards: [...sortByOrder(active), ...closed],
    };
  }, [resolvedCats, localCats]);

  // ---------------- Selection (single source of truth) ----------------
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  // keep selection stable across refetch; fallback to first active
  React.useEffect(() => {
    if (!allCards.length) {
      if (selectedKey) setSelectedKey(null);
      return;
    }
    if (selectedKey && allCards.some((c) => c.key === selectedKey)) return;

    const first = activeCards[0] ?? allCards[0];
    setSelectedKey(first.key);
  }, [allCards, activeCards, selectedKey]);

  const selectedCard = React.useMemo(() => {
    if (!selectedKey) return null;
    return allCards.find((c) => c.key === selectedKey) ?? null;
  }, [allCards, selectedKey]);

  const selectedResolved = selectedCard?.resolved ?? null;

  // ---------------- Map selected -> local category id ----------------
  const findLocalForResolved = React.useCallback(
    (rc: ResolvedMenuCategory | null): Category | null => {
      if (!rc) return null;

      const src: ResolvedSource = (rc.source ?? "local") as ResolvedSource;

      // local / org_override resolved => local id matches resolved _id
      if (src !== "org") {
        return localCats.find((lc) => String(lc._id) === String(rc._id)) || null;
      }

      // org => try link first
      const byLink = localCats.find((lc) => String(lc.orgCategoryId || "") === String(rc._id)) || null;
      if (byLink) return byLink;

      // fallback heuristic
      return findOverrideCategoryForOrgHeuristic(localCats, rc);
    },
    [localCats]
  );

  const [selectedLocalCatId, setSelectedLocalCatId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedCard) {
      setSelectedLocalCatId(null);
      return;
    }

    // closed local selected
    if (selectedCard.kind === "closed_local" && selectedCard.local?._id) {
      setSelectedLocalCatId(String(selectedCard.local._id));
      return;
    }

    // resolved selected
    const lc = findLocalForResolved(selectedResolved);
    setSelectedLocalCatId(lc?._id ?? null);
  }, [selectedCard, selectedResolved, findLocalForResolved]);

  const selectedLocalCat = React.useMemo(() => {
    if (!selectedLocalCatId) return null;
    return localCats.find((c) => String(c._id) === String(selectedLocalCatId)) || null;
  }, [localCats, selectedLocalCatId]);

  const selectedIsClosed = selectedCard ? selectedCard.isActive === false : false;

  // ---------------- Mutations: Categories ----------------
  const createCatMut = useMutation({
    mutationFn: (payload: { title: string; description?: string; order?: number; orgCategoryId?: string }) =>
      restaurantCreateCategory(rid, payload as any),
    onSuccess: async (res: any) => {
      const id = res?._id || res?.category?._id || null;
      await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });

      if (id) {
        const k = localCategoryKey(String(id));
        setSelectedKey(k);
        setSelectedLocalCatId(String(id));
        await qc.invalidateQueries({ queryKey: ["menu-items", rid, String(id)] });
      }
    },
  });

  const updateCatMut = useMutation({
    mutationFn: ({ cid, payload }: { cid: string; payload: Partial<Category> }) =>
      restaurantUpdateCategory(rid, cid, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    },
  });

  // “Merkez menü” kategorisinde düzenlemeyi başlat / kapat için: local override kaydı garanti
  const ensureEditableCategoryForOrg = React.useCallback(
    async (orgCat: ResolvedMenuCategory) => {
      const existing =
        localCats.find((lc) => String(lc.orgCategoryId || "") === String(orgCat._id)) ||
        findOverrideCategoryForOrgHeuristic(localCats, orgCat);

      if (existing?._id) {
        setSelectedLocalCatId(existing._id);
        return existing._id as string;
      }

      const payload: any = {
        title: orgCat.title,
        description: orgCat.description ?? "",
        order: orgCat.order ?? 0,
        orgCategoryId: orgCat._id,
        isActive: true,
      };

      return await new Promise<string | null>((resolve) => {
        createCatMut.mutate(payload, {
          onSuccess: async (res: any) => {
            const id = res?._id || res?.category?._id || null;
            await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
            await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
            if (id) {
              setSelectedLocalCatId(String(id));
              resolve(String(id));
            } else {
              resolve(null);
            }
          },
          onError: () => resolve(null),
        });
      });
    },
    [createCatMut, localCats, qc, rid]
  );

  // ---------------- Items: for selected local category ----------------
  const itemsQ = useQuery({
    queryKey: ["menu-items", rid, selectedLocalCatId],
    queryFn: () => restaurantListItems(rid, { categoryId: String(selectedLocalCatId) }),
    enabled: !!rid && !!selectedLocalCatId,
  });

  const localItems: Item[] = (itemsQ.data ?? []) as any;

  const createItemMut = useMutation({
    mutationFn: (payload: {
      categoryId: string;
      title: string;
      description?: string;
      price: number;
      tags?: string[];
      order?: number;
      isAvailable?: boolean;
      photoFile?: File | null;
      orgItemId?: string;
    }) => restaurantCreateItem(rid, payload as any),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["menu-items", rid, selectedLocalCatId] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    },
  });

  const updateItemMut = useMutation({
    mutationFn: (payload: {
      iid: string;
      title?: string;
      description?: string;
      price?: number;
      tags?: string[];
      order?: number;
      isAvailable?: boolean;
      isActive?: boolean;
      removePhoto?: boolean;
      photoFile?: File | null;
    }) => restaurantUpdateItem(rid, payload.iid, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["menu-items", rid, selectedLocalCatId] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: (iid: string) => restaurantDeleteItem(rid, iid),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["menu-items", rid, selectedLocalCatId] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    },
  });

  // ---------------- UI state: forms ----------------
  const [newCat, setNewCat] = React.useState({ title: "", description: "", order: 0 });

  const [editingCatId, setEditingCatId] = React.useState<string | null>(null);
  const [editingCat, setEditingCat] = React.useState<Partial<Category>>({});

  const [newItem, setNewItem] = React.useState({
    title: "",
    description: "",
    price: 0,
    tagsText: "",
    order: 0,
    isAvailable: true,
    photoFile: null as File | null,
  });

  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [editingItem, setEditingItem] = React.useState<any>({});
  const [editingItemPhoto, setEditingItemPhoto] = React.useState<File | null>(null);

  // ---------------- Derived: can operate? ----------------
  const opsDisabled = selectedIsClosed; // kategori kapalıyken ürün işlemleri yok

  const anyError = catQ.isError || resolvedQ.isError || itemsQ.isError;
  const loadingManage = mode === "manage" && (catQ.isLoading || resolvedQ.isLoading || itemsQ.isLoading);
  const loadingPreview = mode === "preview" && resolvedQ.isLoading;

  /* =======================
     UI
  ======================= */
  return (
    <div className="flex-1 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Menü Yönetimi</h2>
          <div className="text-xs text-gray-500">
            Menü; <b>Merkez Menü</b> + <b>Bu Şubede Düzenlenen</b> + <b>Bu Şubeye Özel</b> içeriklerin birleşimidir.
            Merkez menüden gelen bir şeyi şube bazında değiştirmek için önce <b>Düzenlemeyi Başlat</b> kullanılır.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 text-sm rounded border ${
              mode === "manage"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
            onClick={() => setMode("manage")}
          >
            Menüyü Düzenle
          </button>

          <button
            className={`px-3 py-1.5 text-sm rounded border ${
              mode === "preview"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
            onClick={() => setMode("preview")}
          >
            Müşteri Görünümü
          </button>

          <button
            className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
            onClick={refreshAll}
          >
            Yenile
          </button>
        </div>
      </div>

      {!rid && <div className="text-sm text-red-600">RestaurantId bulunamadı. Oturum / authStore akışını kontrol et.</div>}

      {(loadingManage || loadingPreview) && <div className="text-sm text-gray-500">Yükleniyor…</div>}

      {anyError && (
        <div className="text-sm text-red-600">
          Menü verisi alınırken hata oluştu. DevTools → Network / Console’da ilgili isteğin response’unu kontrol et.
        </div>
      )}

      {/* =======================
          MANAGE
      ======================= */}
      {mode === "manage" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ---------- Left: Categories ---------- */}
          <Card title="Kategoriler">
            <div className="space-y-3">
              {/* Active (resolved) */}
              {activeCards.map((card) => {
                const c = card.resolved!;
                const isSelected = card.key === selectedKey;
                const badge = badgeForCategory(card.source);

                // local record if exists (for edit/toggle)
                const localForThisResolved = findLocalForResolved(c);
                const isEditing = !!localForThisResolved && localForThisResolved._id === editingCatId;

                return (
                  <div
                    key={card.key} // ✅ render key = selection key
                    className={`border rounded-lg p-3 transition ${
                      isSelected
                        ? "border-brand-600 bg-brand-50 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {!isEditing ? (
                      <>
                        <button
                          className="w-full text-left"
                          aria-selected={isSelected}
                          onClick={() => setSelectedKey(card.key)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{card.title}</div>
                            <span className={`text-[11px] px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                            {card.isActive === false && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                Kapalı
                              </span>
                            )}
                          </div>

                          {!!card.description && <div className="text-xs text-gray-500 mt-1">{card.description}</div>}

                          <div className="text-xs text-gray-400 mt-1">
                            Sıra: {card.order} • {card.isActive ? "Açık" : "Kapalı"}
                            {card.source === "org" && !localForThisResolved ? " • Bu şubede düzenleme yok" : ""}
                          </div>
                        </button>

                        <div className="flex gap-2 mt-2 flex-wrap">
                          {/* Merkez menü: düzenlemeyi başlat */}
                          {card.source === "org" && !localForThisResolved && (
                            <button
                              className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-900 hover:bg-amber-100"
                              onClick={async () => {
                                const id = await ensureEditableCategoryForOrg(c);
                                if (id) refreshAll();
                              }}
                            >
                              Düzenlemeyi Başlat
                            </button>
                          )}

                          {/* Kategori düzenle (local record varsa) */}
                          {localForThisResolved && (
                            <button
                              className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                              onClick={() => {
                                setEditingCatId(localForThisResolved._id);
                                setEditingCat({
                                  title: localForThisResolved.title,
                                  description: localForThisResolved.description || "",
                                  order: localForThisResolved.order,
                                  isActive: localForThisResolved.isActive,
                                });
                              }}
                            >
                              Kategoriyi Düzenle
                            </button>
                          )}

                          {/* Bu şubede kapat (çift yönlü; silme yok) */}
                          <button
                            className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                            onClick={async () => {
                              // org ise önce editable record aç
                              if (card.source === "org") {
                                const id = await ensureEditableCategoryForOrg(c);
                                if (!id) return;
                                updateCatMut.mutate({ cid: String(id), payload: { isActive: false } });
                                return;
                              }

                              // local / org_override: local record zaten olmalı
                              if (localForThisResolved?._id) {
                                updateCatMut.mutate({ cid: String(localForThisResolved._id), payload: { isActive: false } });
                              }
                            }}
                          >
                            Bu şubede kapat
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editingCat.title ?? ""}
                          placeholder="Kategori adı"
                          onChange={(e) => setEditingCat((p) => ({ ...p, title: e.target.value }))}
                        />
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editingCat.description ?? ""}
                          placeholder="Açıklama"
                          onChange={(e) => setEditingCat((p) => ({ ...p, description: e.target.value }))}
                        />
                        <div className="flex gap-2 items-center">
                          <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">Menü sırası</label>
                            <input
                              type="number"
                              className="w-28 border rounded px-2 py-1 text-sm"
                              value={editingCat.order ?? 0}
                              onChange={(e) => setEditingCat((p) => ({ ...p, order: Number(e.target.value) || 0 }))}
                            />
                          </div>

                          <label className="flex items-center gap-2 text-sm mt-5">
                            <input
                              type="checkbox"
                              checked={editingCat.isActive ?? true}
                              onChange={(e) => setEditingCat((p) => ({ ...p, isActive: e.target.checked }))}
                            />
                            Menüde görünsün
                          </label>
                        </div>

                        <div className="flex gap-2">
                          <button
                            className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                            onClick={() => {
                              if (!editingCatId) return;
                              updateCatMut.mutate({ cid: editingCatId, payload: editingCat });
                              setEditingCatId(null);
                              setEditingCat({});
                            }}
                          >
                            Kaydet
                          </button>
                          <button
                            className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                            onClick={() => {
                              setEditingCatId(null);
                              setEditingCat({});
                            }}
                          >
                            Vazgeç
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* New local category */}
              <div className="border rounded-lg p-3 bg-white space-y-2">
                <div className="text-sm font-medium">Yeni Kategori (Bu Şubeye Özel)</div>

                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="Başlık"
                  value={newCat.title}
                  onChange={(e) => setNewCat((p) => ({ ...p, title: e.target.value }))}
                />

                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="Açıklama (isteğe bağlı)"
                  value={newCat.description}
                  onChange={(e) => setNewCat((p) => ({ ...p, description: e.target.value }))}
                />

                <div className="flex flex-col w-32">
                  <label className="text-xs text-gray-500 mb-1">Menü sırası</label>
                  <input
                    type="number"
                    className="border rounded px-2 py-1 text-sm"
                    value={newCat.order}
                    onChange={(e) => setNewCat((p) => ({ ...p, order: Number(e.target.value) || 0 }))}
                  />
                </div>

                <button
                  className="w-full px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                  disabled={!newCat.title.trim()}
                  onClick={() => {
                    createCatMut.mutate(newCat);
                    setNewCat({ title: "", description: "", order: 0 });
                  }}
                >
                  Kategori Ekle
                </button>
              </div>

              {/* Closed categories */}
              <details className="border rounded-lg p-3 bg-gray-50">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  Kapalı Kategoriler (Bu Şubede) — {closedCards.length}
                </summary>

                <div className="mt-3 space-y-2">
                  {closedCards.length === 0 ? (
                    <div className="text-xs text-gray-500">
                      Bu şubede kapalı kategori yok. Eğer “kapat” yaptıktan sonra burada görünmüyorsa,
                      backend <code>menu/categories</code> endpoint’i kapalıları filtreliyor olabilir.
                    </div>
                  ) : (
                    closedCards.map((card) => {
                      const isSelected = card.key === selectedKey;
                      const badge = badgeForCategory(card.source);

                      return (
                        <div
                          key={card.key} // ✅ render key = selection key
                          className={`border rounded-lg p-3 bg-white transition ${
                            isSelected
                              ? "border-brand-600 bg-brand-50 shadow-sm"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <button className="w-full text-left" aria-selected={isSelected} onClick={() => setSelectedKey(card.key)}>
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{card.title}</div>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                                Kapalı
                              </span>
                              <span className={`text-[11px] px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                            </div>
                            {!!card.description && <div className="text-xs text-gray-500 mt-1">{card.description}</div>}
                            <div className="text-xs text-gray-400 mt-1">Sıra: {card.order}</div>
                          </button>

                          <div className="mt-2">
                            <button
                              className="px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                              onClick={() => {
                                const cid = card.local?._id;
                                if (!cid) return;
                                updateCatMut.mutate({ cid: String(cid), payload: { isActive: true } });
                              }}
                            >
                              Aç
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </details>
            </div>
          </Card>

          {/* ---------- Right: Items ---------- */}
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={
                selectedCard ? `Ürünler — ${selectedCard.title}${selectedIsClosed ? " (Kapalı)" : ""}` : "Ürünler"
              }
            >
              {!selectedCard && <div className="text-sm text-gray-500">Soldan bir kategori seç.</div>}

              {selectedCard && (
                <div className="space-y-3">
                  {/* Closed category banner */}
                  {selectedIsClosed && (
                    <div className="border rounded-lg p-3 bg-gray-50 text-gray-800">
                      <div className="font-medium">Bu kategori şu anda kapalı.</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Ürün eklemek veya düzenlemek için önce kategoriyi açmalısın.
                      </div>

                      <div className="mt-2">
                        <button
                          className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                          disabled={!selectedLocalCatId}
                          onClick={() => {
                            if (!selectedLocalCatId) return;
                            updateCatMut.mutate({ cid: String(selectedLocalCatId), payload: { isActive: true } });
                          }}
                        >
                          Kategoriyi Aç
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Org resolved selected but no editable local record yet */}
                  {selectedResolved?.source === "org" && !selectedLocalCatId && (
                    <div className="border rounded-lg p-3 bg-amber-50 text-amber-900">
                      Bu kategori <b>Merkez Menü</b>den geliyor. Şubeye özel fiyat / stok / görünürlük için önce{" "}
                      <b>Düzenlemeyi Başlat</b> kullan.
                      <div className="mt-2">
                        <button
                          className="px-3 py-1.5 text-sm rounded bg-amber-100 hover:bg-amber-200"
                          onClick={async () => {
                            if (!selectedResolved) return;
                            await ensureEditableCategoryForOrg(selectedResolved);
                            refreshAll();
                          }}
                        >
                          Düzenlemeyi Başlat
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Items list: prefer resolved if exists, otherwise show local items */}
                  <div className="space-y-2">
                    {selectedResolved ? (
                      sortByOrder(selectedResolved.items || []).map((it) => {
                        const src: ResolvedSource = (it.source ?? "local") as ResolvedSource;
                        const badge = badgeForItem(src);

                        // org item => branch edit record may exist among localItems via orgItemId match
                        const localEdited =
                          src === "org"
                            ? localItems.find((li) => String(li.orgItemId || "") === String(it._id)) || null
                            : null;

                        const canEditThisRow = !opsDisabled && (src !== "org" || !!localEdited);

                        const rowKey = resolvedItemKey(it);
                        const isEditing = editingItemId === (localEdited?._id || it._id);

                        return (
                          <div key={rowKey} className="border rounded-lg p-3">
                            {!isEditing ? (
                              <div className="grid grid-cols-1 md:grid-cols-8 gap-3 items-start">
                                <div className="md:col-span-3">
                                  <div className="flex items-center gap-2">
                                    <div className="font-medium">{it.title}</div>
                                    <span className={`text-[11px] px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                                  </div>

                                  {!!it.description && <div className="text-xs text-gray-500 mt-1">{it.description}</div>}

                                  <div className="text-xs text-gray-400 mt-1">
                                    sıra: {it.order ?? 0} • {it.isActive === false ? "kapalı" : "açık"} •{" "}
                                    {it.isAvailable === false ? "stok yok" : "serviste"}
                                  </div>
                                </div>

                                <div className="md:col-span-2 text-sm">
                                  Fiyat: <b>{money(it.price)} ₺</b>
                                  {!!it.tags?.length && <div className="text-xs text-gray-500 mt-1">#{it.tags.join(" #")}</div>}
                                </div>

                                <div className="md:col-span-1">
                                  {it.photoUrl ? (
                                    <img src={it.photoUrl} className="w-28 h-20 object-cover rounded border" alt="" />
                                  ) : (
                                    <div className="w-28 h-20 rounded border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                      Foto yok
                                    </div>
                                  )}
                                </div>

                                <div className="md:col-span-2 flex gap-2 flex-wrap">
                                  {/* Org item: only “Düzenlemeyi Başlat” to create branch record */}
                                  {src === "org" && !localEdited && (
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                                      disabled={!selectedLocalCatId || opsDisabled}
                                      title={
                                        opsDisabled
                                          ? "Kategori kapalıyken işlem yapılamaz"
                                          : !selectedLocalCatId
                                          ? "Önce kategoride ‘Düzenlemeyi Başlat’ yap"
                                          : "Bu ürüne şube ayarlarını aç"
                                      }
                                      onClick={() => {
                                        if (!selectedLocalCatId || opsDisabled) return;
                                        createItemMut.mutate({
                                          categoryId: selectedLocalCatId,
                                          orgItemId: it._id,
                                          title: it.title,
                                          description: it.description ?? "",
                                          price: it.price,
                                          tags: it.tags ?? [],
                                          order: it.order ?? 0,
                                          isAvailable: it.isAvailable !== false,
                                        });
                                      }}
                                    >
                                      Düzenlemeyi Başlat
                                    </button>
                                  )}

                                  {/* Edit: for local/override OR for org that already has localEdited */}
                                  {(src !== "org" || !!localEdited) && (
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                      disabled={!canEditThisRow}
                                      onClick={() => {
                                        if (!canEditThisRow) return;
                                        const base = localEdited ?? (it as any);
                                        setEditingItemId(String(base._id));
                                        setEditingItem({
                                          title: base.title,
                                          description: base.description ?? "",
                                          price: base.price,
                                          tagsText: (base.tags ?? []).join(", "),
                                          order: base.order ?? 0,
                                          isAvailable: base.isAvailable !== false,
                                          isActive: base.isActive !== false,
                                        });
                                        setEditingItemPhoto(null);
                                      }}
                                    >
                                      Ürünü Düzenle
                                    </button>
                                  )}

                                  {/* Branch “kapat” for org item: create/edit local record then set isActive false */}
                                  {src === "org" && (
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                      disabled={!selectedLocalCatId || opsDisabled}
                                      onClick={() => {
                                        if (!selectedLocalCatId || opsDisabled) return;

                                        if (localEdited?._id) {
                                          updateItemMut.mutate({ iid: String(localEdited._id), isActive: false });
                                          return;
                                        }

                                        // create branch record then deactivate
                                        createItemMut.mutate(
                                          {
                                            categoryId: selectedLocalCatId,
                                            orgItemId: it._id,
                                            title: it.title,
                                            description: it.description ?? "",
                                            price: it.price,
                                            tags: it.tags ?? [],
                                            order: it.order ?? 0,
                                            isAvailable: it.isAvailable !== false,
                                          } as any,
                                          {
                                            onSuccess: (res: any) => {
                                              const id = res?._id || res?.item?._id;
                                              if (id) updateItemMut.mutate({ iid: String(id), isActive: false });
                                            },
                                          } as any
                                        );
                                      }}
                                    >
                                      Bu şubede kapat
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <div className="flex flex-col">
                                    <label className="text-xs text-gray-500 mb-1">Ürün adı</label>
                                    <input
                                      className="border rounded px-2 py-1 text-sm disabled:opacity-60"
                                      disabled={opsDisabled}
                                      value={editingItem.title ?? ""}
                                      onChange={(e) => setEditingItem((p: any) => ({ ...p, title: e.target.value }))}
                                    />
                                  </div>

                                  <div className="flex flex-col">
                                    <label className="text-xs text-gray-500 mb-1">Fiyat (₺)</label>
                                    <input
                                      type="number"
                                      className="border rounded px-2 py-1 text-sm disabled:opacity-60"
                                      disabled={opsDisabled}
                                      value={editingItem.price ?? 0}
                                      onChange={(e) => setEditingItem((p: any) => ({ ...p, price: Number(e.target.value) || 0 }))}
                                    />
                                  </div>
                                </div>

                                <input
                                  className="w-full border rounded px-2 py-1 text-sm disabled:opacity-60"
                                  disabled={opsDisabled}
                                  value={editingItem.description ?? ""}
                                  placeholder="Açıklama (isteğe bağlı)"
                                  onChange={(e) => setEditingItem((p: any) => ({ ...p, description: e.target.value }))}
                                />

                                <input
                                  className="w-full border rounded px-2 py-1 text-sm disabled:opacity-60"
                                  disabled={opsDisabled}
                                  value={editingItem.tagsText ?? ""}
                                  placeholder="Etiketler (virgülle) — örn: acı, vegan"
                                  onChange={(e) => setEditingItem((p: any) => ({ ...p, tagsText: e.target.value }))}
                                />

                                <div className="flex gap-3 items-center">
                                  <div className="flex flex-col">
                                    <label className="text-xs text-gray-500 mb-1">Sıra</label>
                                    <input
                                      type="number"
                                      className="w-28 border rounded px-2 py-1 text-sm disabled:opacity-60"
                                      disabled={opsDisabled}
                                      value={editingItem.order ?? 0}
                                      onChange={(e) =>
                                        setEditingItem((p: any) => ({ ...p, order: Number(e.target.value) || 0 }))
                                      }
                                    />
                                  </div>

                                  <label className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      disabled={opsDisabled}
                                      checked={editingItem.isAvailable ?? true}
                                      onChange={(e) => setEditingItem((p: any) => ({ ...p, isAvailable: e.target.checked }))}
                                    />
                                    Serviste
                                  </label>

                                  <label className="flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      disabled={opsDisabled}
                                      checked={editingItem.isActive ?? true}
                                      onChange={(e) => setEditingItem((p: any) => ({ ...p, isActive: e.target.checked }))}
                                    />
                                    Menüde görünsün
                                  </label>
                                </div>

                                <div className="space-y-1">
                                  <label className="text-sm text-gray-600">Fotoğraf (isteğe bağlı)</label>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    disabled={opsDisabled}
                                    onChange={(e) => setEditingItemPhoto(e.target.files?.[0] ?? null)}
                                  />
                                  <label className="flex items-center gap-2 text-sm mt-1">
                                    <input
                                      type="checkbox"
                                      disabled={opsDisabled}
                                      onChange={(e) => setEditingItem((p: any) => ({ ...p, removePhoto: e.target.checked }))}
                                    />
                                    Fotoğrafı kaldır
                                  </label>
                                </div>

                                <div className="flex gap-2 pt-1">
                                  <button
                                    className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                                    disabled={opsDisabled}
                                    onClick={() => {
                                      if (opsDisabled) return;
                                      updateItemMut.mutate({
                                        iid: String(editingItemId),
                                        title: editingItem.title,
                                        description: editingItem.description,
                                        price: editingItem.price,
                                        tags: String(editingItem.tagsText || "")
                                          .split(",")
                                          .map((x: string) => x.trim())
                                          .filter(Boolean),
                                        order: editingItem.order,
                                        isAvailable: editingItem.isAvailable,
                                        isActive: editingItem.isActive,
                                        removePhoto: editingItem.removePhoto,
                                        photoFile: editingItemPhoto,
                                      });
                                      setEditingItemId(null);
                                      setEditingItem({});
                                      setEditingItemPhoto(null);
                                    }}
                                  >
                                    Kaydet
                                  </button>

                                  <button
                                    className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                    onClick={() => {
                                      setEditingItemId(null);
                                      setEditingItem({});
                                      setEditingItemPhoto(null);
                                    }}
                                  >
                                    Vazgeç
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      // no resolved category: show local items list (for closed local categories etc.)
                      <div className="text-sm text-gray-500">
                        Bu kategori resolved listede görünmüyor. (Muhtemelen kapalı.) Ürün işlemleri için kategoriyi aç.
                      </div>
                    )}
                  </div>

                  {/* New local item (only if editable local category exists) */}
                  <div className="border rounded-lg p-3 bg-white space-y-2">
                    <div className="text-sm font-medium">Yeni Ürün (Bu Şubeye Özel)</div>

                    <div className="text-xs text-gray-500">
                      Ürün eklemek için kategori <b>açık</b> olmalı. Eğer kategori <b>Merkez Menü</b> ise önce{" "}
                      <b>Düzenlemeyi Başlat</b> yap.
                    </div>

                    <input
                      className="w-full border rounded px-2 py-1 text-sm disabled:opacity-60"
                      disabled={opsDisabled}
                      placeholder="Ürün adı"
                      value={newItem.title}
                      onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                    />

                    <input
                      className="w-full border rounded px-2 py-1 text-sm disabled:opacity-60"
                      disabled={opsDisabled}
                      placeholder="Açıklama (isteğe bağlı)"
                      value={newItem.description}
                      onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Fiyat (₺)</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 text-sm disabled:opacity-60"
                          disabled={opsDisabled}
                          value={newItem.price}
                          onChange={(e) => setNewItem((p) => ({ ...p, price: Number(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Sıra</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 text-sm disabled:opacity-60"
                          disabled={opsDisabled}
                          value={newItem.order}
                          onChange={(e) => setNewItem((p) => ({ ...p, order: Number(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Etiketler</label>
                        <input
                          className="border rounded px-2 py-1 text-sm disabled:opacity-60"
                          disabled={opsDisabled}
                          value={newItem.tagsText}
                          onChange={(e) => setNewItem((p) => ({ ...p, tagsText: e.target.value }))}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={opsDisabled}
                        checked={newItem.isAvailable}
                        onChange={(e) => setNewItem((p) => ({ ...p, isAvailable: e.target.checked }))}
                      />
                      Serviste
                    </label>

                    <div className="space-y-1">
                      <label className="text-sm text-gray-600">Fotoğraf (isteğe bağlı)</label>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={opsDisabled}
                        onChange={(e) => setNewItem((p) => ({ ...p, photoFile: e.target.files?.[0] ?? null }))}
                      />
                    </div>

                    <button
                      className="w-full px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                      disabled={opsDisabled || !newItem.title.trim() || !selectedLocalCatId}
                      onClick={() => {
                        if (!selectedLocalCatId || opsDisabled) return;

                        createItemMut.mutate({
                          categoryId: selectedLocalCatId,
                          title: newItem.title,
                          description: newItem.description,
                          price: newItem.price,
                          tags: String(newItem.tagsText || "")
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean),
                          order: newItem.order,
                          isAvailable: newItem.isAvailable,
                          photoFile: newItem.photoFile,
                        });

                        setNewItem({
                          title: "",
                          description: "",
                          price: 0,
                          tagsText: "",
                          order: 0,
                          isAvailable: true,
                          photoFile: null,
                        });
                      }}
                    >
                      Ürün Ekle
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* =======================
          PREVIEW
      ======================= */}
      {mode === "preview" && (
        <div className="space-y-4">
          <Card title="Müşteri Görünümü (Menü Önizleme)">
            <div className="text-xs text-gray-500 mb-3">
              Bu ekran sadece kontrol içindir. Veri: <code>GET /panel/restaurants/:rid/menu/resolved</code>
            </div>

            {!resolvedQ.data?.categories?.length && <div className="text-sm text-gray-500">Menü boş görünüyor.</div>}

            <div className="space-y-4">
              {sortByOrder(resolvedQ.data?.categories ?? []).map((c) => {
                const src: ResolvedSource = (c.source ?? "local") as ResolvedSource;
                const badge = badgeForCategory(src);

                return (
                  <div key={resolvedCategoryKey(c)} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          <span>{c.title}</span>

                          {c.isActive === false && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">Kapalı</span>
                          )}

                          <span className={`text-[11px] px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                        </div>

                        {!!c.description && <div className="text-sm text-gray-600 mt-1">{c.description}</div>}
                        <div className="text-xs text-gray-400 mt-1">Sıra: {c.order ?? 0}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {sortByOrder(c.items ?? []).map((it) => {
                        const isrc: ResolvedSource = (it.source ?? "local") as ResolvedSource;
                        const ib = badgeForItem(isrc);

                        return (
                          <div key={resolvedItemKey(it)} className="border rounded-lg p-3 flex gap-3">
                            <div className="w-24 shrink-0">
                              {it.photoUrl ? (
                                <img
                                  src={it.photoUrl}
                                  className="w-24 h-16 object-cover rounded border"
                                  alt={it.title}
                                />
                              ) : (
                                <div className="w-24 h-16 rounded border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                  Foto yok
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium truncate">{it.title}</div>
                                <div className="text-sm font-semibold whitespace-nowrap">{money(it.price)} ₺</div>
                              </div>

                              {!!it.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{it.description}</div>}

                              <div className="mt-2 flex flex-wrap gap-2 items-center">
                                {it.isActive === false && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">Kapalı</span>
                                )}
                                {it.isAvailable === false && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                                    Stok yok
                                  </span>
                                )}
                                <span className={`text-[11px] px-2 py-0.5 rounded ${ib.cls}`}>{ib.text}</span>
                                {!!it.tags?.length && (
                                  <span className="text-[11px] text-gray-500 truncate">#{it.tags.join(" #")}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {(!c.items || c.items.length === 0) && <div className="text-sm text-gray-500">Bu kategoride ürün yok.</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}