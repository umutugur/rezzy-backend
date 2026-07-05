import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";
import {
  AdminServiceCategory,
  AdminCoreCategory,
  ServiceSurface,
  ServiceCategoryInput,
  adminListServiceCategories,
  adminCreateServiceCategory,
  adminUpdateServiceCategory,
  adminDeleteServiceCategory,
  adminListCoreCategories,
  adminCreateCoreCategory,
} from "../../api/serviceCategories";
import { uploadImage } from "../../api/campaigns";

// ─── Shared style constants (mirrors CampaignsPage.tsx / Banners.tsx) ──────
const inputCls =
  "w-full rounded-lg border border-[var(--rezvix-border-strong)] bg-[var(--rezvix-bg-elevated)] text-[var(--rezvix-text-main)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rezvix-primary)] placeholder:text-[var(--rezvix-text-soft)]";

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--rezvix-text-soft)",
  marginBottom: 14,
  paddingBottom: 8,
  borderBottom: "1px solid var(--rezvix-border-subtle)",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 24px",
  borderRadius: 10,
  background: "var(--rezvix-primary)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 10,
  background: "var(--rezvix-bg-soft)",
  border: "1.5px solid var(--rezvix-border-strong)",
  color: "var(--rezvix-text-muted)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

// ─── Constants ──────────────────────────────────────────────────────────────
const SURFACES: ServiceSurface[] = ["market", "delivery"];
const SURFACE_TAB_LABELS: Record<ServiceSurface, string> = {
  market: "Market",
  delivery: "Paket Servis",
};
const REGIONS = ["TR", "CY", "UK"] as const;

const MARKET_STORE_TYPE_KEYS = [
  "supermarket",
  "greengrocer",
  "bakery",
  "organic",
  "pharmacy",
] as const;

const MARKET_STORE_TYPE_LABELS: Record<string, string> = {
  supermarket: "Süpermarket",
  greengrocer: "Manav",
  bakery: "Fırın",
  organic: "Organik",
  pharmacy: "Eczane",
};

type MarketFilterMode = "none" | "storeCategory" | "coreCategory";

