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
  orgCategoryId?: string | null; // ilişki
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
  orgItemId?: string | null; // ilişki
};

// ✅ Backend service: source "org" | "org_override" | "local"
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

function sortByOrder<T extends { order?: number }>(arr: T[]) {
  return (arr || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function norm(s?: string | null) {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * ✅ orgCategoryId yoksa bile kopya üretmeyi azaltmak için heuristik:
 * - title aynı + order aynı (ve varsa description benzer) ilkini “düzenlenmiş” gibi kabul ederiz.
 */
function findOverrideCategoryForOrgHeuristic(localCats: Category[], orgCat: ResolvedMenuCategory) {
  const title = norm(orgCat.title);
  const ord = orgCat.order ?? 0;
  const desc = norm(orgCat.description);

  const candidates = localCats
    .filter((c) => norm(c.title) === title && (c.order ?? 0) === ord)
    .sort((a, b) => String(a._id).localeCompare(String(b._id)));

  if (!candidates.length) return null;
  if (!desc) return candidates[0];

  const withDesc = candidates.find((c) => norm(c.description) === desc);
  return withDesc ?? candidates[0];
}

/* ---------------- UI: İnsani rozet/etiket ---------------- */
function categoryBadge(src?: ResolvedSource) {
  if (src === "org") return { text: "Merkez Menü", cls: "bg-blue-50 text-blue-700 border border-blue-100" };
  if (src === "org_override")
    return { text: "Bu Şubede Düzenlendi", cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  return { text: "Bu Şubeye Özel", cls: "bg-gray-100 text-gray-700 border border-gray-200" };
}
function itemBadge(src?: ResolvedSource) {
  if (src === "org") return { text: "Merkez Menü", cls: "bg-blue-50 text-blue-700 border border-blue-100" };
  if (src === "org_override")
    return { text: "Bu Şubede Düzenlendi", cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  return { text: "Bu Şubeye Özel", cls: "bg-gray-100 text-gray-700 border border-gray-200" };
}

// ----------------
// Selection helpers (stable across refetch)
// ----------------
function keyForResolvedCategory(c: ResolvedMenuCategory): string {
  // Org category key is its own id.
  // If category becomes org_override after “düzenlemeyi başlat”, keep selection stable by using orgCategoryId.
  return String(c.source === "org" ? c._id : c.orgCategoryId || c._id);
}

function keyForResolvedItem(i: ResolvedMenuItem): string {
  // Org item key is its own id, override/local uses orgItemId if present.
  return String(i.source === "org" ? i._id : i.orgItemId || i._id);
}

function money(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("tr-TR");
}

export default function MenuManagerPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();

  const [mode, setMode] = React.useState<"manage" | "preview">("manage");

  // ---------- Local Categories ----------
  const catQ = useQuery({
    queryKey: ["menu-categories", rid],
    queryFn: () => restaurantListCategories(rid),
    enabled: !!rid,
  });

  // ---------- Resolved Menu ----------
  const resolvedQ = useQuery({
    queryKey: ["menu-resolved", rid],
    queryFn: () => restaurantGetResolvedMenu(rid) as Promise<ResolvedMenuResponse>,
    enabled: !!rid,
  });

  const localCats: Category[] = (catQ.data ?? []) as any;
  const resolvedCats: ResolvedMenuCategory[] = sortByOrder(resolvedQ.data?.categories ?? []);

  // ✅ stable selection across refetch
  const [selectedCatKey, setSelectedCatKey] = React.useState<string | null>(null);

  // ✅ branch-editable bucket for selected category
  const [selectedLocalCatId, setSelectedLocalCatId] = React.useState<string | null>(null);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
    qc.invalidateQueries({ queryKey: ["menu-items", rid] });
    qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
  };

  // Selected resolved category (stable key)
  React.useEffect(() => {
    const list = resolvedCats || [];
    if (!list.length) {
      if (selectedCatKey) setSelectedCatKey(null);
      return;
    }

    if (selectedCatKey) {
      const ok = list.some((c) => keyForResolvedCategory(c) === selectedCatKey);
      if (ok) return;
    }

    setSelectedCatKey(keyForResolvedCategory(list[0]));
  }, [resolvedCats, selectedCatKey]);

  const selectedResolvedCat =
    resolvedCats.find((c) => keyForResolvedCategory(c) === selectedCatKey) || null;

  // Find local category corresponding to resolved category
  const findLocalCategoryForResolved = React.useCallback(
    (rc: ResolvedMenuCategory | null): Category | null => {
      if (!rc) return null;

      // resolved local or org_override => local category id should match resolved _id
      if (rc.source !== "org") {
        return localCats.find((lc) => String(lc._id) === String(rc._id)) || null;
      }

      // org => first try by link
      const byLink =
        localCats.find((lc) => String(lc.orgCategoryId || "") === String(rc._id)) || null;
      if (byLink) return byLink;

      // fallback
      return findOverrideCategoryForOrgHeuristic(localCats, rc);
    },
    [localCats]
  );

  // resolved -> selectedLocalCatId
  React.useEffect(() => {
    if (!selectedResolvedCat) {
      setSelectedLocalCatId(null);
      return;
    }
    const lc = findLocalCategoryForResolved(selectedResolvedCat);
    setSelectedLocalCatId(lc?._id ?? null);
  }, [selectedCatKey, selectedResolvedCat, localCats, findLocalCategoryForResolved]);

  // ---------- Mutations: Categories ----------
  const createCatMut = useMutation({
    mutationFn: (payload: { title: string; description?: string; order?: number; orgCategoryId?: string }) =>
      restaurantCreateCategory(rid, payload as any),
    onSuccess: async (res: any) => {
      const id = res?._id || res?.category?._id || null;

      await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });

      // new local category => select immediately
      if (id) {
        setSelectedCatKey(String(id));
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

  const deleteCatMut = useMutation({
    mutationFn: (cid: string) => restaurantDeleteCategory(rid, cid),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-items", rid] });
      await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    },
  });

  // ---------- Items (branch-editable bucket for selected category) ----------
  const itemsQ = useQuery({
    queryKey: ["menu-items", rid, selectedLocalCatId],
    queryFn: () => restaurantListItems(rid, { categoryId: String(selectedLocalCatId) }),
    enabled: !!rid && !!selectedLocalCatId,
  });

  const localItems: Item[] = (itemsQ.data ?? []) as any;

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

  // ✅ “override” yok: org kategori için şube düzenleme kaydı aç
  const ensureEditableCategoryForOrg = async (orgCat: ResolvedMenuCategory) => {
    const existing =
      localCats.find((lc) => String(lc.orgCategoryId || "") === String(orgCat._id)) ||
      findOverrideCategoryForOrgHeuristic(localCats, orgCat);

    if (existing?._id) {
      setSelectedLocalCatId(existing._id);
      return existing._id;
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

          if (id) setSelectedLocalCatId(String(id));

          await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
          await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
          await qc.invalidateQueries({ queryKey: ["menu-items", rid, id] });
          resolve(id);
        },
        onError: () => resolve(null),
      });
    });
  };

  const findLocalEditedItemForOrgItemId = (orgItemId: string) => {
    if (!orgItemId) return null;
    const byLink = localItems.find((li) => String(li.orgItemId || "") === String(orgItemId)) || null;
    return byLink;
  };

  // Org item doğrudan düzenlenmez; önce şube kaydı gerekir
  const canEditResolvedItem = (it: ResolvedMenuItem) => it.source !== "org";

  const loadingManage =
    mode === "manage" && (catQ.isLoading || resolvedQ.isLoading || itemsQ.isLoading);
  const loadingPreview = mode === "preview" && resolvedQ.isLoading;
  const anyError = catQ.isError || resolvedQ.isError || itemsQ.isError;

  return (
    <div className="flex-1 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Menü Yönetimi</h2>
          <div className="text-xs text-gray-500">
            Burada gördüğün menü; <b>Merkez Menü</b> + <b>Bu Şubede Düzenlenen</b> + <b>Bu Şubeye Özel</b> içeriklerin
            birleşmiş halidir. Merkez menüdeki bir kategori/ürünü değiştirmek için “Düzenlemeyi Başlat” yeterlidir.
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

      {!rid && (
        <div className="text-sm text-red-600">
          RestaurantId bulunamadı. Oturum / authStore akışını kontrol et.
        </div>
      )}

      {(loadingManage || loadingPreview) && <div className="text-sm text-gray-500">Yükleniyor…</div>}

      {anyError && (
        <div className="text-sm text-red-600">
          Menü verisi alınırken hata oluştu. Network/Yetki veya endpointleri kontrol et.
        </div>
      )}

      {mode === "manage" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title="Kategoriler">
            <div className="space-y-3">
              {resolvedCats.map((c) => {
                const isSelected = keyForResolvedCategory(c) === selectedCatKey;
                const localCat = findLocalCategoryForResolved(c);
                const isEditing = !!localCat && localCat._id === editingCatId;
                const badge = categoryBadge(c.source);

                return (
                  <div
                    key={c._id}
                    className={`border rounded-lg p-3 transition ${
                      isSelected
                        ? "border-brand-600 bg-brand-50 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {!isEditing ? (
                      <>
                        <button className="w-full text-left" onClick={() => setSelectedCatKey(keyForResolvedCategory(c))}>
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{c.title}</div>
                            <span className={`text-[11px] px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                          </div>

                          {!!c.description && <div className="text-xs text-gray-500 mt-1">{c.description}</div>}

                          <div className="text-xs text-gray-400 mt-1">
                            Sıra: {c.order ?? 0} • {c.isActive === false ? "Kapalı" : "Açık"}
                            {c.source === "org" && !localCat ? " • Bu şubede düzenleme yok" : ""}
                          </div>
                        </button>

                        <div className="flex gap-2 mt-2 flex-wrap">
                          {c.source === "org" && !localCat && (
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
                              Kategoriyi Düzenle
                            </button>
                          )}

                          {/* Silme sadece bu şubeye özel kategoriler için */}
                          {localCat && c.source === "local" && (
                            <button
                              className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                              onClick={() => {
                                if (confirm(`"${localCat.title}" kategorisi silinsin mi?`)) {
                                  deleteCatMut.mutate(localCat._id);
                                }
                              }}
                            >
                              Sil
                            </button>
                          )}

                          {/* Merkez kategori silinmez: bu şubede kapatılır (gerekirse düzenleme başlatır) */}
                          {c.source === "org" && (
                            <button
                              className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                              onClick={async () => {
                                const id = await ensureEditableCategoryForOrg(c);
                                if (!id) return;
                                updateCatMut.mutate({ cid: String(id), payload: { isActive: false } });
                              }}
                            >
                              Bu şubede kapat
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
                              updateCatMut.mutate({ cid: localCat!._id, payload: editingCat });
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
                    placeholder="Örn: 10"
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
            </div>
          </Card>

          <div className="lg:col-span-2 space-y-4">
            <Card title={selectedResolvedCat ? `Ürünler — ${selectedResolvedCat.title}` : "Ürünler"}>
              {!selectedResolvedCat && <div className="text-sm text-gray-500">Soldan bir kategori seç.</div>}

              {selectedResolvedCat && (
                <div className="space-y-3">
                  {selectedResolvedCat.source === "org" && !selectedLocalCatId && (
                    <div className="border rounded-lg p-3 bg-amber-50 text-amber-900">
                      Bu kategori <b>Merkez Menü</b>den geliyor. Bu şubeye özel fiyat / stok / görünürlük ayarı yapmak
                      için önce <b>Düzenlemeyi Başlat</b> butonuna bas.
                    </div>
                  )}

                  {sortByOrder(selectedResolvedCat.items || []).map((it) => {
                    const isEditing = it._id === editingItemId;
                    const badge = itemBadge(it.source);
                    const editedLocal = it.source === "org" ? findLocalEditedItemForOrgItemId(it._id) : null;
                    const canEdit = canEditResolvedItem(it);

                    return (
                      <div key={it._id} className="border rounded-lg p-3">
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
                              {!!it.tags?.length && (
                                <div className="text-xs text-gray-500 mt-1">#{it.tags.join(" #")}</div>
                              )}
                            </div>

                            <div className="md:col-span-1">
                              {it.photoUrl ? (
                                <img src={it.photoUrl} className="w-28 h-20 object-cover rounded border" />
                              ) : (
                                <div className="w-28 h-20 rounded border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                  Foto yok
                                </div>
                              )}
                            </div>

                            <div className="md:col-span-2 flex gap-2 flex-wrap">
                              {it.source === "org" && (
                                <>
                                  {!editedLocal ? (
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                                      disabled={!selectedLocalCatId}
                                      title={
                                        !selectedLocalCatId
                                          ? "Önce kategoride ‘Düzenlemeyi Başlat’ yap"
                                          : "Bu ürüne şube ayarlarını aç"
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
                                      Düzenlemeyi Başlat
                                    </button>
                                  ) : (
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                      onClick={() => {
                                        setEditingItemId(editedLocal._id);
                                        setEditingItem({
                                          title: editedLocal.title,
                                          description: editedLocal.description ?? "",
                                          price: editedLocal.price,
                                          tagsText: (editedLocal.tags ?? []).join(", "),
                                          order: editedLocal.order,
                                          isAvailable: editedLocal.isAvailable,
                                          isActive: editedLocal.isActive,
                                        });
                                        setEditingItemPhoto(null);
                                      }}
                                    >
                                      Ürünü Düzenle
                                    </button>
                                  )}

                                  <button
                                    className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                    disabled={!selectedLocalCatId}
                                    title={!selectedLocalCatId ? "Önce kategoride ‘Düzenlemeyi Başlat’ yap" : "Bu şubede menüden kaldır"}
                                    onClick={() => {
                                      if (!selectedLocalCatId) return;

                                      const existing = findLocalEditedItemForOrgItemId(it._id);
                                      if (existing?._id) {
                                        updateItemMut.mutate({ iid: existing._id, isActive: false });
                                        return;
                                      }

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
                                </>
                              )}

                              {canEdit && (
                                <>
                                  <button
                                    className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                    onClick={() => {
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
                                    Ürünü Düzenle
                                  </button>

                                  {/* Silme sadece bu şubeye özel ürünler için */}
                                  {it.source === "local" && (
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                                      onClick={() => {
                                        if (confirm(`"${it.title}" ürünü silinsin mi?`)) deleteItemMut.mutate(it._id);
                                      }}
                                    >
                                      Sil
                                    </button>
                                  )}
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
                                  onChange={(e) => setEditingItem((p: any) => ({ ...p, title: e.target.value }))}
                                />
                              </div>

                              <div className="flex flex-col">
                                <label className="text-xs text-gray-500 mb-1">Fiyat (₺)</label>
                                <input
                                  type="number"
                                  className="border rounded px-2 py-1 text-sm"
                                  value={editingItem.price ?? 0}
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({ ...p, price: Number(e.target.value) || 0 }))
                                  }
                                />
                              </div>
                            </div>

                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editingItem.description ?? ""}
                              placeholder="Açıklama (isteğe bağlı)"
                              onChange={(e) => setEditingItem((p: any) => ({ ...p, description: e.target.value }))}
                            />

                            <input
                              className="w-full border rounded px-2 py-1 text-sm"
                              value={editingItem.tagsText ?? ""}
                              placeholder="Etiketler (virgülle) — örn: acı, vegan"
                              onChange={(e) => setEditingItem((p: any) => ({ ...p, tagsText: e.target.value }))}
                            />

                            <div className="flex gap-3 items-center">
                              <div className="flex flex-col">
                                <label className="text-xs text-gray-500 mb-1">Sıra</label>
                                <input
                                  type="number"
                                  className="w-28 border rounded px-2 py-1 text-sm"
                                  value={editingItem.order ?? 0}
                                  onChange={(e) =>
                                    setEditingItem((p: any) => ({ ...p, order: Number(e.target.value) || 0 }))
                                  }
                                />
                              </div>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={editingItem.isAvailable ?? true}
                                  onChange={(e) => setEditingItem((p: any) => ({ ...p, isAvailable: e.target.checked }))}
                                />
                                Serviste
                              </label>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
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
                                onChange={(e) => setEditingItemPhoto(e.target.files?.[0] ?? null)}
                              />
                              <label className="flex items-center gap-2 text-sm mt-1">
                                <input
                                  type="checkbox"
                                  onChange={(e) => setEditingItem((p: any) => ({ ...p, removePhoto: e.target.checked }))}
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

                  <div className="border rounded-lg p-3 bg-white space-y-2">
                    <div className="text-sm font-medium">Yeni Ürün (Bu Şubeye Özel)</div>

                    <div className="text-xs text-gray-500">
                      Ürün eklemek için kategori <b>düzenlenebilir</b> olmalı. Eğer bu kategori <b>Merkez Menü</b> ise önce
                      <b> Düzenlemeyi Başlat</b> butonuna bas.
                    </div>

                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Ürün adı"
                      value={newItem.title}
                      onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                    />
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Açıklama (isteğe bağlı)"
                      value={newItem.description}
                      onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Fiyat (₺)</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 text-sm"
                          value={newItem.price}
                          onChange={(e) => setNewItem((p) => ({ ...p, price: Number(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Sıra</label>
                        <input
                          type="number"
                          className="border rounded px-2 py-1 text-sm"
                          value={newItem.order}
                          onChange={(e) => setNewItem((p) => ({ ...p, order: Number(e.target.value) || 0 }))}
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-xs text-gray-500 mb-1">Etiketler</label>
                        <input
                          className="border rounded px-2 py-1 text-sm"
                          value={newItem.tagsText}
                          onChange={(e) => setNewItem((p) => ({ ...p, tagsText: e.target.value }))}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
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
                        onChange={(e) => setNewItem((p) => ({ ...p, photoFile: e.target.files?.[0] ?? null }))}
                      />
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {selectedResolvedCat?.source === "org" && !selectedLocalCatId && (
                        <button
                          className="px-3 py-1.5 text-sm rounded bg-amber-50 text-amber-900 hover:bg-amber-100"
                          onClick={async () => {
                            await ensureEditableCategoryForOrg(selectedResolvedCat);
                            refreshAll();
                          }}
                        >
                          Bu kategoride düzenleme başlat
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

      {mode === "preview" && (
        <div className="space-y-4">
          <Card title="Müşteri Görünümü (Menü Önizleme)">
            <div className="text-xs text-gray-500 mb-3">
              Bu ekran sadece kontrol içindir. Veri: <code>GET /panel/restaurants/:rid/menu/resolved</code>
            </div>

            {!resolvedQ.data?.categories?.length && (
              <div className="text-sm text-gray-500">Menü boş görünüyor.</div>
            )}

            <div className="space-y-4">
              {sortByOrder(resolvedQ.data?.categories ?? []).map((c) => {
                const badge = categoryBadge(c.source);
                return (
                  <div key={c._id} className="border rounded-lg p-4">
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
                        const ib = itemBadge(it.source);
                        return (
                          <div key={it._id} className="border rounded-lg p-3 flex gap-3">
                            <div className="w-24 shrink-0">
                              {it.photoUrl ? (
                                <img src={it.photoUrl} className="w-24 h-16 object-cover rounded border" alt={it.title} />
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

                              {!!it.description && (
                                <div className="text-xs text-gray-500 mt-1 line-clamp-2">{it.description}</div>
                              )}

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

                      {(!c.items || c.items.length === 0) && (
                        <div className="text-sm text-gray-500">Bu kategoride ürün yok.</div>
                      )}
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