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
  restaurantUpsertCategoryOverride,
  restaurantUpsertItemOverride,
} from "../../api/client";
import { Card } from "../../components/Card";

/* =======================
   Types
======================= */

type LocalCategory = {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  order: number;
  isActive: boolean;
};

type LocalItem = {
  _id?: string;
  id?: string;
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

type ResolvedSource = "org" | "org_branch_override" | "local";

type ResolvedMenuItem = {
  _id?: string;
  id?: string;
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
  _id?: string;
  id?: string;
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

function norm(s?: string | null) {
  return String(s ?? "").trim().toLowerCase();
}

function getId(x: any): string {
  const v = x?._id ?? x?.id;
  if (v && typeof v === "string") return v;
  return `__missing_id__:${norm(x?.title)}:${Number(x?.order ?? 0)}`;
}

function money(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("tr-TR");
}

function badgeFor(src: ResolvedSource) {
  if (src === "org") return { text: "Merkez", cls: "bg-blue-50 text-blue-700 border border-blue-100" };
  if (src === "org_branch_override")
    return { text: "Şube", cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  return { text: "Özel", cls: "bg-gray-100 text-gray-700 border border-gray-200" };
}

/* =======================
   Modal (minimal)
======================= */
function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-soft border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="font-semibold">{title}</div>
            <button className="px-2 py-1 rounded hover:bg-gray-100" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="p-5">{children}</div>
          {footer && <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/* =======================
   Category modal
======================= */
type CategoryModalState =
  | { open: false }
  | {
      open: true;
      mode: "create_local" | "edit_local" | "edit_org_override";
      title: string;
      categoryId?: string | null;     // local edit için
      orgCategoryId?: string | null;  // org override için
      initial: { title: string; description: string; order: number };
    };

function CategoryEditorModal({
  state,
  onClose,
  onSave,
  saving,
}: {
  state: CategoryModalState;
  onClose: () => void;
  onSave: (payload: { title: string; description: string; order: number }) => void;
  saving: boolean;
}) {
  const open = state.open;
  const [form, setForm] = React.useState({ title: "", description: "", order: 0 });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      title: state.initial.title ?? "",
      description: state.initial.description ?? "",
      order: Number(state.initial.order ?? 0),
    });
  }, [open, state.open && state.initial]);

  if (!open) return null;

  const isOrgOverride = state.mode === "edit_org_override";

  return (
    <Modal
      open={open}
      title={state.title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
            onClick={onClose}
          >
            Vazgeç
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            disabled={saving || (!isOrgOverride && !form.title.trim())}
            onClick={() =>
              onSave({
                title: form.title.trim(),
                description: form.description?.trim() || "",
                order: Number(form.order) || 0,
              })
            }
          >
            Kaydet
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!isOrgOverride && (
          <>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500">Başlık</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500">Açıklama</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs text-gray-500">Sıra</label>
          <input
            type="number"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.order}
            onChange={(e) => setForm((p) => ({ ...p, order: Number(e.target.value) || 0 }))}
          />
        </div>

        {isOrgOverride && (
          <div className="md:col-span-2 text-xs text-gray-500">
            Merkez kategorinin başlık/açıklaması burada değişmez. Sadece şube sırası yönetilir.
          </div>
        )}
      </div>
    </Modal>
  );
}

/* =======================
   Item modal
======================= */
type ItemModalState =
  | { open: false }
  | {
      open: true;
      mode: "create_local" | "edit_local" | "edit_org_override";
      title: string;
      itemId?: string | null;     // local edit için
      orgItemId?: string | null;  // org override için
      initial: {
        title: string;
        description: string;
        price: number;
        tagsText: string;
        order: number;
        isAvailable: boolean;
      };
    };

function ItemEditorModal({
  state,
  disabled,
  onClose,
  onSave,
  onQuickDisable,
  saving,
}: {
  state: ItemModalState;
  disabled: boolean;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description: string;
    price: number;
    tagsText: string;
    order: number;
    isAvailable: boolean;
    photoFile: File | null;
  }) => void;
  onQuickDisable?: (() => void) | null;
  saving: boolean;
}) {
  const open = state.open;
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    price: 0,
    tagsText: "",
    order: 0,
    isAvailable: true,
    photoFile: null as File | null,
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      title: state.initial.title ?? "",
      description: state.initial.description ?? "",
      price: Number(state.initial.price ?? 0),
      tagsText: state.initial.tagsText ?? "",
      order: Number(state.initial.order ?? 0),
      isAvailable: state.initial.isAvailable !== false,
      photoFile: null,
    });
  }, [open, state.open && state.initial]);

  if (!open) return null;

  const isOrgOverride = state.mode === "edit_org_override";

  return (
    <Modal
      open={open}
      title={state.title}
      onClose={onClose}
      footer={
        <div className="flex justify-between gap-2">
          {onQuickDisable && (
            <button
              className="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
              disabled={disabled || saving}
              onClick={onQuickDisable}
            >
              Bu şubede kapat
            </button>
          )}

          <div className="ml-auto flex gap-2">
            <button
              className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
              onClick={onClose}
            >
              Vazgeç
            </button>

            <button
              className="px-3 py-1.5 text-sm rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
              disabled={disabled || saving || (!isOrgOverride && !form.title.trim())}
              onClick={() =>
                onSave({
                  title: form.title.trim(),
                  description: form.description?.trim() || "",
                  price: Number(form.price) || 0,
                  tagsText: form.tagsText,
                  order: Number(form.order) || 0,
                  isAvailable: !!form.isAvailable,
                  photoFile: form.photoFile,
                })
              }
            >
              Kaydet
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {!isOrgOverride && (
          <>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500">Ürün adı</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-gray-500">Açıklama</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </>
        )}

        <div>
          <label className="text-xs text-gray-500">Fiyat (₺)</label>
          <input
            type="number"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.price}
            onChange={(e) => setForm((p) => ({ ...p, price: Number(e.target.value) || 0 }))}
          />
        </div>

        <div>
          <label className="text-xs text-gray-500">Sıra</label>
          <input
            type="number"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.order}
            onChange={(e) => setForm((p) => ({ ...p, order: Number(e.target.value) || 0 }))}
          />
        </div>

        {!isOrgOverride && (
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500">Etiketler (virgülle)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.tagsText}
              onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))}
            />
          </div>
        )}

        <div className="md:col-span-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => setForm((p) => ({ ...p, isAvailable: e.target.checked }))}
            />
            Serviste
          </label>

          {!isOrgOverride && (
            <label className="text-sm">
              <span className="text-xs text-gray-500 mr-2">Fotoğraf</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setForm((p) => ({ ...p, photoFile: e.target.files?.[0] ?? null }))}
              />
            </label>
          )}
        </div>

        {isOrgOverride && (
          <div className="md:col-span-2 text-xs text-gray-500">
            Merkez üründe başlık/açıklama/etiket/foto burada değişmez. Şubede sadece fiyat, sıra ve serviste durumu yönetilir.
          </div>
        )}
      </div>
    </Modal>
  );
}