// ─── Helpers ────────────────────────────────────────────────────────────────
function splitTags(v: string): string[] {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyDraft(surface: ServiceSurface): ServiceCategoryInput {
  return {
    surface,
    key: "",
    name: { tr: "", en: "", el: "", ru: "" },
    imageUrl: "",
    fallbackEmoji: "",
    regions: ["TR", "CY", "UK"],
    order: 0,
    isActive: true,
    storeCategory: null,
    coreCategoryId: null,
    keywords: [],
  };
}

function fromCategory(c: AdminServiceCategory): ServiceCategoryInput {
  return {
    surface: c.surface,
    key: c.key,
    name: {
      tr: c.name?.tr ?? "",
      en: c.name?.en ?? "",
      el: c.name?.el ?? "",
      ru: c.name?.ru ?? "",
    },
    imageUrl: c.imageUrl ?? "",
    fallbackEmoji: c.fallbackEmoji ?? "",
    regions: c.regions ?? [],
    order: c.order ?? 0,
    isActive: !!c.isActive,
    storeCategory: c.storeCategory ?? null,
    coreCategoryId: c.coreCategoryId ?? null,
    keywords: c.keywords ?? [],
  };
}

function marketFilterModeOf(c: AdminServiceCategory | ServiceCategoryInput): MarketFilterMode {
  if (c.storeCategory) return "storeCategory";
  if (c.coreCategoryId) return "coreCategory";
  return "none";
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ServiceCategoriesPage() {
  const qc = useQueryClient();
  const { t } = useI18n();

  const [surface, setSurface] = React.useState<ServiceSurface>("market");

  const { data: resp, isLoading } = useQuery({
    queryKey: ["admin-service-categories", surface],
    queryFn: () => adminListServiceCategories(surface),
  });
  const categories = React.useMemo(
    () => [...(resp?.items ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [resp?.items]
  );

  const { data: coreResp } = useQuery({
    queryKey: ["admin-core-categories"],
    queryFn: () => adminListCoreCategories(),
    enabled: surface === "market",
  });
  const coreCategories = React.useMemo(
    () =>
      [...(coreResp?.items ?? [])].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return (a.order ?? 0) - (b.order ?? 0);
      }),
    [coreResp?.items]
  );

  // ── Editor state ──
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<ServiceCategoryInput>(emptyDraft("market"));
  const [marketFilterMode, setMarketFilterMode] = React.useState<MarketFilterMode>("none");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // inline core-category creator
  const [newCoreTitle, setNewCoreTitle] = React.useState("");
  const [creatingCore, setCreatingCore] = React.useState(false);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft(surface));
    setMarketFilterMode("none");
    setFormError(null);
    setNewCoreTitle("");
    setEditorOpen(true);
  };

  const openEdit = (c: AdminServiceCategory) => {
    setEditingId(c._id);
    const d = fromCategory(c);
    setDraft(d);
    setMarketFilterMode(marketFilterModeOf(d));
    setFormError(null);
    setNewCoreTitle("");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
  };

  const setD = (patch: Partial<ServiceCategoryInput>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const saveMut = useMutation({
    mutationFn: async () => {
      const body: ServiceCategoryInput = { ...draft };
      if (draft.surface === "market") {
        if (marketFilterMode === "storeCategory") {
          body.coreCategoryId = null;
        } else if (marketFilterMode === "coreCategory") {
          body.storeCategory = null;
        } else {
          body.storeCategory = null;
          body.coreCategoryId = null;
        }
        body.keywords = [];
      } else {
        body.storeCategory = null;
        body.coreCategoryId = null;
      }
      if (editingId) {
        // key immutable after create
        const { key, ...rest } = body;
        return adminUpdateServiceCategory(editingId, rest);
      }
      if (!body.key?.trim()) delete body.key;
      return adminCreateServiceCategory(body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-service-categories"] });
      closeEditor();
    },
    onError: (e: any) => {
      setFormError(
        e?.response?.data?.message || e?.message || t("Kaydedilemedi")
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => adminDeleteServiceCategory(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-service-categories"] });
    },
  });

  const toggleActiveMut = useMutation({
    mutationFn: async (c: AdminServiceCategory) =>
      adminUpdateServiceCategory(c._id, { ...fromCategory(c), isActive: !c.isActive }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-service-categories"] });
    },
  });

  const reorderMut = useMutation({
    mutationFn: async (payload: { a: AdminServiceCategory; b: AdminServiceCategory }) => {
      const { a, b } = payload;
      await adminUpdateServiceCategory(a._id, { ...fromCategory(a), order: b.order });
      await adminUpdateServiceCategory(b._id, { ...fromCategory(b), order: a.order });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-service-categories"] });
    },
  });

  const createCoreMut = useMutation({
    mutationFn: async (title: string) =>
      adminCreateCoreCategory({
        i18n: { tr: { title } },
        businessTypes: ["market"],
      }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: ["admin-core-categories"] });
      setD({ coreCategoryId: created._id });
      setNewCoreTitle("");
    },
    onError: (e: any) => {
      setFormError(
        e?.response?.data?.message || e?.message || t("Ürün kategorisi oluşturulamadı")
      );
    },
    onSettled: () => setCreatingCore(false),
  });

  const moveOrder = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    reorderMut.mutate({ a: categories[idx], b: categories[targetIdx] });
  };

  const toggleRegion = (r: string) => {
    setDraft((d) => {
      const has = (d.regions ?? []).includes(r);
      const next = has
        ? (d.regions ?? []).filter((x) => x !== r)
        : [...(d.regions ?? []), r];
      return { ...d, regions: next };
    });
  };

  const validateAndSave = () => {
    setFormError(null);
    if (!draft.name?.tr?.trim()) {
      setFormError(t("Türkçe ad zorunlu"));
      return;
    }
    saveMut.mutate();
  };

  const coreTitleById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of coreCategories) map[c._id] = c.i18n?.tr?.title ?? c.key;
    return map;
  }, [coreCategories]);

  const describeFilter = (c: AdminServiceCategory): string => {
    if (c.surface === "delivery") {
      return c.keywords?.length
        ? `${t("Kelimeler")}: ${c.keywords.join(", ")}`
        : t("Kelime yok");
    }
    if (c.storeCategory) {
      return `${t("Mağaza tipi")}: ${t(MARKET_STORE_TYPE_LABELS[c.storeCategory] ?? c.storeCategory)}`;
    }
    if (c.coreCategoryId) {
      return `${t("Ürün kategorisi")}: ${coreTitleById[c.coreCategoryId] ?? c.coreCategoryId}`;
    }
    return t("Filtresiz");
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1280 }}>
      <AdminPageHeader
        title={t("Kategoriler")}
        subtitle={t("Market ve paket servis kategori chip'lerini yönetin")}
        actions={
          <>
            <button
              style={ghostBtn}
              onClick={() =>
                qc.invalidateQueries({ queryKey: ["admin-service-categories"] })
              }
            >
              ↺ {t("Yenile")}
            </button>
            <button style={primaryBtn} onClick={openCreate}>
              + {t("Yeni Kategori")}
            </button>
          </>
        }
      />

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {SURFACES.map((s) => {
          const on = surface === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSurface(s)}
              style={{
                padding: "8px 20px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                border: on
                  ? "1.5px solid var(--rezvix-primary)"
                  : "1.5px solid var(--rezvix-border-strong)",
                background: on ? "var(--rezvix-primary)" : "var(--rezvix-bg-soft)",
                color: on ? "#fff" : "var(--rezvix-text-muted)",
              }}
            >
              {t(SURFACE_TAB_LABELS[s])}
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      <div
        style={{
          background: "var(--rezvix-bg-elevated)",
          border: "1.5px solid var(--rezvix-border-subtle)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--rezvix-bg-soft)", textAlign: "left" }}>
                {[
                  t("Görsel"),
                  t("Ad"),
                  t("Key"),
                  t("Bölgeler"),
                  t("Filtre"),
                  t("Sıra"),
                  t("Durum"),
                  t("İşlem"),
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--rezvix-text-soft)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "24px 16px",
                      color: "var(--rezvix-text-soft)",
                      textAlign: "center",
                    }}
                  >
                    {t("Yükleniyor…")}
                  </td>
                </tr>
              )}

              {categories.map((c, idx) => (
                <tr
                  key={c._id}
                  style={{
                    borderTop: "1px solid var(--rezvix-border-subtle)",
                    background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                    verticalAlign: "top",
                  }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    {c.imageUrl ? (
                      <img
                        src={c.imageUrl}
                        alt={c.name?.tr}
                        style={{
                          width: 40,
                          height: 40,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid var(--rezvix-border-subtle)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          background: "var(--rezvix-bg-soft)",
                          border: "1px solid var(--rezvix-border-subtle)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                        }}
                      >
                        {c.fallbackEmoji || "🏷️"}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "var(--rezvix-text-main)", marginBottom: 4 }}>
                      {c.name?.tr || "-"}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {c.name?.en && <MiniBadge>EN</MiniBadge>}
                      {c.name?.el && <MiniBadge>EL</MiniBadge>}
                      {c.name?.ru && <MiniBadge>RU</MiniBadge>}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--rezvix-text-soft)",
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                  >
                    {c.key}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--rezvix-text-muted)" }}>
                    {c.regions?.join(", ") || "-"}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--rezvix-text-muted)",
                      fontSize: 12,
                      maxWidth: 220,
                    }}
                  >
                    {describeFilter(c)}
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: "var(--rezvix-text-muted)", minWidth: 18 }}>
                        {c.order}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveOrder(idx, -1)}
                        disabled={idx === 0 || reorderMut.isPending}
                        style={arrowBtnStyle}
                        title={t("Yukarı taşı")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOrder(idx, 1)}
                        disabled={idx === categories.length - 1 || reorderMut.isPending}
                        style={arrowBtnStyle}
                        title={t("Aşağı taşı")}
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      type="button"
                      onClick={() => toggleActiveMut.mutate(c)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        border: "none",
                        cursor: "pointer",
                        background: c.isActive
                          ? "rgba(22, 163, 74, 0.1)"
                          : "rgba(220, 38, 38, 0.08)",
                        color: c.isActive
                          ? "var(--rezvix-success)"
                          : "var(--rezvix-danger)",
                      }}
                    >
                      <span style={{ fontSize: 9 }}>●</span>
                      {c.isActive ? t("Aktif") : t("Pasif")}
                    </button>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => openEdit(c)} style={smallBtnStyle}>
                        {t("Düzenle")}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t("Kategori silinsin mi?"))) deleteMut.mutate(c._id);
                        }}
                        style={{
                          ...smallBtnStyle,
                          background: "rgba(220, 38, 38, 0.08)",
                          border: "1px solid rgba(220, 38, 38, 0.2)",
                          color: "var(--rezvix-danger)",
                        }}
                      >
                        {t("Sil")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && categories.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "var(--rezvix-text-soft)",
                    }}
                  >
                    {t("Kayıt yok")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Editor drawer ── */}
      {editorOpen && (
        <Drawer
          title={editingId ? t("Kategoriyi Düzenle") : t("Yeni Kategori")}
          onClose={closeEditor}
        >
          <Section title={t("İsimler")}>
            <FormField label={t("Türkçe (TR)")} required>
              <input
                className={inputCls}
                value={draft.name?.tr ?? ""}
                onChange={(e) => setD({ name: { ...draft.name, tr: e.target.value } })}
              />
            </FormField>
            <Row>
              <FormField label={t("İngilizce (EN)")}>
                <input
                  className={inputCls}
                  value={draft.name?.en ?? ""}
                  onChange={(e) => setD({ name: { ...draft.name, en: e.target.value } })}
                />
              </FormField>
              <FormField label={t("Yunanca (EL)")}>
                <input
                  className={inputCls}
                  value={draft.name?.el ?? ""}
                  onChange={(e) => setD({ name: { ...draft.name, el: e.target.value } })}
                />
              </FormField>
            </Row>
            <FormField label={t("Rusça (RU)")}>
              <input
                className={inputCls}
                value={draft.name?.ru ?? ""}
                onChange={(e) => setD({ name: { ...draft.name, ru: e.target.value } })}
              />
            </FormField>

            {editingId && (
              <FormField label={t("Key")} hint={t("Oluşturulduktan sonra değiştirilemez")}>
                <input className={inputCls} value={draft.key ?? ""} disabled />
              </FormField>
            )}
          </Section>

          <Section title={t("Görsel & İkon")}>
            <FormField
              label={t("Görsel URL")}
              hint={t("Kare (1:1) · ~400×400 px")}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {draft.imageUrl ? (
                  <img
                    src={draft.imageUrl}
                    alt="category"
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid var(--rezvix-border-subtle)",
                      flexShrink: 0,
                    }}
                  />
                ) : null}
                <input
                  className={inputCls}
                  placeholder="https://..."
                  value={draft.imageUrl ?? ""}
                  onChange={(e) => setD({ imageUrl: e.target.value })}
                />
                <input
                  type="file"
                  accept="image/*"
                  id="service-category-upload"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    setFormError(null);
                    try {
                      const url = await uploadImage(f);
                      setD({ imageUrl: url });
                    } catch (err: any) {
                      setFormError(
                        err?.response?.data?.message || err?.message || t("Yükleme başarısız")
                      );
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <button
                  type="button"
                  style={{ ...ghostBtn, whiteSpace: "nowrap", opacity: uploading ? 0.6 : 1 }}
                  disabled={uploading}
                  onClick={() => document.getElementById("service-category-upload")?.click()}
                >
                  {uploading ? t("Yükleniyor…") : t("Yükle")}
                </button>
              </div>
            </FormField>

            <FormField label={t("Fallback Emoji")} hint={t("Görsel yoksa gösterilecek emoji")}>
              <input
                className={inputCls}
                placeholder="🛒"
                value={draft.fallbackEmoji ?? ""}
                onChange={(e) => setD({ fallbackEmoji: e.target.value })}
              />
            </FormField>
          </Section>

          <Section title={t("Bölgeler")}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REGIONS.map((r) => {
                const on = (draft.regions ?? []).includes(r);
                return (
                  <Chip key={r} on={on} onClick={() => toggleRegion(r)}>
                    {r}
                  </Chip>
                );
              })}
            </div>
          </Section>

          <Row>
            <FormField label={t("Sıra")}>
              <input
                type="number"
                className={inputCls}
                value={draft.order ?? 0}
                onChange={(e) => setD({ order: Number(e.target.value) })}
              />
            </FormField>
            <div />
          </Row>

          {draft.surface === "market" ? (
            <Section title={t("Filtre")}>
              <FormField label={t("Filtre Tipi")}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <RadioRow
                    checked={marketFilterMode === "none"}
                    onChange={() => setMarketFilterMode("none")}
                    label={t("Filtresiz")}
                  />
                  <RadioRow
                    checked={marketFilterMode === "storeCategory"}
                    onChange={() => setMarketFilterMode("storeCategory")}
                    label={t("Mağaza tipi")}
                  />
                  <RadioRow
                    checked={marketFilterMode === "coreCategory"}
                    onChange={() => setMarketFilterMode("coreCategory")}
                    label={t("Ürün kategorisi")}
                  />
                </div>
              </FormField>

              {marketFilterMode === "storeCategory" && (
                <FormField label={t("Mağaza Tipi")}>
                  <select
                    className={inputCls}
                    value={draft.storeCategory ?? ""}
                    onChange={(e) => setD({ storeCategory: e.target.value || null })}
                  >
                    <option value="">{t("Seçin")}</option>
                    {MARKET_STORE_TYPE_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {t(MARKET_STORE_TYPE_LABELS[k])}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}

              {marketFilterMode === "coreCategory" && (
                <FormField label={t("Ürün Kategorisi")}>
                  <select
                    className={inputCls}
                    value={draft.coreCategoryId ?? ""}
                    onChange={(e) => setD({ coreCategoryId: e.target.value || null })}
                  >
                    <option value="">{t("Seçin")}</option>
                    {coreCategories.map((cc) => (
                      <option key={cc._id} value={cc._id}>
                        {cc.i18n?.tr?.title ?? cc.key}
                        {!cc.isActive ? ` (${t("pasif")})` : ""}
                      </option>
                    ))}
                  </select>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <input
                      className={inputCls}
                      placeholder={t("Yeni ürün kategorisi (TR)")}
                      value={newCoreTitle}
                      onChange={(e) => setNewCoreTitle(e.target.value)}
                    />
                    <button
                      type="button"
                      style={{ ...ghostBtn, whiteSpace: "nowrap", opacity: creatingCore ? 0.6 : 1 }}
                      disabled={creatingCore || !newCoreTitle.trim()}
                      onClick={() => {
                        setCreatingCore(true);
                        createCoreMut.mutate(newCoreTitle.trim());
                      }}
                    >
                      {creatingCore ? t("Ekleniyor…") : t("Ekle")}
                    </button>
                  </div>
                </FormField>
              )}
            </Section>
          ) : (
            <Section title={t("Filtre")}>
              <FormField
                label={t("Kelimeler")}
                hint={t("Ürün eşleştirmesi için virgülle ayrılmış anahtar kelimeler")}
              >
                <input
                  className={inputCls}
                  placeholder={t("örn. pizza, burger, tavuk")}
                  value={(draft.keywords ?? []).join(", ")}
                  onChange={(e) => setD({ keywords: splitTags(e.target.value) })}
                />
              </FormField>
            </Section>
          )}

          <Section title={t("Yayın")}>
            <Toggle
              label={t("Aktif")}
              checked={!!draft.isActive}
              onChange={(v) => setD({ isActive: v })}
            />
          </Section>

          {formError && (
            <div
              style={{
                color: "var(--rezvix-danger)",
                fontSize: 13,
                marginTop: 8,
                marginBottom: 8,
              }}
            >
              {formError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              paddingTop: 12,
              borderTop: "1px solid var(--rezvix-border-subtle)",
              marginTop: 8,
              position: "sticky",
              bottom: 0,
              background: "var(--rezvix-bg-elevated)",
            }}
          >
            <button style={ghostBtn} onClick={closeEditor}>
              {t("İptal")}
            </button>
            <button
              style={{
                ...primaryBtn,
                opacity: saveMut.isPending || uploading ? 0.6 : 1,
                cursor: saveMut.isPending ? "not-allowed" : "pointer",
              }}
              disabled={saveMut.isPending || uploading}
              onClick={validateAndSave}
            >
              {saveMut.isPending
                ? t("Kaydediliyor…")
                : editingId
                ? t("Güncelle")
                : t("Oluştur")}
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

const arrowBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-soft)",
  color: "var(--rezvix-text-muted)",
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  background: "var(--rezvix-bg-soft)",
  border: "1px solid var(--rezvix-border-strong)",
  color: "var(--rezvix-text-muted)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 6,
        background: "var(--rezvix-bg-soft)",
        border: "1px solid var(--rezvix-border-subtle)",
        fontSize: 9.5,
        fontWeight: 700,
        color: "var(--rezvix-text-soft)",
      }}
    >
      {children}
    </span>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        border: on
          ? "1.5px solid var(--rezvix-primary)"
          : "1.5px solid var(--rezvix-border-strong)",
        background: on ? "var(--rezvix-primary)" : "var(--rezvix-bg-soft)",
        color: on ? "#fff" : "var(--rezvix-text-muted)",
        transition: "all 0.12s",
      }}
    >
      {children}
    </button>
  );
}

function RadioRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "var(--rezvix-text-main)",
        cursor: "pointer",
        fontWeight: 500,
      }}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        style={{ accentColor: "var(--rezvix-primary)", width: 15, height: 15 }}
      />
      {label}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={sectionHeadingStyle as any}>{title}</div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--rezvix-text-main)",
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 500,
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: "var(--rezvix-primary)", width: 15, height: 15 }}
        />
        {label}
      </label>
      {hint && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--rezvix-text-soft)",
            marginTop: 4,
            marginLeft: 23,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Drawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
        background: "rgba(0,0,0,0.45)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          height: "100%",
          background: "var(--rezvix-bg-elevated)",
          boxShadow: "var(--rezvix-shadow-soft)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 22px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
            position: "sticky",
            top: 0,
            background: "var(--rezvix-bg-elevated)",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: 18,
              color: "var(--rezvix-text-main)",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: 9,
              border: "1.5px solid var(--rezvix-border-strong)",
              background: "transparent",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {"✕"}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}
