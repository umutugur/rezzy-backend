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
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  order: number;
  isActive: boolean;
  orgCategoryId?: string | null;
};

type Item = {
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
  orgItemId?: string | null;
};

type ResolvedSource = "org" | "org_override" | "local";

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

function money(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("tr-TR");
}

function norm(s?: string | null) {
  return String(s ?? "").trim().toLowerCase();
}

function getId(x: any): string {
  const v = x?._id ?? x?.id;
  if (v && typeof v === "string") return v;
  // deterministic fallback (çok nadir devreye girer)
  return `__missing_id__:${norm(x?.title)}:${Number(x?.order ?? 0)}`;
}

function badgeFor(src: ResolvedSource) {
  if (src === "org") return { text: "Merkez Menü", cls: "bg-blue-50 text-blue-700 border border-blue-100" };
  if (src === "org_override")
    return { text: "Şubede Düzenlendi", cls: "bg-emerald-50 text-emerald-700 border border-emerald-100" };
  return { text: "Şubeye Özel", cls: "bg-gray-100 text-gray-700 border border-gray-200" };
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
    .sort((a, b) => String(getId(a)).localeCompare(String(getId(b))));

  return candidates[0] ?? null;
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

// -------------------- Extracted Modals --------------------
type CategoryModalState =
  | { open: false }
  | {
      open: true;
      mode: "create" | "edit";
      title: string;
      categoryId?: string | null; // edit için local category id
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
            disabled={!form.title.trim() || saving}
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
        <div>
          <label className="text-xs text-gray-500">Sıra</label>
          <input
            type="number"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.order}
            onChange={(e) => setForm((p) => ({ ...p, order: Number(e.target.value) || 0 }))}
          />
        </div>
      </div>
    </Modal>
  );
}