/* =======================
   View model
======================= */
type CategoryVM = {
  key: string;
  id: string; // resolved id
  title: string;
  description?: string | null;
  order: number;
  isActive: boolean;
  source: ResolvedSource;
  resolved?: ResolvedMenuCategory | null;
  kind: "resolved";
};

export default function MenuManagerPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();

  const [mode, setMode] = React.useState<"manage" | "preview">("manage");

  // Queries
  const localCatQ = useQuery({
    queryKey: ["menu-categories", rid],
    queryFn: () => restaurantListCategories(rid, { includeInactive: true }),
    enabled: !!rid,
  });

  const resolvedQ = useQuery({
    queryKey: ["menu-resolved", rid],
    queryFn: () => restaurantGetResolvedMenu(rid,{ includeInactive: true }),
    enabled: !!rid,
  });

  const localCats: LocalCategory[] = (localCatQ.data ?? []) as any;
  const resolvedCats: ResolvedMenuCategory[] = sortByOrder(resolvedQ.data?.categories ?? []);

  const refreshAll = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
    qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
    qc.invalidateQueries({ queryKey: ["menu-items", rid] });
  }, [qc, rid]);

  // Build categories list (resolved only, çünkü yönetim artık resolved üstünden yapılacak)
  const all: CategoryVM[] = React.useMemo(() => {
    return resolvedCats.map((c, idx) => {
      const src = (c.source ?? "local") as ResolvedSource;
      const id = getId(c);
      return {
        key: `${src}:${id}:${idx}`,
        id,
        title: c.title,
        description: c.description ?? null,
        order: c.order ?? 0,
        isActive: c.isActive !== false,
        source: src,
        resolved: c,
        kind: "resolved",
      };
    });
  }, [resolvedCats]);

  // Selection
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!all.length) {
      if (selectedKey) setSelectedKey(null);
      return;
    }
    if (selectedKey && all.some((x) => x.key === selectedKey)) return;
    setSelectedKey(all[0]?.key ?? null);
  }, [all, selectedKey]);

  const selected = React.useMemo(() => all.find((x) => x.key === selectedKey) ?? null, [all, selectedKey]);
  const selectedResolved = selected?.resolved ?? null;

  // Local category mapping (sadece local CRUD için lazım)
  const selectedLocalCatId = React.useMemo(() => {
    if (!selectedResolved) return null;
    if ((selectedResolved.source ?? "local") !== "local") return null;
    const rid2 = getId(selectedResolved);
    const lc = localCats.find((x) => getId(x) === rid2) || null;
    return lc ? getId(lc) : null;
  }, [selectedResolved, localCats]);

  // Items query: local kategori seçiliyse local items getir
  const itemsQ = useQuery({
    queryKey: ["menu-items", rid, selectedLocalCatId],
    queryFn: () => restaurantListItems(rid, { categoryId: String(selectedLocalCatId), includeInactive: true } as any),
    enabled: !!rid && !!selectedLocalCatId,
  });

  const localItems: LocalItem[] = (itemsQ.data ?? []) as any;
  const closedLocalItems = React.useMemo(() => sortByOrder(localItems.filter((x) => x.isActive === false)), [localItems]);

  // Filters
  const [q, setQ] = React.useState("");
  const list = React.useMemo(() => {
    const qq = norm(q);
    if (!qq) return all;
    return all.filter((c) => norm(c.title).includes(qq) || norm(c.description || "").includes(qq));
  }, [all, q]);

  const [itemTab, setItemTab] = React.useState<"active" | "closed">("active");

  // Mutations: Local category CRUD
  const createLocalCatMut = useMutation({
    mutationFn: (payload: { title: string; description?: string; order?: number }) =>
      restaurantCreateCategory(rid, payload as any),
    onSuccess: async () => {
      refreshAll();
    },
  });

  const updateLocalCatMut = useMutation({
    mutationFn: ({ cid, payload }: { cid: string; payload: any }) =>
      restaurantUpdateCategory(rid, cid, payload),
    onSuccess: async () => {
      refreshAll();
    },
  });

  // Mutations: Overrides
  const catOverrideMut = useMutation({
    mutationFn: ({ orgCategoryId, payload }: { orgCategoryId: string; payload: { hidden?: boolean; order?: number } }) =>
      restaurantUpsertCategoryOverride(rid, orgCategoryId, payload),
    onSuccess: async () => {
      refreshAll();
    },
  });

  const itemOverrideMut = useMutation({
    mutationFn: ({
      orgItemId,
      payload,
    }: {
      orgItemId: string;
      payload: { hidden?: boolean; order?: number; price?: number; isAvailable?: boolean };
    }) => restaurantUpsertItemOverride(rid, orgItemId, payload),
    onSuccess: async () => {
      refreshAll();
    },
  });

  // Mutations: Local item CRUD
  const createLocalItemMut = useMutation({
    mutationFn: (payload: any) => restaurantCreateItem(rid, payload),
    onSuccess: async () => {
      refreshAll();
    },
  });

  const updateLocalItemMut = useMutation({
    mutationFn: (payload: any) => restaurantUpdateItem(rid, payload.iid, payload),
    onSuccess: async () => {
      refreshAll();
    },
  });

  const deleteLocalItemMut = useMutation({
    mutationFn: (iid: string) => restaurantDeleteItem(rid, iid),
    onSuccess: async () => {
      refreshAll();
    },
  });

  // Modals
  const [categoryModal, setCategoryModal] = React.useState<CategoryModalState>({ open: false });
  const [itemModal, setItemModal] = React.useState<ItemModalState>({ open: false });

  const closeCategoryModal = React.useCallback(() => setCategoryModal({ open: false }), []);
  const closeItemModal = React.useCallback(() => setItemModal({ open: false }), []);

  const openCreateLocalCategory = React.useCallback(() => {
    setCategoryModal({
      open: true,
      mode: "create_local",
      title: "Yeni Kategori",
      initial: { title: "", description: "", order: 0 },
    });
  }, []);

  const openEditSelectedCategory = React.useCallback(() => {
    if (!selectedResolved) return;
    const src = (selectedResolved.source ?? "local") as ResolvedSource;

    if (src === "local") {
      const cid = selectedLocalCatId;
      if (!cid) return;

      const lc = localCats.find((x) => getId(x) === cid);
      if (!lc) return;

      setCategoryModal({
        open: true,
        mode: "edit_local",
        title: "Kategori Düzenle",
        categoryId: cid,
        initial: { title: lc.title ?? "", description: lc.description ?? "", order: Number(lc.order ?? 0) },
      });
      return;
    }

    // org / org_branch_override: sadece order override
    const orgCategoryId = String(selectedResolved.orgCategoryId || getId(selectedResolved));
    setCategoryModal({
      open: true,
      mode: "edit_org_override",
      title: "Kategori Sırası",
      orgCategoryId,
      initial: {
        title: selectedResolved.title ?? "",
        description: selectedResolved.description ?? "",
        order: Number(selectedResolved.order ?? 0),
      },
    });
  }, [selectedResolved, selectedLocalCatId, localCats]);

  const openCreateLocalItem = React.useCallback(() => {
    setItemModal({
      open: true,
      mode: "create_local",
      title: "Yeni Ürün",
      initial: { title: "", description: "", price: 0, tagsText: "", order: 0, isAvailable: true },
    });
  }, []);

  const openEditItem = React.useCallback(
    (it: any, src: ResolvedSource) => {
      if (src === "local") {
        setItemModal({
          open: true,
          mode: "edit_local",
          title: "Ürün Düzenle",
          itemId: getId(it),
          initial: {
            title: it.title ?? "",
            description: it.description ?? "",
            price: Number(it.price ?? 0),
            tagsText: (it.tags ?? []).join(", "),
            order: Number(it.order ?? 0),
            isAvailable: it.isAvailable !== false,
          },
        });
        return;
      }

      // org / org_branch_override
      const orgItemId = String(it.orgItemId || getId(it));
      setItemModal({
        open: true,
        mode: "edit_org_override",
        title: "Ürün (Şube Ayarları)",
        orgItemId,
        initial: {
          title: it.title ?? "",
          description: it.description ?? "",
          price: Number(it.price ?? 0),
          tagsText: "",
          order: Number(it.order ?? 0),
          isAvailable: it.isAvailable !== false,
        },
      });
    },
    []
  );

  // Derived
  const selectedBadge = selected ? badgeFor(selected.source) : null;
  const loading = localCatQ.isLoading || resolvedQ.isLoading || itemsQ.isLoading;
  const anyError = localCatQ.isError || resolvedQ.isError || itemsQ.isError;

  const canLocalItemOps = !!selectedLocalCatId && (selectedResolved?.isActive !== false);

  return (
    <div className="flex-1 space-y-6">
      {/* Header (sade) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Menü</h2>
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
            Yönetim
          </button>

          <button
            className={`px-3 py-1.5 text-sm rounded border ${
              mode === "preview"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
            onClick={() => setMode("preview")}
          >
            Önizleme
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
        <div className="text-sm text-red-600">RestaurantId bulunamadı.</div>
      )}

      {loading && <div className="text-sm text-gray-500">Yükleniyor…</div>}

      {anyError && (
        <div className="text-sm text-red-600">
          Menü verisi alınırken hata oluştu.
        </div>
      )}

      {/* =======================
          MANAGE
      ======================= */}
      {mode === "manage" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT */}
          <div className="lg:col-span-4 space-y-4">
            <Card
              title={
                <div className="flex items-center justify-between">
                  <span>Kategoriler</span>
                  <button
                    className="px-3 py-1.5 text-xs rounded bg-brand-600 text-white hover:bg-brand-700"
                    onClick={openCreateLocalCategory}
                  >
                    + Kategori
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Ara…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />

                <div className="max-h-[520px] overflow-auto pr-1 space-y-2">
                  {list.length === 0 ? (
                    <div className="text-sm text-gray-500 p-2">Kayıt yok.</div>
                  ) : (
                    list.map((c) => {
                      const isSelected = c.key === selectedKey;
                      const b = badgeFor(c.source);

                      return (
                        <button
                          key={c.key}
                          onClick={() => setSelectedKey(c.key)}
                          className={`w-full text-left border rounded-xl p-3 transition ${
                            isSelected ? "border-brand-600 bg-brand-50" : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium truncate">{c.title}</div>
                            <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded ${b.cls}`}>{b.text}</span>
                          </div>
                          <div className="text-[11px] text-gray-400 mt-1">
                            Sıra: {c.order} • {c.isActive ? "Açık" : "Kapalı"}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-8 space-y-4">
            <Card
              title={
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate">
                        {selected ? selected.title : "Seçim yok"}
                      </span>
                      {selectedBadge && (
                        <span className={`text-[11px] px-2 py-0.5 rounded ${selectedBadge.cls}`}>{selectedBadge.text}</span>
                      )}
                      {selected && !selected.isActive && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                          Kapalı
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {/* Ürün ekleme sadece local kategoride */}
                    <button
                      className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
                      disabled={!canLocalItemOps || itemTab === "closed"}
                      onClick={openCreateLocalItem}
                      title={!selectedLocalCatId ? "Şubeye özel kategori seç" : selectedResolved?.isActive === false ? "Kategori kapalı" : ""}
                    >
                      + Ürün
                    </button>

                    <button
                      className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
                      disabled={!selectedResolved}
                      onClick={openEditSelectedCategory}
                    >
                      Düzenle
                    </button>

                    {/* Kategori aç/kapat */}
                    {selectedResolved && (
                      <button
                        className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
                        disabled={!selectedResolved}
                        onClick={() => {
                          const src = (selectedResolved.source ?? "local") as ResolvedSource;
                          const nextActive = !(selectedResolved.isActive !== false); // toggle

                          if (src === "local") {
                            if (!selectedLocalCatId) return;
                            updateLocalCatMut.mutate({
                              cid: selectedLocalCatId,
                              payload: { isActive: nextActive },
                            });
                            return;
                          }

                          // org / org_branch_override: hidden toggle (isActive = !hidden)
                          const orgCategoryId = String(selectedResolved.orgCategoryId || getId(selectedResolved));
                          catOverrideMut.mutate({
                            orgCategoryId,
                            payload: { hidden: !nextActive },
                          });
                        }}
                      >
                        {selectedResolved.isActive !== false ? "Bu şubede kapat" : "Aç"}
                      </button>
                    )}
                  </div>
                </div>
              }
            >
              {!selectedResolved && <div className="text-sm text-gray-500">Soldan kategori seç.</div>}

              {selectedResolved && (
                <>
                  {/* Items tab switcher */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        className={`px-3 py-1.5 text-sm ${itemTab === "active" ? "bg-brand-50 text-brand-700" : "bg-white hover:bg-gray-50"}`}
                        onClick={() => setItemTab("active")}
                        type="button"
                      >
                        Aktif
                      </button>
                      <button
                        className={`px-3 py-1.5 text-sm border-l border-gray-200 ${itemTab === "closed" ? "bg-brand-50 text-brand-700" : "bg-white hover:bg-gray-50"}`}
                        onClick={() => setItemTab("closed")}
                        type="button"
                      >
                        Kapalı
                        {closedLocalItems.length > 0 ? (
                          <span className="ml-2 inline-flex items-center justify-center text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {closedLocalItems.length}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="overflow-auto border rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Ürün</th>
                          <th className="text-left font-medium px-3 py-2">Fiyat</th>
                          <th className="text-left font-medium px-3 py-2">Durum</th>
                          <th className="text-left font-medium px-3 py-2">Kaynak</th>
                          <th className="text-right font-medium px-3 py-2">Aksiyon</th>
                        </tr>
                      </thead>

                      <tbody>
                        {itemTab === "active" ? (
                          sortByOrder(selectedResolved.items ?? []).length === 0 ? (
                            <tr>
                              <td className="px-3 py-4 text-gray-500" colSpan={5}>
                                Ürün yok.
                              </td>
                            </tr>
                          ) : (
                            sortByOrder(selectedResolved.items ?? []).map((it, idx) => {
                              const src = (it.source ?? "local") as ResolvedSource;
                              const b = badgeFor(src);

                              const isOrg = src === "org" || src === "org_branch_override";
                              const stableOrgItemId = String(it.orgItemId || getId(it));
                              const canEdit =
                                selectedResolved.isActive !== false &&
                                (src === "local"
                                  ? !!selectedLocalCatId
                                  : true);

                              return (
                                <tr key={`${src}:${stableOrgItemId}:${idx}`} className="border-t">
                                  <td className="px-3 py-2">
                                    <div className="font-medium">{it.title}</div>
                                    {!!it.description && (
                                      <div className="text-xs text-gray-500 line-clamp-2">{it.description}</div>
                                    )}
                                  </td>

                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <b>{money(it.price)} ₺</b>
                                  </td>

                                  <td className="px-3 py-2">
                                    <div className="text-xs text-gray-600">
                                      {it.isActive === false ? "Kapalı" : "Açık"} •{" "}
                                      {it.isAvailable === false ? "Stok yok" : "Serviste"}
                                    </div>
                                  </td>

                                  <td className="px-3 py-2">
                                    <span className={`text-[11px] px-2 py-0.5 rounded ${b.cls}`}>{b.text}</span>
                                  </td>

                                  <td className="px-3 py-2 text-right">
                                    <div className="inline-flex gap-2">
                                      <button
                                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                        disabled={!canEdit}
                                        onClick={() => openEditItem(it, src)}
                                      >
                                        Düzenle
                                      </button>

                                      <button
                                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                        disabled={selectedResolved.isActive === false}
                                        onClick={() => {
                                          if (selectedResolved.isActive === false) return;

                                          if (isOrg) {
                                            itemOverrideMut.mutate({
                                              orgItemId: stableOrgItemId,
                                              payload: { hidden: true },
                                            });
                                            return;
                                          }

                                          // local
                                          if (!selectedLocalCatId) return;
                                          updateLocalItemMut.mutate({ iid: getId(it), isActive: false } as any);
                                        }}
                                      >
                                        Bu şubede kapat
                                      </button>

                                      {/* local sil */}
                                      {src === "local" && (
                                        <button
                                          className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                          disabled={selectedResolved.isActive === false}
                                          onClick={() => {
                                            if (selectedResolved.isActive === false) return;
                                            if (confirm(`"${it.title}" silinsin mi?`)) {
                                              deleteLocalItemMut.mutate(getId(it));
                                            }
                                          }}
                                        >
                                          Sil
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )
                        ) : (
                          // Kapalı ürünler: sadece local listeden gösteriyoruz (org hidden olanları panelde ayrıca göstermek istersen, resolved includeInactive ile ayrıca yönetilebilir)
                          closedLocalItems.length === 0 ? (
                            <tr>
                              <td className="px-3 py-4 text-gray-500" colSpan={5}>
                                Kapalı ürün yok.
                              </td>
                            </tr>
                          ) : (
                            closedLocalItems.map((it, idx) => {
                              const iid = getId(it);
                              const src: ResolvedSource = "local";
                              const b = badgeFor(src);

                              return (
                                <tr key={`closed:${iid}:${idx}`} className="border-t bg-gray-50/40">
                                  <td className="px-3 py-2">
                                    <div className="font-medium">{it.title}</div>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <b>{money(it.price)} ₺</b>
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="text-xs text-gray-600">Kapalı</div>
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`text-[11px] px-2 py-0.5 rounded ${b.cls}`}>{b.text}</span>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="inline-flex gap-2">
                                      <button
                                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                        disabled={selectedResolved.isActive === false}
                                        onClick={() => openEditItem(it, "local")}
                                      >
                                        Düzenle
                                      </button>
                                      <button
                                        className="px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                                        disabled={selectedResolved.isActive === false}
                                        onClick={() => updateLocalItemMut.mutate({ iid, isActive: true } as any)}
                                      >
                                        Aç
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
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
          <Card title="Önizleme">
            {!resolvedQ.data?.categories?.length && <div className="text-sm text-gray-500">Menü boş.</div>}

            <div className="space-y-4">
              {sortByOrder(resolvedQ.data?.categories ?? []).map((c, idx) => (
                <div key={`${getId(c)}:${idx}`} className="border rounded-xl p-4">
                  <div className="font-semibold">{c.title}</div>
                  {!!c.description && <div className="text-sm text-gray-600 mt-1">{c.description}</div>}

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sortByOrder(c.items ?? []).map((it, j) => (
                      <div key={`${getId(it)}:${j}`} className="border rounded-xl p-3 flex gap-3">
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
                          {!!it.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{it.description}</div>}
                        </div>
                      </div>
                    ))}
                    {(!c.items || c.items.length === 0) && <div className="text-sm text-gray-500">Bu kategoride ürün yok.</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* =======================
          MODALS
      ======================= */}
      <CategoryEditorModal
        state={categoryModal}
        onClose={closeCategoryModal}
        saving={createLocalCatMut.isPending || updateLocalCatMut.isPending || catOverrideMut.isPending}
        onSave={(payload) => {
          if (!rid) return;
          if (!categoryModal.open) return;

          if (categoryModal.mode === "create_local") {
            createLocalCatMut.mutate({ title: payload.title, description: payload.description, order: payload.order } as any);
            closeCategoryModal();
            return;
          }

          if (categoryModal.mode === "edit_local") {
            const cid = categoryModal.categoryId;
            if (!cid) return;
            updateLocalCatMut.mutate({ cid, payload: { title: payload.title, description: payload.description, order: payload.order } });
            closeCategoryModal();
            return;
          }

          // org override: sadece order
          const orgCategoryId = categoryModal.orgCategoryId;
          if (!orgCategoryId) return;
          catOverrideMut.mutate({ orgCategoryId, payload: { order: payload.order, hidden: false } });
          closeCategoryModal();
        }}
      />

      <ItemEditorModal
        state={itemModal}
        disabled={selectedResolved?.isActive === false}
        saving={createLocalItemMut.isPending || updateLocalItemMut.isPending || itemOverrideMut.isPending}
        onClose={closeItemModal}
        onQuickDisable={
          itemModal.open
            ? () => {
                if (itemModal.mode === "edit_org_override" && itemModal.orgItemId) {
                  itemOverrideMut.mutate({ orgItemId: itemModal.orgItemId, payload: { hidden: true } });
                  closeItemModal();
                  return;
                }
                if (itemModal.mode === "edit_local" && itemModal.itemId) {
                  updateLocalItemMut.mutate({ iid: itemModal.itemId, isActive: false } as any);
                  closeItemModal();
                  return;
                }
              }
            : null
        }
        onSave={(payload) => {
          if (!itemModal.open) return;

          if (itemModal.mode === "edit_org_override") {
            if (!itemModal.orgItemId) return;
            itemOverrideMut.mutate({
              orgItemId: itemModal.orgItemId,
              payload: {
                hidden: false,
                price: payload.price,
                order: payload.order,
                isAvailable: payload.isAvailable,
              },
            });
            closeItemModal();
            return;
          }

          const tags = String(payload.tagsText || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);

          if (itemModal.mode === "edit_local" && itemModal.itemId) {
            updateLocalItemMut.mutate({
              iid: String(itemModal.itemId),
              title: payload.title,
              description: payload.description,
              price: payload.price,
              tags,
              order: payload.order,
              isAvailable: !!payload.isAvailable,
              photoFile: payload.photoFile,
            } as any);
            closeItemModal();
            return;
          }

          // create local
          if (!selectedLocalCatId) return;
          createLocalItemMut.mutate({
            categoryId: selectedLocalCatId,
            title: payload.title,
            description: payload.description,
            price: payload.price,
            tags,
            order: payload.order,
            isAvailable: !!payload.isAvailable,
            photoFile: payload.photoFile,
          } as any);
          closeItemModal();
        }}
      />
    </div>
  );
}