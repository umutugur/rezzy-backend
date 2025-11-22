import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
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
} from "../../api/client";
import { Card } from "../../components/Card";

type Category = {
  _id: string;
  title: string;
  description?: string;
  order: number;
  isActive: boolean;
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
};

export default function MenuManagerPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();

  // ---------- Categories ----------
  const catQ = useQuery({
    queryKey: ["menu-categories", rid],
    queryFn: () => restaurantListCategories(rid),
    enabled: !!rid,
  });

  const [selectedCatId, setSelectedCatId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedCatId && catQ.data?.length) {
      setSelectedCatId(catQ.data[0]._id);
    }
  }, [catQ.data, selectedCatId]);

  const createCatMut = useMutation({
  mutationFn: (payload: { title: string; description?: string; order?: number }) =>
    restaurantCreateCategory(rid, payload),
  onSuccess: () =>
    qc.invalidateQueries({ queryKey: ["menu-categories", rid] }),
});

  const updateCatMut = useMutation({
    mutationFn: ({ cid, payload }: { cid: string; payload: Partial<Category> }) =>
      restaurantUpdateCategory(rid, cid, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["menu-categories", rid] }),
  });

  const deleteCatMut = useMutation({
    mutationFn: (cid: string) => restaurantDeleteCategory(rid, cid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
      qc.invalidateQueries({ queryKey: ["menu-items", rid] });
    },
  });

  // ---------- Items ----------
  const itemsQ = useQuery({
    queryKey: ["menu-items", rid, selectedCatId],
    queryFn: () =>
      restaurantListItems(rid, selectedCatId ? { categoryId: selectedCatId } : {}),
    enabled: !!rid,
  });

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
    }) => restaurantCreateItem(rid, payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["menu-items", rid, selectedCatId] }),
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["menu-items", rid, selectedCatId] }),
  });

  const deleteItemMut = useMutation({
    mutationFn: (iid: string) => restaurantDeleteItem(rid, iid),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["menu-items", rid, selectedCatId] }),
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

  const cats = catQ.data ?? [];
  const items = itemsQ.data ?? [];
  const selectedCat = cats.find((c) => c._id === selectedCatId) || null;

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: "Dashboard" },
          { to: "/restaurant/reservations", label: "Rezervasyonlar" },
          { to: "/restaurant/opening-hours", label: "Çalışma Saatleri" },
          { to: "/restaurant/tables", label: "Masalar" },
          { to: "/restaurant/menus", label: "Fix Menüler (Kişi Başı)" },
          { to: "/restaurant/menu-manager", label: "Menü Kategorileri & Ürünler" }, // ✅ bunu ekle
          { to: "/restaurant/policies", label: "Politikalar" },
          { to: "/restaurant/photos", label: "Fotoğraflar" },
          { to: "/restaurant/profile", label: "Profil & Ayarlar" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">Menü Kategorileri & Ürünler</h2>

        {(catQ.isLoading || itemsQ.isLoading) && (
          <div className="text-sm text-gray-500">Yükleniyor…</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ---------- Categories Column ---------- */}
          <Card title="Kategoriler">
            <div className="space-y-3">
              {cats.map((c) => {
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
                              if (confirm(`"${c.title}" silinsin mi?`)) {
                                deleteCatMut.mutate(c._id);
                              }
                            }}
                          >
                            Sil
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
                        <div className="flex gap-2">
                          <input
                            type="number"
                            className="w-24 border rounded px-2 py-1 text-sm"
                            value={editingCat.order ?? 0}
                            onChange={(e) =>
                              setEditingCat((p) => ({
                                ...p,
                                order: Number(e.target.value) || 0,
                              }))
                            }
                          />
                          <label className="flex items-center gap-2 text-sm">
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
                <div className="text-sm font-medium">Yeni Kategori</div>
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
                <input
                  type="number"
                  className="w-24 border rounded px-2 py-1 text-sm"
                  placeholder="Sıra"
                  value={newCat.order}
                  onChange={(e) =>
                    setNewCat((p) => ({
                      ...p,
                      order: Number(e.target.value) || 0,
                    }))
                  }
                />
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

          {/* ---------- Items Column ---------- */}
          <div className="lg:col-span-2 space-y-4">
            <Card
              title={
                selectedCat
                  ? `Ürünler — ${selectedCat.title}`
                  : "Ürünler"
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
                            <div className="md:col-span-2">
                              <div className="font-medium">{it.title}</div>
                              {!!it.description && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {it.description}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                sıra: {it.order} • {it.isActive ? "aktif" : "pasif"} •{" "}
                                {it.isAvailable ? "serviste" : "stok yok"}
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

                            <div className="md:col-span-2">
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

                            <div className="md:col-span-2 flex gap-2">
                              <button
                                className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                                onClick={() => {
                                  setEditingItemId(it._id);
                                  setEditingItem({
                                    title: it.title,
                                    description: it.description ?? "",
                                    price: it.price,
                                    tagsText: (it.tags ?? []).join(", "),
                                    order: it.order,
                                    isAvailable: it.isAvailable,
                                    isActive: it.isActive,
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
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input
                                className="border rounded px-2 py-1 text-sm"
                                value={editingItem.title ?? ""}
                                placeholder="Ürün adı"
                                onChange={(e) =>
                                  setEditingItem((p: any) => ({
                                    ...p,
                                    title: e.target.value,
                                  }))
                                }
                              />
                              <input
                                type="number"
                                className="border rounded px-2 py-1 text-sm"
                                value={editingItem.price ?? 0}
                                placeholder="Fiyat"
                                onChange={(e) =>
                                  setEditingItem((p: any) => ({
                                    ...p,
                                    price: Number(e.target.value) || 0,
                                  }))
                                }
                              />
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
                              <input
                                type="number"
                                className="w-24 border rounded px-2 py-1 text-sm"
                                value={editingItem.order ?? 0}
                                onChange={(e) =>
                                  setEditingItem((p: any) => ({
                                    ...p,
                                    order: Number(e.target.value) || 0,
                                  }))
                                }
                              />

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
                              <label className="text-sm text-gray-600">
                                Fotoğraf (opsiyonel)
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  setEditingItemPhoto(
                                    e.target.files?.[0] ?? null
                                  )
                                }
                              />
                              {it.photoUrl && (
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
                              )}
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                                onClick={() => {
                                  updateItemMut.mutate({
                                    iid: it._id,
                                    categoryId: it.categoryId,
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

                  {items.length === 0 && (
                    <div className="text-sm text-gray-500">
                      Bu kategoride ürün yok.
                    </div>
                  )}

                  {/* New Item */}
                  <div className="border rounded-lg p-3 bg-white space-y-2">
                    <div className="text-sm font-medium">Yeni Ürün</div>
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
                      <input
                        type="number"
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="Fiyat (₺)"
                        value={newItem.price}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            price: Number(e.target.value) || 0,
                          }))
                        }
                      />
                      <input
                        type="number"
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="Sıra"
                        value={newItem.order}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            order: Number(e.target.value) || 0,
                          }))
                        }
                      />
                      <input
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="Etiketler: acı, vegan"
                        value={newItem.tagsText}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            tagsText: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newItem.isAvailable}
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            isAvailable: e.target.checked,
                          }))
                        }
                      />
                      Serviste
                    </label>

                    <div className="space-y-1">
                      <label className="text-sm text-gray-600">
                        Fotoğraf (opsiyonel)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setNewItem((p) => ({
                            ...p,
                            photoFile: e.target.files?.[0] ?? null,
                          }))
                        }
                      />
                    </div>

                    <button
                      className="w-full px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                      disabled={!newItem.title.trim()}
                      onClick={() => {
                        if (!selectedCatId) return;
                        createItemMut.mutate({
                          categoryId: selectedCatId,
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
      </div>
    </div>
  );
}