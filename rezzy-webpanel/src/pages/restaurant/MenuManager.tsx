import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authStore } from "../../store/auth";
import {
  restaurantListCategories,
  restaurantCreateCategory,
  restaurantUpdateCategory,
  restaurantDeleteCategory,
  restaurantListItems,
  restaurantCreateItem,
  restaurantUpdateItem,
  restaurantDeleteItem,
  restaurantGetResolvedMenu,
} from "../../api/client";
import { Card } from "../../components/Card";

type Category = {
  _id: string;
  title: string;
  description?: string;
  order: number;
  isActive: boolean;

  // ✅ backend destekliyorsa: org category ile bağlantı
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

  // ✅ backend destekliyorsa: org item ile bağlantı
  orgItemId?: string | null;
};

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
  source?: "org" | "override" | "local";
};

type ResolvedMenuCategory = {
  _id: string;
  title: string;
  description?: string | null;
  order?: number;
  isActive?: boolean;
  items: ResolvedMenuItem[];

  orgCategoryId?: string | null;
  source?: "org" | "override" | "local";
};

type ResolvedMenuResponse = {
  categories: ResolvedMenuCategory[];
  organizationId?: string | null;
  restaurantId?: string;
};

function sortByOrder<T extends { order?: number }>(arr: T[]) {
  return (arr || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export default function MenuManagerPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();
  const [mode, setMode] = React.useState<"manage" | "preview">("manage");

  // ---------- Local Categories (restaurant categories collection) ----------
  const catQ = useQuery({
    queryKey: ["menu-categories", rid],
    queryFn: () => restaurantListCategories(rid),
    enabled: !!rid,
  });

  // ---------- Resolved Menu (org + override + local) ----------
  const resolvedQ = useQuery({
    queryKey: ["menu-resolved", rid],
    queryFn: () => restaurantGetResolvedMenu(rid) as Promise<ResolvedMenuResponse>,
    enabled: !!rid,
  });

  const localCats: Category[] = catQ.data ?? [];
  const resolvedCats: ResolvedMenuCategory[] = sortByOrder(
    resolvedQ.data?.categories ?? []
  );

  // UI: selected "resolved category id"
  const [selectedResolvedCatId, setSelectedResolvedCatId] = React.useState<string | null>(
    null
  );

  // UI: selected local category id (for create/edit local items)
  const [selectedLocalCatId, setSelectedLocalCatId] = React.useState<string | null>(
    null
  );

  // Seçili kategori stabil kalsın / silinirse ilkine dönsün / liste boşsa null olsun
  React.useEffect(() => {
    const list = resolvedCats || [];
    if (!list.length) {
      if (selectedResolvedCatId) setSelectedResolvedCatId(null);
      return;
    }
    if (!selectedResolvedCatId || !list.find((c) => c._id === selectedResolvedCatId)) {
      setSelectedResolvedCatId(list[0]._id);
    }
  }, [resolvedCats, selectedResolvedCatId]);

  const selectedResolvedCat =
    resolvedCats.find((c) => c._id === selectedResolvedCatId) || null;

  // Resolved category -> local category id resolve
  React.useEffect(() => {
    if (!selectedResolvedCat) {
      setSelectedLocalCatId(null);
      return;
    }

    // local/override ise zaten local collection’dadır ve id aynıdır
    if (selectedResolvedCat.source !== "org") {
      setSelectedLocalCatId(selectedResolvedCat._id);
      return;
    }

    // org ise: localCats içinde orgCategoryId ile eşleşen override kategori var mı?
    const match = localCats.find((lc) => String(lc.orgCategoryId || "") === selectedResolvedCat._id);
    setSelectedLocalCatId(match?._id ?? null);
  }, [selectedResolvedCatId, localCats, resolvedCats]);

  // ---------- Mutations: Categories ----------
  const createCatMut = useMutation({
    mutationFn: (payload: { title: string; description?: string; order?: number; orgCategoryId?: string }) =>
      restaurantCreateCategory(rid, payload as any),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
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

  const deleteCatMut = useMutation({
    mutationFn: (cid: string) => restaurantDeleteCategory(rid, cid),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-items", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    },
  });

  // ---------- Items (local items list for selected local category) ----------
  const itemsQ = useQuery({
    queryKey: ["menu-items", rid, selectedLocalCatId],
    queryFn: () =>
      restaurantListItems(rid, selectedLocalCatId ? { categoryId: selectedLocalCatId } : {}),
    enabled: !!rid && !!selectedLocalCatId,
  });

  const localItems: Item[] = itemsQ.data ?? [];

  // ---------- Mutations: Items ----------
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

      // ✅ org item override için
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
      categoryId?: string;
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

  // ---------- UI State ----------
  const [newCat, setNewCat] = React.useState({
    title: "",
    description: "",
    order: 0,
  });

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

  // ---------- Helpers ----------
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
    qc.invalidateQueries({ queryKey: ["menu-items", rid] });
    qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
  };

  const ensureOverrideCategoryForSelectedOrg = async () => {
    if (!selectedResolvedCat) return null;
    if (selectedResolvedCat.source !== "org") return selectedResolvedCat._id;

    const existing = localCats.find(
      (c) => String(c.orgCategoryId || "") === selectedResolvedCat._id
    );
    if (existing) return existing._id;

    // org category override oluştur (local category)
    const payload: any = {
      title: selectedResolvedCat.title,
      description: selectedResolvedCat.description ?? "",
      order: selectedResolvedCat.order ?? 0,
      orgCategoryId: selectedResolvedCat._id,
    };

    // createCatMut async kontrol (mutateAsync yoksa manual promise)
    return await new Promise<string | null>((resolve) => {
      createCatMut.mutate(payload, {
        onSuccess: (res: any) => {
          // backend response şekli değişken olabilir, id yoksa refresh sonrası effect bulacak
          const id = res?._id || res?.category?._id || null;
          refreshAll();
          resolve(id);
        },
        onError: () => resolve(null),
      });
    });
  };

  const findLocalOverrideItemByOrgItemId = (orgItemId: string) => {
    return localItems.find((li) => String(li.orgItemId || "") === orgItemId) || null;
  };

  const canEditResolvedItem = (it: ResolvedMenuItem) => it.source !== "org";

  // ---------- Loading / error ----------
  const loadingManage = mode === "manage" && (catQ.isLoading || resolvedQ.isLoading);
  const loadingPreview = mode === "preview" && resolvedQ.isLoading;

  const anyError = catQ.isError || resolvedQ.isError || itemsQ.isError;

  return (
    <div className="flex-1 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Menü Yönetimi</h2>
          <div className="text-xs text-gray-500">
            “Panel Menüsü” artık restoranın gerçek menüsünü gösterir: Org menü + override + local.
            Org ürünlerde fiyat override edebilirsin, ayrıca yeni kategori/ürün ekleyebilirsin.
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
            Panel Menüsü
          </button>

          <button
            className={`px-3 py-1.5 text-sm rounded border ${
              mode === "preview"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
            onClick={() => setMode("preview")}
          >
            Resolved Önizleme
          </button>

          <button
            className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
            onClick={refreshAll}
          >
            Yenile
          </button>
        </div>
      </div>

      {!rid && (
        <div className="text-sm text-red-600">
          RestaurantId bulunamadı. Oturum / authStore akışını kontrol et.
        </div>
      )}

      {(loadingManage || loadingPreview) && (
        <div className="text-sm text-gray-500">Yükleniyor…</div>
      )}

      {anyError && (
        <div className="text-sm text-red-600">
          Menü verisi alınırken hata oluştu. Network/Yetki veya endpointleri kontrol et.
        </div>
      )}

      {/* =========================
          MANAGE MODE (ANA EKRAN)
         ========================= */}
      {mode === "manage" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ---------- Categories Column (RESOLVED) ---------- */}
          <Card title="Kategoriler (Org + Override + Local)">
            <div className="space-y-3">
              {resolvedCats.map((c) => {
                const isSelected = c._id === selectedResolvedCatId;

                const localCat =
                  c.source === "org"
                    ? localCats.find((lc) => String(lc.orgCategoryId || "") === c._id) || null
                    : localCats.find((lc) => lc._id === c._id) || null;

                const isEditing = !!localCat && localCat._id === editingCatId;

                return (
                  <div
                    key={c._id}
                    className={`border rounded-lg p-3 ${
                      isSelected ? "border-brand-600 bg-brand-50" : "border-gray-200"
                    }`}
                  >
                    {!isEditing ? (
                      <>
                        <button
                          className="w-full text-left"
                          onClick={() => setSelectedResolvedCatId(c._id)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{c.title}</div>
                            {c.source && (
                              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                {c.source}
                              </span>
                            )}
                          </div>

                          {!!c.description && (
                            <div className="text-xs text-gray-500 mt-1">{c.description}</div>
                          )}

                          <div className="text-xs text-gray-400 mt-1">
                            Sıra: {c.order ?? 0} • {c.isActive === false ? "Pasif" : "Aktif"}
                            {c.source === "org" && !localCat ? " • Override yok" : ""}
                          </div>
                        </button>

                        <div className="flex gap-2 mt-2 flex-wrap">
                          {/* Org category ise: override aç / override düzenle */}
                          {c.source === "org" && !localCat && (
                            <button
                              className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-800 hover:bg-amber-100"
                              onClick={async () => {
                                const id = await ensureOverrideCategoryForSelectedOrg();
                                if (id) {
                                  setSelectedResolvedCatId(c._id);
                                  refreshAll();
                                }
                              }}
                            >
                              Bu kategori için override aç
                            </button>
                          )}

                          {localCat && (
                            <button
                              className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                              onClick={() => {
                                setEditingCatId(localCat._id);
                                setEditingCat({
                                  title: localCat.title,
                                  description: localCat.description || "",
                                  order: localCat.order,
                                  isActive: localCat.isActive,
                                });
                              }}
                            >
                              Düzenle
                            </button>
                          )}

                          {/* Sadece local/override kategoriler silinebilir */}
                          {localCat && c.source !== "org" && (
                            <button
                              className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                              onClick={() => {
                                if (confirm(`"${localCat.title}" silinsin mi?`)) {
                                  deleteCatMut.mutate(localCat._id);
                                }
                              }}
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editingCat.title ?? ""}
                          placeholder="Kategori adı"
                          onChange={(e) =>
                            setEditingCat((p) => ({ ...p, title: e.target.value }))
                          }
                        />
                        <input
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={editingCat.description ?? ""}
                          placeholder="Açıklama"
                          onChange={(e) =>
                            setEditingCat((p) => ({ ...p, description: e.target.value }))
                          }
                        />

                        <div className="flex gap-2 items-center">
                          <div className="flex flex-col">
                            <label className="text-xs text-gray-500 mb-1">
                              Sıra (menüde görünme)
                            </label>
                            <input
                              type="number"
                              className="w-28 border rounded px-2 py-1 text-sm"
                              value={editingCat.order ?? 0}
                              onChange={(e) =>
                                setEditingCat((p) => ({
                                  ...p,
                                  order: Number(e.target.value) || 0,
                                }))
                              }
                            />
                          </div>

                          <label className="flex items-center gap-2 text-sm mt-5">
                            <input
                              type="checkbox"
                              checked={editingCat.isActive ?? true}
                              onChange={(e) =>
                                setEditingCat((p) => ({ ...p, isActive: e.target.checked }))
                              }
                            />
                            Aktif
                          </label>
                        </div>

                        <div className="flex gap-2">
                          <button
                            className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                            onClick={() => {
                              updateCatMut.mutate({
                                cid: localCat._id,
                                payload: editingCat,
                              });
                              setEditingCatId(null);
                            }}
                          >
                            Kaydet
                          </button>
                          <button
                            className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                            onClick={() => setEditingCatId(null)}
                          >
                            Vazgeç
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* New Category (LOCAL) */}
              <div className="border rounded-lg p-3 bg-white space-y-2">
                <div className="text-sm font-medium">Yeni Kategori (Local)</div>
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="Başlık"
                  value={newCat.title}
                  onChange={(e) => setNewCat((p) => ({ ...p, title: e.target.value }))}
                />
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder="Açıklama"
                  value={newCat.description}
                  onChange={(e) => setNewCat((p) => ({ ...p, description: e.target.value }))}
                />
                <div className="flex flex-col w-32">
                  <label className="text-xs text-gray-500 mb-1">Sıra (menüde görünme)</label>
                  <input
                    type="number"
                    className="border rounded px-2 py-1 text-sm"
                    placeholder="Örn: 10"
                    value={newCat.order}
                    onChange={(e) =>
                      setNewCat((p) => ({ ...p, order: Number(e.target.value) || 0 }))
                    }
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
            </div>
          </Card>

          {/* ---------- Items Column (RESOLVED category items + local edit) ---------- */}
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={
                selectedResolvedCat
                  ? `Ürünler — ${selectedResolvedCat.title}`
                  : "Ürünler"
              }
            >
              {!selectedResolvedCat && (
                <div className="text-sm text-gray-500">Sol taraftan bir kategori seç.</div>
              )}

              {selectedResolvedCat && (
                <div className="space-y-3">
                  {/* If org category and no local override category -> info */}
                  {selectedResolvedCat.source === "org" && !selectedLocalCatId && (
                    <div className="border rounded-lg p-3 bg-amber-50 text-amber-900">
                      Bu kategori organizasyon menüsünden geliyor. Bu kategori altına ürün eklemek veya
                      org ürünlerine fiyat override vermek için önce{" "}
                      <b>“Bu kategori için override aç”</b> yapmalısın.
                    </div>
                  )}

                  {/* RESOLVED ITEMS LIST (the real menu) */}
                  {sortByOrder(selectedResolvedCat.items || []).map((it) => {
                    const isEditing = it._id === editingItemId;

                    // org item için local override var mı?
                    const localOverride =
                      it.source === "org" && it._id
                        ? findLocalOverrideItemByOrgItemId(it._id)
                        : null;

                    const canEdit = canEditResolvedItem(it);

                    return (
                      <div key={it._id} className="border rounded-lg p-3">
                        {!isEditing ? (
                          <div className="grid grid-cols-1 md:grid-cols-8 gap-3 items-start">
                            <div className="md:col-span-3">
                              <div className="flex items-center gap-2">
                                <div className="font-medium">{it.title}</div>
                                {it.source && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                    {it.source}
                                  </span>
                                )}
                              </div>

                              {!!it.description && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {it.description}
                                </div>
                              )}

                              <div className="text-xs text-gray-400 mt-1">
                                sıra: {it.order ?? 0} •{" "}
                                {it.isActive === false ? "pasif" : "aktif"} •{" "}
                                {it.isAvailable === false ? "stok yok" : "serviste"}
                              </div>
                            </div>

                            <div className="md:col-span-2 text-sm">
                              Fiyat: <b>{it.price} ₺</b>
                              {!!it.tags?.length && (
                                <div className="text-xs text-gray-500 mt-1">
                                  #{it.tags.join(" #")}
                                </div>
                              )}
                            </div>

                            <div className="md:col-span-1">
                              {it.photoUrl ? (
                                <img
                                  src={it.photoUrl}
                                  className="w-28 h-20 object-cover rounded border"
                                />
                              ) : (
                                <div className="w-28 h-20 rounded border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                  Foto yok
                                </div>
                              )}
                            </div>

                            <div className="md:col-span-2 flex gap-2 flex-wrap">
                              {/* Org item override flow */}
                              {it.source === "org" && (
                                <>
                                  <button
                                    className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                                    disabled={!selectedLocalCatId || !!localOverride}
                                    title={
                                      !selectedLocalCatId
                                        ? "Önce kategori override aç"
                                        : localOverride
                                        ? "Override zaten var"
                                        : "Override oluştur"
                                    }
                                    onClick={() => {
                                      if (!selectedLocalCatId) return;

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
                                    {localOverride ? "Override var" : "Override oluştur"}
                                  </button>

                                  {localOverride && (
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                      onClick={() => {
                                        // override item’i düzenlemek için edit aç
                                        setEditingItemId(localOverride._id);
                                        setEditingItem({
                                          title: localOverride.title,
                                          description: localOverride.description ?? "",
                                          price: localOverride.price,
                                          tagsText: (localOverride.tags ?? []).join(", "),
                                          order: localOverride.order,
                                          isAvailable: localOverride.isAvailable,
                                          isActive: localOverride.isActive,
                                        });
                                        setEditingItemPhoto(null);
                                      }}
                                    >
                                      Override düzenle
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Override/local items edit/delete */}
                              {canEdit && (
                                <>
                                  <button
                                    className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                    onClick={() => {
                                      // resolved item _id = local/override item id
                                      setEditingItemId(it._id);
                                      setEditingItem({
                                        title: it.title,
                                        description: it.description ?? "",
                                        price: it.price,
                                        tagsText: (it.tags ?? []).join(", "),
                                        order: it.order ?? 0,
                                        isAvailable: it.isAvailable !== false,
                                        isActive: it.isActive !== false,
                                      });
                                      setEditingItemPhoto(null);
                                    }}
                                  >
                                    Düzenle
                                  </button>

                                  <button
                                    className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                                    onClick={() => {
                                      if (confirm(`"${it.title}" silinsin mi?`)) {
                                        deleteItemMut.mutate(it._id);
                                      }
                                    }}
                                  >
                                    Sil
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div className="flex flex-col">
                                <label className="text-xs text-gray-500 mb-1">Ürün adı</label>
                                <input
                                  className="border rounded px-2 py-1 text-sm"
                                  value={editingItem.title ?? ""}
                                  placeholder="Örn: Levrek Izgara"
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({
                                      ...p,
                                      title: e.target.value,
                                    }))
                                  }
                                />
                              </div>

                              <div className="flex flex-col">
                                <label className="text-xs text-gray-500 mb-1">Fiyat (₺)</label>
                                <input
                                  type="number"
                                  className="border rounded px-2 py-1 text-sm"
                                  value={editingItem.price ?? 0}
                                  placeholder="Örn: 450"
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({
                                      ...p,
                                      price: Number(e.target.value) || 0,
                                    }))
                                  }
                                />
                              </div>
                            </div>

                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editingItem.description ?? ""}
                              placeholder="Açıklama"
                              onChange={(e) =>
                                setEditingItem((p: any) => ({
                                  ...p,
                                  description: e.target.value,
                                }))
                              }
                            />

                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editingItem.tagsText ?? ""}
                              placeholder="Etiketler (virgülle) örn: acı, vegan"
                              onChange={(e) =>
                                setEditingItem((p: any) => ({
                                  ...p,
                                  tagsText: e.target.value,
                                }))
                              }
                            />

                            <div className="flex gap-3 items-center">
                              <div className="flex flex-col">
                                <label className="text-xs text-gray-500 mb-1">
                                  Sıra (bu kategoride)
                                </label>
                                <input
                                  type="number"
                                  className="w-28 border rounded px-2 py-1 text-sm"
                                  value={editingItem.order ?? 0}
                                  placeholder="Örn: 1"
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({
                                      ...p,
                                      order: Number(e.target.value) || 0,
                                    }))
                                  }
                                />
                              </div>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={editingItem.isAvailable ?? true}
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({
                                      ...p,
                                      isAvailable: e.target.checked,
                                    }))
                                  }
                                />
                                Serviste
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={editingItem.isActive ?? true}
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({
                                      ...p,
                                      isActive: e.target.checked,
                                    }))
                                  }
                                />
                                Aktif
                              </label>
                            </div>

                            <div className="space-y-1">
                              <label className="text-sm text-gray-600">Fotoğraf (opsiyonel)</label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  setEditingItemPhoto(e.target.files?.[0] ?? null)
                                }
                              />
                              {/* photo kaldırma: sadece local/override item’larda mantıklı */}
                              <label className="flex items-center gap-2 text-sm mt-1">
                                <input
                                  type="checkbox"
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({
                                      ...p,
                                      removePhoto: e.target.checked,
                                    }))
                                  }
                                />
                                Fotoğrafı kaldır
                              </label>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                                onClick={() => {
                                  updateItemMut.mutate({
                                    iid: it._id,
                                    // categoryId: burada gerekli değil (backend istemiyorsa)
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
                                }}
                              >
                                Kaydet
                              </button>
                              <button
                                className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                onClick={() => {
                                  setEditingItemId(null);
                                  setEditingItem({});
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

                  {/* NEW LOCAL ITEM (requires local category) */}
                  <div className="border rounded-lg p-3 bg-white space-y-2">
                    <div className="text-sm font-medium">Yeni Ürün (Local)</div>

                    <div className="text-xs text-gray-500">
                      Ürün eklemek için seçili kategorinin local/override kategorisi olmalı.
                    </div>

                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Ürün adı"
                      value={newItem.title}
                      onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                    />
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Açıklama"
                      value={newItem.description}
                      onChange={(e) =>
                        setNewItem((p) => ({ ...p, description: e.target.value }))
                      }
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Fiyat (₺)</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 text-sm"
                          placeholder="Örn: 350"
                          value={newItem.price}
                          onChange={(e) =>
                            setNewItem((p) => ({
                              ...p,
                              price: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Sıra (bu kategoride)</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 text-sm"
                          placeholder="Örn: 1"
                          value={newItem.order}
                          onChange={(e) =>
                            setNewItem((p) => ({ ...p, order: Number(e.target.value) || 0 }))
                          }
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Etiketler (virgülle)</label>
                        <input
                          className="border rounded px-2 py-1 text-sm"
                          placeholder="acı, vegan"
                          value={newItem.tagsText}
                          onChange={(e) =>
                            setNewItem((p) => ({ ...p, tagsText: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newItem.isAvailable}
                        onChange={(e) =>
                          setNewItem((p) => ({ ...p, isAvailable: e.target.checked }))
                        }
                      />
                      Serviste
                    </label>

                    <div className="space-y-1">
                      <label className="text-sm text-gray-600">Fotoğraf (opsiyonel)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setNewItem((p) => ({ ...p, photoFile: e.target.files?.[0] ?? null }))
                        }
                      />
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {selectedResolvedCat?.source === "org" && !selectedLocalCatId && (
                        <button
                          className="px-3 py-1.5 text-sm rounded bg-amber-50 text-amber-800 hover:bg-amber-100"
                          onClick={async () => {
                            const id = await ensureOverrideCategoryForSelectedOrg();
                            if (id) {
                              refreshAll();
                            }
                          }}
                        >
                          Önce kategori override aç
                        </button>
                      )}

                      <button
                        className="flex-1 min-w-[160px] px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                        disabled={!newItem.title.trim() || !selectedLocalCatId}
                        onClick={() => {
                          if (!selectedLocalCatId) return;

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
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* =========================
          PREVIEW MODE (AYNI KALSIN)
         ========================= */}
      {mode === "preview" && (
        <div className="space-y-4">
          <Card title="Resolved Menü (Org + Override + Lokal)">
            <div className="text-xs text-gray-500 mb-3">
              Bu görünüm sadece okuma amaçlıdır. Veri:{" "}
              <code>GET /panel/restaurants/:rid/menu/resolved</code>
            </div>

            {!resolvedQ.data?.categories?.length && (
              <div className="text-sm text-gray-500">Resolved menü boş görünüyor.</div>
            )}

            <div className="space-y-4">
              {(resolvedQ.data?.categories ?? [])
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((c) => (
                  <div key={c._id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold flex items-center gap-2">
                          <span>{c.title}</span>

                          {c.isActive === false && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                              Pasif
                            </span>
                          )}

                          {c.source && (
                            <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                              {c.source}
                            </span>
                          )}
                        </div>

                        {!!c.description && (
                          <div className="text-sm text-gray-600 mt-1">{c.description}</div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">Sıra: {c.order ?? 0}</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(c.items ?? [])
                        .slice()
                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                        .map((it) => (
                          <div key={it._id} className="border rounded-lg p-3 flex gap-3">
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
                                <div className="text-sm font-semibold whitespace-nowrap">
                                  {it.price} ₺
                                </div>
                              </div>

                              {!!it.description && (
                                <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                                  {it.description}
                                </div>
                              )}

                              <div className="mt-2 flex flex-wrap gap-2 items-center">
                                {it.isActive === false && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                    Pasif
                                  </span>
                                )}
                                {it.isAvailable === false && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                                    Stok yok
                                  </span>
                                )}
                                {it.source && (
                                  <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                                    {it.source}
                                  </span>
                                )}
                                {!!it.tags?.length && (
                                  <span className="text-[11px] text-gray-500 truncate">
                                    #{it.tags.join(" #")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                      {(!c.items || c.items.length === 0) && (
                        <div className="text-sm text-gray-500">Bu kategoride ürün yok.</div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}