type ItemModalState =
  | { open: false }
  | {
      open: true;
      mode: "create" | "edit";
      title: string;
      itemId?: string | null;
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

  return (
    <Modal
      open={open}
      title={state.title}
      onClose={onClose}
      footer={
        <div className="flex justify-between gap-2">
          {state.mode === "edit" && onQuickDisable && (
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
              disabled={disabled || !form.title.trim() || saving}
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

        <div className="md:col-span-2">
          <label className="text-xs text-gray-500">Etiketler (virgülle)</label>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.tagsText}
            onChange={(e) => setForm((p) => ({ ...p, tagsText: e.target.value }))}
          />
        </div>

        <div className="md:col-span-2 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isAvailable}
              onChange={(e) => setForm((p) => ({ ...p, isAvailable: e.target.checked }))}
            />
            Serviste
          </label>

          <label className="text-sm">
            <span className="text-xs text-gray-500 mr-2">Fotoğraf</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setForm((p) => ({ ...p, photoFile: e.target.files?.[0] ?? null }))}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}

/* =======================
   View model
======================= */
type CategoryVM = {
  key: string;              // UI selection key (unique)
  id: string;               // resolved id
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

  // ---------------- Build categories (new UI list) ----------------
  const { active, closed, all } = React.useMemo(() => {
    const activeVM: CategoryVM[] = resolvedCats.map((c, idx) => {
      const src: ResolvedSource = (c.source ?? "local") as ResolvedSource;
      const id = getId(c);
      const key = `${src}:${id}:${idx}`; // idx eklemek collision riskini sıfırlar
      return {
        key,
        id,
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

    const closedVM: CategoryVM[] = sortByOrder(
      closedLocalCats.map((lc, idx) => {
        const src: ResolvedSource = lc.orgCategoryId ? "org_override" : "local";
        const id = getId(lc);
        const key = `closed:${src}:${id}:${idx}`;
        return {
          key,
          id,
          title: lc.title,
          description: lc.description ?? null,
          order: lc.order ?? 0,
          isActive: false,
          source: src,
          resolved: null,
          local: lc,
          kind: "closed_local",
        } satisfies CategoryVM;
      })
    );

    return {
      active: sortByOrder(activeVM),
      closed: closedVM,
      all: [...sortByOrder(activeVM), ...closedVM],
    };
  }, [resolvedCats, localCats]);

  // ---------------- Selection ----------------
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!all.length) {
      if (selectedKey) setSelectedKey(null);
      return;
    }
    if (selectedKey && all.some((x) => x.key === selectedKey)) return;
    setSelectedKey(active[0]?.key ?? all[0].key);
  }, [all, active, selectedKey]);

  const selected = React.useMemo(() => all.find((x) => x.key === selectedKey) ?? null, [all, selectedKey]);
  const selectedResolved = selected?.resolved ?? null;

  // ---------------- Map selected -> local category id ----------------
  const findLocalForResolved = React.useCallback(
    (rc: ResolvedMenuCategory | null): Category | null => {
      if (!rc) return null;
      const src: ResolvedSource = (rc.source ?? "local") as ResolvedSource;

      if (src !== "org") {
        const rid2 = getId(rc);
        return localCats.find((lc) => getId(lc) === rid2) || null;
      }

      const orgId = getId(rc);
      const byLink = localCats.find((lc) => String(lc.orgCategoryId || "") === String(orgId)) || null;
      if (byLink) return byLink;

      return findOverrideCategoryForOrgHeuristic(localCats, rc);
    },
    [localCats]
  );

  const [selectedLocalCatId, setSelectedLocalCatId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selected) {
      setSelectedLocalCatId(null);
      return;
    }
    if (selected.kind === "closed_local") {
      setSelectedLocalCatId(selected.local ? getId(selected.local) : null);
      return;
    }
    const lc = findLocalForResolved(selectedResolved);
    setSelectedLocalCatId(lc ? getId(lc) : null);
  }, [selected, selectedResolved, findLocalForResolved]);

  const selectedIsClosed = selected ? selected.isActive === false : false;
  const opsDisabled = selectedIsClosed;

  // ---------------- Mutations: Categories ----------------
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

  // Merkez kategori için: şube override kaydı garanti et
  const ensureEditableCategoryForOrg = React.useCallback(
    async (orgCat: ResolvedMenuCategory) => {
      const orgId = getId(orgCat);
      const existing =
        localCats.find((lc) => String(lc.orgCategoryId || "") === String(orgId)) ||
        findOverrideCategoryForOrgHeuristic(localCats, orgCat);

      if (existing) {
        setSelectedLocalCatId(getId(existing));
        return getId(existing);
      }

      const payload: any = {
        title: orgCat.title,
        description: orgCat.description ?? "",
        order: orgCat.order ?? 0,
        orgCategoryId: orgId,
        isActive: true,
      };

      return await new Promise<string | null>((resolve) => {
        createCatMut.mutate(payload, {
          onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
            await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });

            // create sonrası localCats state hemen güncellenmeyebilir; refetch sonrası tekrar yakalanacak.
            resolve("__created__");
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

  // ---------------- UI state: filters + modals ----------------
  const [tab, setTab] = React.useState<"active" | "closed">("active");
  const [q, setQ] = React.useState("");

  const list = React.useMemo(() => {
    const base = tab === "active" ? active : closed;
    const qq = norm(q);
    if (!qq) return base;
    return base.filter((c) => norm(c.title).includes(qq) || norm(c.description || "").includes(qq));
  }, [tab, active, closed, q]);

  // ---------------- Modals (extracted) ----------------
  const [categoryModal, setCategoryModal] = React.useState<CategoryModalState>({ open: false });
  const [itemModal, setItemModal] = React.useState<ItemModalState>({ open: false });

  const closeCategoryModal = React.useCallback(() => setCategoryModal({ open: false }), []);
  const closeItemModal = React.useCallback(() => setItemModal({ open: false }), []);

  const openCreateCategory = React.useCallback(() => {
    setCategoryModal({
      open: true,
      mode: "create",
      title: "Yeni Kategori (Şubeye Özel)",
      initial: { title: "", description: "", order: 0 },
    });
  }, []);

  const openEditSelectedCategory = React.useCallback(
    async (opts?: { forceOrgOverride?: boolean }) => {
      if (!selected) return;

      // Kapalı listeden seçiliyse zaten local var
      if (selected.kind === "closed_local" && selected.local) {
        const lc = selected.local;
        setCategoryModal({
          open: true,
          mode: "edit",
          title: "Kategori Düzenle",
          categoryId: getId(lc),
          initial: {
            title: lc.title ?? "",
            description: lc.description ?? "",
            order: Number(lc.order ?? 0),
          },
        });
        return;
      }

      // Aktif resolved seçiliyse local kaydı bul / gerekiyorsa oluştur
      const rc = selectedResolved;
      if (!rc) return;

      if ((rc.source ?? "local") === "org") {
        // Merkez kategori: önce override garanti et
        await ensureEditableCategoryForOrg(rc);
        await qc.invalidateQueries({ queryKey: ["menu-categories", rid] });
        await qc.invalidateQueries({ queryKey: ["menu-resolved", rid] });
      }

      // local kaydı tekrar bul
      const lc = findLocalForResolved(rc);
      if (!lc) return;

      setCategoryModal({
        open: true,
        mode: "edit",
        title: "Kategori Düzenle",
        categoryId: getId(lc),
        initial: {
          title: lc.title ?? "",
          description: lc.description ?? "",
          order: Number(lc.order ?? 0),
        },
      });
    },
    [selected, selectedResolved, ensureEditableCategoryForOrg, findLocalForResolved, qc, rid]
  );

  const openCreateItem = React.useCallback(() => {
    setItemModal({
      open: true,
      mode: "create",
      title: "Yeni Ürün (Şubeye Özel)",
      initial: { title: "", description: "", price: 0, tagsText: "", order: 0, isAvailable: true },
    });
  }, []);

  const openEditItem = React.useCallback((base: any, title?: string) => {
    setItemModal({
      open: true,
      mode: "edit",
      title: title || "Ürün Düzenle",
      itemId: getId(base),
      initial: {
        title: base.title ?? "",
        description: base.description ?? "",
        price: Number(base.price ?? 0),
        tagsText: (base.tags ?? []).join(", "),
        order: Number(base.order ?? 0),
        isAvailable: base.isAvailable !== false,
      },
    });
  }, []);

  // ---------------- Derived: selected display ----------------
  const selectedBadge = selected ? badgeFor(selected.source) : null;

  const loadingManage = mode === "manage" && (catQ.isLoading || resolvedQ.isLoading || itemsQ.isLoading);
  const loadingPreview = mode === "preview" && resolvedQ.isLoading;
  const anyError = catQ.isError || resolvedQ.isError || itemsQ.isError;

  /* =======================
     UI
  ======================= */
  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Menü Yönetimi</h2>
          <div className="text-xs text-gray-500">
            Menü; <b>Merkez Menü</b> + <b>Şubede Düzenlenen</b> + <b>Şubeye Özel</b> birleşimidir.
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
            Müşteri Görünümü
          </button>

          <button className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50" onClick={refreshAll}>
            Yenile
          </button>
        </div>
      </div>

      {!rid && (
        <div className="text-sm text-red-600">RestaurantId bulunamadı. authStore akışını kontrol et.</div>
      )}

      {(loadingManage || loadingPreview) && <div className="text-sm text-gray-500">Yükleniyor…</div>}

      {anyError && (
        <div className="text-sm text-red-600">
          Menü verisi alınırken hata oluştu. Network/Yetki/Response’u kontrol et.
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
                    onClick={openCreateCategory}
                  >
                    + Kategori Ekle
                  </button>
                </div>
              }
            >
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    className={`flex-1 px-3 py-1.5 text-sm rounded border ${
                      tab === "active" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                    onClick={() => setTab("active")}
                  >
                    Aktif
                  </button>
                  <button
                    className={`flex-1 px-3 py-1.5 text-sm rounded border ${
                      tab === "closed" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                    onClick={() => setTab("closed")}
                  >
                    Kapalı
                  </button>
                </div>

                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Kategori ara…"
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
                          {!!c.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{c.description}</div>}
                          <div className="text-[11px] text-gray-400 mt-1">Sıra: {c.order} • {c.isActive ? "Açık" : "Kapalı"}</div>
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
                        {selected ? `Ürünler — ${selected.title}` : "Ürünler"}
                      </span>
                      {selectedBadge && (
                        <span className={`text-[11px] px-2 py-0.5 rounded ${selectedBadge.cls}`}>{selectedBadge.text}</span>
                      )}
                      {selectedIsClosed && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                          Kapalı
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Seçim bug’ı düzeldi: her kategori tekil key ile seçilir.
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60"
                      disabled={!selected || opsDisabled}
                      onClick={openCreateItem}
                      title={!selected ? "Önce kategori seç" : opsDisabled ? "Kategori kapalı" : "Ürün ekle"}
                    >
                      + Ürün Ekle
                    </button>

                    {/* Kategori aksiyonları */}
                    {selected && (
                      <>
                        <button
                          className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
                          disabled={!selected || opsDisabled}
                          onClick={() => openEditSelectedCategory()}
                          title={opsDisabled ? "Kategori kapalı" : "Kategori düzenle"}
                        >
                          Kategori Düzenle
                        </button>
                        {selected.kind === "active_resolved" && selectedResolved?.source === "org" && (
                          <button
                            className="px-3 py-1.5 text-sm rounded bg-amber-50 text-amber-900 hover:bg-amber-100"
                            onClick={async () => {
                              if (!selectedResolved) return;
                              await ensureEditableCategoryForOrg(selectedResolved);
                              refreshAll();
                            }}
                          >
                            Düzenlemeyi Başlat
                          </button>
                        )}

                        <button
                          className="px-3 py-1.5 text-sm rounded border border-gray-200 bg-white hover:bg-gray-50"
                          onClick={async () => {
                            if (!selected) return;

                            // Kapalıysa aç, açıksa kapat
                            const next = !selected.isActive ? true : false;

                            // org ise önce local override gerek
                            if (selectedResolved?.source === "org") {
                              const r = await ensureEditableCategoryForOrg(selectedResolved);
                              if (!r) return;
                              // localCats refetch sonrası gerçek id ile update yapılacak; burada “best effort”:
                              // en güvenlisi: refreshAll sonrası user tekrar tıklar. Ama pratikte localCats hızlı gelir.
                              refreshAll();
                              return;
                            }

                            // local/override: local id ya selectedLocalCatId ya da selected.local
                            const cid = selectedLocalCatId || (selected.local ? getId(selected.local) : null);
                            if (!cid) return;
                            updateCatMut.mutate({ cid, payload: { isActive: next } });
                          }}
                        >
                          {selected.isActive ? "Bu şubede kapat" : "Aç"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              }
            >
              {!selected && <div className="text-sm text-gray-500">Soldan bir kategori seç.</div>}

              {selected && (
                <>
                  {selectedIsClosed && (
                    <div className="border rounded-xl p-3 bg-gray-50">
                      <div className="font-medium">Bu kategori kapalı.</div>
                      <div className="text-sm text-gray-600 mt-1">Ürün ekleme/düzenleme için önce aç.</div>
                    </div>
                  )}

                  {/* Merkez menü seçili, local override yok banner */}
                  {selectedResolved?.source === "org" && !selectedLocalCatId && (
                    <div className="border rounded-xl p-3 bg-amber-50 text-amber-900">
                      Bu kategori <b>Merkez Menü</b>den geliyor. Şubeye özel ayarlar için <b>Düzenlemeyi Başlat</b> yap.
                    </div>
                  )}

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
                        {(sortByOrder(selectedResolved?.items ?? [])).length === 0 ? (
                          <tr>
                            <td className="px-3 py-4 text-gray-500" colSpan={5}>
                              Bu kategoride ürün yok.
                            </td>
                          </tr>
                        ) : (
                          sortByOrder(selectedResolved?.items ?? []).map((it, idx) => {
                            const src: ResolvedSource = (it.source ?? "local") as ResolvedSource;
                            const b = badgeFor(src);
                            const orgId = getId(it);

                            const localEdited =
                              src === "org"
                                ? localItems.find((li) => String(li.orgItemId || "") === String(orgId)) || null
                                : null;

                            const canEditRow = !opsDisabled && (src !== "org" || !!localEdited);
                            const showDelete = src === "local"; // sadece şubeye özel

                            return (
                              <tr key={`${src}:${orgId}:${idx}`} className="border-t">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{it.title}</div>
                                  {!!it.description && <div className="text-xs text-gray-500 line-clamp-2">{it.description}</div>}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <b>{money(it.price)} ₺</b>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="text-xs text-gray-600">
                                    {it.isActive === false ? "Kapalı" : "Açık"} • {it.isAvailable === false ? "Stok yok" : "Serviste"}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`text-[11px] px-2 py-0.5 rounded ${b.cls}`}>{b.text}</span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="inline-flex gap-2">
                                    {src === "org" && !localEdited ? (
                                      <button
                                        className="px-2 py-1 text-xs rounded bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                                        disabled={!selectedLocalCatId || opsDisabled}
                                        onClick={() => {
                                          if (!selectedLocalCatId || opsDisabled) return;
                                          createItemMut.mutate({
                                            categoryId: selectedLocalCatId,
                                            orgItemId: orgId,
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
                                        className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                        disabled={!canEditRow}
                                        onClick={() => {
                                          if (!canEditRow) return;

                                          const base = localEdited ?? (it as any);
                                          openEditItem(base);
                                        }}
                                      >
                                        Düzenle
                                      </button>
                                    )}

                                    {/* Şubede kapat */}
                                    <button
                                      className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60"
                                      disabled={!selectedLocalCatId || opsDisabled}
                                      onClick={() => {
                                        if (!selectedLocalCatId || opsDisabled) return;

                                        if (src === "org") {
                                          // localEdited varsa kapat; yoksa önce create sonra kapat
                                          if (localEdited) {
                                            updateItemMut.mutate({ iid: getId(localEdited), isActive: false });
                                            return;
                                          }
                                          createItemMut.mutate(
                                            {
                                              categoryId: selectedLocalCatId,
                                              orgItemId: orgId,
                                              title: it.title,
                                              description: it.description ?? "",
                                              price: it.price,
                                              tags: it.tags ?? [],
                                              order: it.order ?? 0,
                                              isAvailable: it.isAvailable !== false,
                                            } as any,
                                            {
                                              onSuccess: (res: any) => {
                                                const newId = getId(res?.item ?? res);
                                                if (newId) updateItemMut.mutate({ iid: newId, isActive: false });
                                              },
                                            } as any
                                          );
                                          return;
                                        }

                                        // local/override: resolved id üzerinden update
                                        updateItemMut.mutate({ iid: getId(it), isActive: false });
                                      }}
                                    >
                                      Bu şubede kapat
                                    </button>

                                    {showDelete && (
                                      <button
                                        className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                        disabled={opsDisabled}
                                        onClick={() => {
                                          if (opsDisabled) return;
                                          if (confirm(`"${it.title}" silinsin mi?`)) {
                                            deleteItemMut.mutate(getId(it));
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
          PREVIEW (same as before but simpler)
      ======================= */}
      {mode === "preview" && (
        <div className="space-y-4">
          <Card title="Müşteri Görünümü (Önizleme)">
            <div className="text-xs text-gray-500 mb-3">
              Veri: <code>GET /panel/restaurants/:rid/menu/resolved</code>
            </div>

            {!resolvedQ.data?.categories?.length && <div className="text-sm text-gray-500">Menü boş görünüyor.</div>}

            <div className="space-y-4">
              {sortByOrder(resolvedQ.data?.categories ?? []).map((c, idx) => {
                const src: ResolvedSource = (c.source ?? "local") as ResolvedSource;
                const badge = badgeFor(src);

                return (
                  <div key={`${src}:${getId(c)}:${idx}`} className="border rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{c.title}</div>
                      <span className={`text-[11px] px-2 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
                      {c.isActive === false && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                          Kapalı
                        </span>
                      )}
                    </div>
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
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* =======================
          MODALS (extracted)
      ======================= */}

      <CategoryEditorModal
        state={categoryModal}
        onClose={closeCategoryModal}
        saving={createCatMut.isPending || updateCatMut.isPending}
        onSave={(payload) => {
          if (!rid) return;

          if (!categoryModal.open) return;

          if (categoryModal.mode === "create") {
            createCatMut.mutate({
              title: payload.title,
              description: payload.description,
              order: payload.order,
            } as any);
            closeCategoryModal();
            return;
          }

          const cid = categoryModal.categoryId || selectedLocalCatId || (selected?.local ? getId(selected.local) : null);
          if (!cid) return;
          updateCatMut.mutate({ cid, payload: { title: payload.title, description: payload.description, order: payload.order } as any });
          closeCategoryModal();
        }}
      />

      <ItemEditorModal
        state={itemModal}
        disabled={!selectedLocalCatId || opsDisabled}
        saving={createItemMut.isPending || updateItemMut.isPending}
        onClose={closeItemModal}
        onQuickDisable={
          itemModal.open && itemModal.mode === "edit" && itemModal.itemId
            ? () => {
                updateItemMut.mutate({ iid: String(itemModal.itemId), isActive: false });
                closeItemModal();
              }
            : null
        }
        onSave={(payload) => {
          if (!selectedLocalCatId || opsDisabled) return;

          const tags = String(payload.tagsText || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);

          if (!itemModal.open) return;

          if (itemModal.mode === "edit" && itemModal.itemId) {
            updateItemMut.mutate({
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

          createItemMut.mutate({
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