// src/org/pages/OrgMenuManagerPage.tsx
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card } from "../../components/Card";
import {
  orgGetMenu,
  orgCreateMenuCategory,
  orgUpdateMenuCategory,
  orgDeleteMenuCategory,
  orgCreateMenuItem,
  orgUpdateMenuItem,
  orgDeleteMenuItem,
  OrgMenuCategory,
  OrgMenuItem,
} from "../../api/client";
import { getCurrencySymbolForRegion } from "../../utils/currency";

type RouteParams = {
  id: string; // /org/organizations/:id/menu
};

export default function OrgMenuManagerPage() {
  const { id } = useParams<RouteParams>();
  const oid = id || "";
  const qc = useQueryClient();
  
  // ---------- Query: Org Menü ----------
  const menuQ = useQuery({
    queryKey: ["org-menu", oid],
    queryFn: () => orgGetMenu(oid),
    enabled: !!oid,
  });

  const categories: OrgMenuCategory[] = menuQ.data?.categories ?? [];
  const [selectedCatId, setSelectedCatId] = React.useState<string | null>(null);

  // Seçili kategori stabil kalsın / silinirse ilkine dönsün
  React.useEffect(() => {
    
    if (!categories.length) {
      if (selectedCatId) setSelectedCatId(null);
      return;
    }
    if (!selectedCatId || !categories.find((c) => c._id === selectedCatId)) {
      setSelectedCatId(categories[0]._id);
    }
  }, [categories, selectedCatId]);

  const selectedCat =
    categories.find((c) => c._id === selectedCatId) ?? null;

  const items: OrgMenuItem[] = selectedCat?.items ?? [];

  const orgRegion: string | undefined =
    menuQ.data?.organization?.region ?? undefined;

  const currencySymbol = getCurrencySymbolForRegion(orgRegion);

  // ---------- Mutations: Categories ----------
  const createCatMut = useMutation({
    mutationFn: (payload: {
      title: string;
      description?: string;
      order?: number;
      isActive?: boolean;
    }) => orgCreateMenuCategory(oid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-menu", oid] });
    },
  });

  const updateCatMut = useMutation({
    mutationFn: (p: {
      cid: string;
      payload: {
        title?: string;
        description?: string;
        order?: number;
        isActive?: boolean;
      };
    }) => orgUpdateMenuCategory(oid, p.cid, p.payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-menu", oid] });
    },
  });

  const deleteCatMut = useMutation({
    mutationFn: (cid: string) => orgDeleteMenuCategory(oid, cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-menu", oid] });
    },
  });

  // ---------- Mutations: Items ----------
  const createItemMut = useMutation({
    mutationFn: (payload: {
      categoryId: string;
      title: string;
      defaultPrice: number;
      description?: string;
      tags?: string[];
      order?: number;
      isActive?: boolean;
      photoFile?: File | null;
    }) => orgCreateMenuItem(oid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-menu", oid] });
    },
  });

  const updateItemMut = useMutation({
    mutationFn: (p: {
      iid: string;
      payload: {
        categoryId?: string;
        title?: string;
        description?: string;
        defaultPrice?: number;
        tags?: string[];
        order?: number;
        isActive?: boolean;
        photoFile?: File | null;
        removePhoto?: boolean;
      };
    }) => orgUpdateMenuItem(oid, p.iid, p.payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-menu", oid] });
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: (iid: string) => orgDeleteMenuItem(oid, iid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-menu", oid] });
    },
  });

  // ---------- UI State ----------
  const [newCat, setNewCat] = React.useState({
    title: "",
    description: "",
    order: 0,
    isActive: true,
  });

  const [editingCatId, setEditingCatId] = React.useState<string | null>(null);
  const [editingCat, setEditingCat] = React.useState<{
    title?: string;
    description?: string;
    order?: number;
    isActive?: boolean;
  }>({});

  const [newItem, setNewItem] = React.useState({
    title: "",
    description: "",
    defaultPrice: 0,
    tagsText: "",
    order: 0,
    isActive: true,
    photoFile: null as File | null,
    photoPreviewUrl: "",
  });

  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [editingItem, setEditingItem] = React.useState<{
    title?: string;
    description?: string;
    defaultPrice?: number;
    tagsText?: string;
    order?: number;
    isActive?: boolean;
    photoFile?: File | null;
    photoPreviewUrl?: string;
    removePhoto?: boolean;
  }>({});

  const handleNewItemPhotoFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNewItem((prev) => {
      if (prev.photoPreviewUrl) {
        try {
          URL.revokeObjectURL(prev.photoPreviewUrl);
        } catch {}
      }
      const objectUrl = URL.createObjectURL(file);
      return {
        ...prev,
        photoFile: file,
        photoPreviewUrl: objectUrl,
      };
    });
  };

  const handleEditingItemPhotoFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEditingItem((prev) => {
      if (prev.photoPreviewUrl) {
        try {
          URL.revokeObjectURL(prev.photoPreviewUrl);
        } catch {}
      }
      const objectUrl = URL.createObjectURL(file);
      return {
        ...prev,
        photoFile: file,
        photoPreviewUrl: objectUrl,
        removePhoto: false,
      };
    });
  };

  React.useEffect(() => {
    return () => {
      if (newItem.photoPreviewUrl) {
        try {
          URL.revokeObjectURL(newItem.photoPreviewUrl);
        } catch {}
      }
      if (editingItem.photoPreviewUrl) {
        try {
          URL.revokeObjectURL(editingItem.photoPreviewUrl);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!oid) {
    return (
      <div className="p-4 text-sm text-red-600">
        Organizasyon ID bulunamadı. Route parametresini kontrol et
        (`/org/organizations/:id/menu` gibi).
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6">
      <h2 className="text-lg font-semibold">
        Organizasyon Menüsü — Kategori & Ürünler
      </h2>

      {menuQ.isLoading && (
        <div className="text-sm text-gray-500">Menü yükleniyor…</div>
      )}

      {menuQ.data && (
        <div className="text-sm text-gray-500">
          Organizasyon:{" "}
          <span className="font-medium">
            {menuQ.data.organization?.name}
          </span>{" "}
          ({menuQ.data.organization?.region || "region yok"})
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---------- Categories Column ---------- */}
        <Card title="Org Kategorileri">
          <div className="space-y-3">
            {categories.map((c) => {
              const isSelected = c._id === selectedCatId;
              const isEditing = c._id === editingCatId;

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
                        onClick={() => setSelectedCatId(c._id)}
                      >
                        <div className="font-medium">{c.title}</div>
                        {!!c.description && (
                          <div className="text-xs text-gray-500 mt-1">
                            {c.description}
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1">
                          Sıra: {c.order} • {c.isActive ? "Aktif" : "Pasif"}
                        </div>
                      </button>

                      <div className="flex gap-2 mt-2">
                        <button
                          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                          onClick={() => {
                            setEditingCatId(c._id);
                            setEditingCat({
                              title: c.title,
                              description: c.description || "",
                              order: c.order,
                              isActive: c.isActive,
                            });
                          }}
                        >
                          Düzenle
                        </button>
                        <button
                          className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                          onClick={() => {
                            if (confirm(`"${c.title}" kategorisi pasif yapılsın mı?`)) {
                              deleteCatMut.mutate(c._id);
                            }
                          }}
                        >
                          Pasif Yap
                        </button>
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
                          setEditingCat((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
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
                              setEditingCat((p) => ({
                                ...p,
                                isActive: e.target.checked,
                              }))
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
                              cid: c._id,
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

            {/* New Category */}
            <div className="border rounded-lg p-3 bg-white space-y-2">
              <div className="text-sm font-medium">Yeni Org Kategorisi</div>
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="Başlık"
                value={newCat.title}
                onChange={(e) =>
                  setNewCat((p) => ({ ...p, title: e.target.value }))
                }
              />
              <input
                className="w-full border rounded px-2 py-1 text-sm"
                placeholder="Açıklama"
                value={newCat.description}
                onChange={(e) =>
                  setNewCat((p) => ({ ...p, description: e.target.value }))
                }
              />
              <div className="flex items-center gap-3">
                <div className="flex flex-col w-32">
                  <label className="text-xs text-gray-500 mb-1">
                    Sıra (menüde görünme)
                  </label>
                  <input
                    type="number"
                    className="border rounded px-2 py-1 text-sm"
                    placeholder="Örn: 10"
                    value={newCat.order}
                    onChange={(e) =>
                      setNewCat((p) => ({
                        ...p,
                        order: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm mt-5">
                  <input
                    type="checkbox"
                    checked={newCat.isActive}
                    onChange={(e) =>
                      setNewCat((p) => ({ ...p, isActive: e.target.checked }))
                    }
                  />
                  Aktif
                </label>
              </div>
              <button
                className="w-full px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                disabled={!newCat.title.trim()}
                onClick={() => {
                  createCatMut.mutate(newCat);
                  setNewCat({
                    title: "",
                    description: "",
                    order: 0,
                    isActive: true,
                  });
                }}
              >
                Kategori Ekle
              </button>
            </div>
          </div>
        </Card>

        {/* ---------- Items Column ---------- */}
        <div className="lg:col-span-2 space-y-4">
          <Card
            title={
              selectedCat
                ? `Org Ürünleri — ${selectedCat.title}`
                : "Org Ürünleri"
            }
          >
            {!selectedCat && (
              <div className="text-sm text-gray-500">
                Sol taraftan bir kategori seç.
              </div>
            )}

            {selectedCat && (
              <div className="space-y-3">
                {items.map((it) => {
                  const isEditing = it._id === editingItemId;

                  return (
                    <div key={it._id} className="border rounded-lg p-3">
                      {!isEditing ? (
                        <div className="grid grid-cols-1 md:grid-cols-8 gap-3 items-start">
                          <div className="md:col-span-3">
                            <div className="font-medium">{it.title}</div>
                            {!!it.description && (
                              <div className="text-xs text-gray-500 mt-1">
                                {it.description}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 mt-1">
                              sıra: {it.order} •{" "}
                              {it.isActive ? "aktif" : "pasif"}
                            </div>
                          </div>

                          <div className="md:col-span-2 text-sm">
                            Varsayılan fiyat:{" "}
                            <b>
                              {it.defaultPrice} {currencySymbol}
                            </b>
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
                                className="w-20 h-16 object-cover rounded border"
                              />
                            ) : (
                              <div className="w-20 h-16 rounded border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                Foto yok
                              </div>
                            )}
                          </div>

                          <div className="md:col-span-2 flex gap-2">
                            <button
                              className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                          onClick={() => {
                            setEditingItemId(it._id);
                            setEditingItem({
                              title: it.title,
                              description: it.description ?? "",
                              defaultPrice: it.defaultPrice,
                              tagsText: (it.tags ?? []).join(", "),
                              order: it.order,
                              isActive: it.isActive,
                              photoFile: null,
                              photoPreviewUrl: "",
                              removePhoto: false,
                            });
                          }}
                            >
                              Düzenle
                            </button>
                            <button
                              className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                              onClick={() => {
                                if (confirm(`"${it.title}" pasif yapılsın mı?`)) {
                                  deleteItemMut.mutate(it._id);
                                }
                              }}
                            >
                              Pasif Yap
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div className="flex flex-col">
                              <label className="text-xs text-gray-500 mb-1">
                                Ürün adı
                              </label>
                              <input
                                className="border rounded px-2 py-1 text-sm"
                                value={editingItem.title ?? ""}
                                placeholder="Örn: Serpme Kahvaltı"
                                onChange={(e) =>
                                  setEditingItem((p) => ({
                                    ...p,
                                    title: e.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div className="flex flex-col">
                              <label className="text-xs text-gray-500 mb-1">
                                Varsayılan fiyat ({currencySymbol})
                              </label>
                              <input
                                type="number"
                                className="border rounded px-2 py-1 text-sm"
                                value={editingItem.defaultPrice ?? 0}
                                placeholder="Örn: 450"
                                onChange={(e) =>
                                  setEditingItem((p) => ({
                                    ...p,
                                    defaultPrice:
                                      Number(e.target.value) || 0,
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
                              setEditingItem((p) => ({
                                ...p,
                                description: e.target.value,
                              }))
                            }
                          />

                          <input
                            className="w-full border rounded px-2 py-1 text-sm"
                            value={editingItem.tagsText ?? ""}
                            placeholder="Etiketler (virgülle) örn: acı, signature"
                            onChange={(e) =>
                              setEditingItem((p) => ({
                                ...p,
                                tagsText: e.target.value,
                              }))
                            }
                          />

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                            <div className="flex flex-col">
                              <label className="text-xs text-gray-500 mb-1">
                                Sıra (bu kategoride)
                              </label>
                              <input
                                type="number"
                                className="border rounded px-2 py-1 text-sm"
                                value={editingItem.order ?? 0}
                                placeholder="Örn: 1"
                                onChange={(e) =>
                                  setEditingItem((p) => ({
                                    ...p,
                                    order: Number(e.target.value) || 0,
                                  }))
                                }
                              />
                            </div>

                            <div className="flex flex-col">
                              <label className="text-xs text-gray-500 mb-1">Fotoğraf</label>

                              <div className="flex items-center gap-3 mb-2">
                                {editingItem.photoPreviewUrl ? (
                                  <img
                                    src={editingItem.photoPreviewUrl}
                                    className="w-20 h-16 object-cover rounded border"
                                  />
                                ) : it.photoUrl && !editingItem.removePhoto ? (
                                  <img
                                    src={it.photoUrl}
                                    className="w-20 h-16 object-cover rounded border"
                                  />
                                ) : (
                                  <div className="w-20 h-16 rounded border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                                    Foto yok
                                  </div>
                                )}

                                {it.photoUrl && !editingItem.photoPreviewUrl && (
                                  <label className="flex items-center gap-2 text-xs text-gray-700">
                                    <input
                                      type="checkbox"
                                      checked={!!editingItem.removePhoto}
                                      onChange={(e) =>
                                        setEditingItem((p) => ({
                                          ...p,
                                          removePhoto: e.target.checked,
                                        }))
                                      }
                                    />
                                    Fotoğrafı kaldır
                                  </label>
                                )}
                              </div>

                              <input
                                type="file"
                                accept="image/*"
                                className="text-xs"
                                onChange={handleEditingItemPhotoFileChange}
                              />
                            </div>

                            <label className="flex items-center gap-2 text-sm mt-5">
                              <input
                                type="checkbox"
                                checked={editingItem.isActive ?? true}
                                onChange={(e) =>
                                  setEditingItem((p) => ({
                                    ...p,
                                    isActive: e.target.checked,
                                  }))
                                }
                              />
                              Aktif
                            </label>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button
                              className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                              onClick={() => {
                                const tags = String(
                                  editingItem.tagsText || ""
                                )
                                  .split(",")
                                  .map((x) => x.trim())
                                  .filter(Boolean);

                                updateItemMut.mutate({
                                  iid: it._id,
                                  payload: {
                                    title: editingItem.title,
                                    description: editingItem.description,
                                    defaultPrice: editingItem.defaultPrice,
                                    tags,
                                    order: editingItem.order,
                                    isActive: editingItem.isActive,
                                    photoFile: editingItem.photoFile ?? null,
                                    removePhoto: !!editingItem.removePhoto,
                                  },
                                });
                                if (editingItem.photoPreviewUrl) {
                                  try {
                                    URL.revokeObjectURL(editingItem.photoPreviewUrl);
                                  } catch {}
                                }
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

                {items.length === 0 && (
                  <div className="text-sm text-gray-500">
                    Bu org kategorisinde ürün yok.
                  </div>
                )}

                {/* New Item */}
                <div className="border rounded-lg p-3 bg-white space-y-2">
                  <div className="text-sm font-medium">Yeni Org Ürünü</div>
                  <input
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="Ürün adı"
                    value={newItem.title}
                    onChange={(e) =>
                      setNewItem((p) => ({ ...p, title: e.target.value }))
                    }
                  />
                  <input
                    className="w-full border rounded px-2 py-1 text-sm"
                    placeholder="Açıklama"
                    value={newItem.description}
                    onChange={(e) =>
                      setNewItem((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="flex flex-col">
                      <label className="text-xs text-gray-500 mb-1">
                        Varsayılan fiyat ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="Örn: 350"
                        value={newItem.defaultPrice}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            defaultPrice: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs text-gray-500 mb-1">
                        Sıra (bu kategoride)
                      </label>
                      <input
                        type="number"
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="Örn: 1"
                        value={newItem.order}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            order: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs text-gray-500 mb-1">
                        Etiketler (virgülle)
                      </label>
                      <input
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="signature, paylaşım, acı"
                        value={newItem.tagsText}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            tagsText: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">Fotoğraf</label>

                    <div className="flex items-center gap-3 mb-2">
                      {newItem.photoPreviewUrl ? (
                        <img
                          src={newItem.photoPreviewUrl}
                          className="w-20 h-16 object-cover rounded border"
                        />
                      ) : (
                        <div className="w-20 h-16 rounded border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                          Foto yok
                        </div>
                      )}
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      className="text-xs"
                      onChange={handleNewItemPhotoFileChange}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newItem.isActive}
                      onChange={(e) =>
                        setNewItem((p) => ({
                          ...p,
                          isActive: e.target.checked,
                        }))
                      }
                    />
                    Aktif
                  </label>

                  <button
                    className="w-full px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                    disabled={
                      !selectedCatId ||
                      !newItem.title.trim() ||
                      newItem.defaultPrice <= 0
                    }
                    onClick={() => {
                      if (!selectedCatId) return;

                      const tags = String(newItem.tagsText || "")
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean);

                      createItemMut.mutate({
                        categoryId: selectedCatId,
                        title: newItem.title,
                        description: newItem.description,
                        defaultPrice: newItem.defaultPrice,
                        tags,
                        order: newItem.order,
                        isActive: newItem.isActive,
                        photoFile: newItem.photoFile ?? null,
                      });

                      if (newItem.photoPreviewUrl) {
                        try {
                          URL.revokeObjectURL(newItem.photoPreviewUrl);
                        } catch {}
                      }
                      setNewItem({
                        title: "",
                        description: "",
                        defaultPrice: 0,
                        tagsText: "",
                        order: 0,
                        isActive: true,
                        photoFile: null,
                        photoPreviewUrl: "",
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
    </div>
  );
}