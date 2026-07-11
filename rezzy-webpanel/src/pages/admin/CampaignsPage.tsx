import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";
import { EntityPicker } from "../../desktop/components/admin/EntityPicker";
import { pickOrganizations } from "../../api/adminPickers";
import {
  Campaign,
  CampaignInput,
  CampaignSurface,
  CampaignRegion,
  CampaignDiscountKind,
  CampaignScope,
  CampaignAudienceKind,
  CampaignTrigger,
  CampaignBudgetBasis,
  CampaignPaymentMethod,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  listParticipations,
  uploadImage,
} from "../../api/campaigns";

// ─── Shared style constants (mirrors Banners.tsx) ───────────────────────────
const inputCls =
  "w-full rounded-lg border border-[var(--rezvix-border-strong)] bg-[var(--rezvix-bg-elevated)] text-[var(--rezvix-text-main)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rezvix-primary)] placeholder:text-[var(--rezvix-text-soft)]";

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1.5px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "22px 24px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

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
const SURFACES: CampaignSurface[] = ["market", "restaurant", "taxi"];
const REGIONS: CampaignRegion[] = ["TR", "CY", "UK"];
const DISCOUNT_KINDS: CampaignDiscountKind[] = [
  "percent",
  "fixed",
  "free_delivery",
  "fixed_price",
];
const SCOPES: CampaignScope[] = ["platform", "category", "store", "chain"];
const PAYMENT_METHODS: CampaignPaymentMethod[] = ["all", "cash", "card", "online"];

const MARKET_CATEGORY_KEYS = [
  "supermarket",
  "bakery",
  "greengrocer",
  "organic",
  "pharmacy",
] as const;

const MARKET_CATEGORY_LABELS: Record<string, string> = {
  supermarket: "Süpermarket",
  bakery: "Fırın",
  greengrocer: "Manav",
  organic: "Organik",
  pharmacy: "Eczane",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function toDatetimeLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // strip seconds + TZ → "YYYY-MM-DDTHH:mm"
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocal(v: string): string {
  const s = String(v || "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toISOString();
}

function numOrNull(v: string): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function emptyDraft(): CampaignInput {
  const now = new Date();
  const inAMonth = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  return {
    title: "",
    description: "",
    image: "",
    surface: "market",
    region: "CY",
    discount: { kind: "percent", value: 0, maxDiscount: null },
    conditions: {
      minSubtotal: 0,
      scope: "platform",
      categoryKeys: [],
      storeIds: [],
      organizationId: null,
      paymentMethods: ["all"],
    },
    audience: {
      kind: "public",
      trigger: null,
      winBackDays: null,
      collectible: false,
    },
    funding: { platformSharePct: 100 },
    requiresOptIn: false,
    usageLimit: { perUser: 1, total: null, showRemaining: false },
    budget: { cap: null, basis: "platform" },
    validFrom: now.toISOString(),
    validTo: inAMonth.toISOString(),
    isActive: true,
  };
}

function fromCampaign(c: Campaign): CampaignInput {
  return {
    title: c.title ?? "",
    description: c.description ?? "",
    image: c.image ?? "",
    surface: c.surface,
    region: c.region,
    discount: {
      kind: c.discount?.kind ?? "percent",
      value: c.discount?.value ?? 0,
      maxDiscount: c.discount?.maxDiscount ?? null,
    },
    conditions: {
      minSubtotal: c.conditions?.minSubtotal ?? 0,
      scope: c.conditions?.scope ?? "platform",
      categoryKeys: c.conditions?.categoryKeys ?? [],
      storeIds: c.conditions?.storeIds ?? [],
      organizationId: c.conditions?.organizationId ?? null,
      paymentMethods: c.conditions?.paymentMethods ?? ["all"],
    },
    audience: {
      kind: c.audience?.kind ?? "public",
      trigger: c.audience?.trigger ?? null,
      winBackDays: c.audience?.winBackDays ?? null,
      collectible: c.audience?.collectible ?? false,
    },
    funding: { platformSharePct: c.funding?.platformSharePct ?? 100 },
    requiresOptIn: !!c.requiresOptIn,
    usageLimit: {
      perUser: c.usageLimit?.perUser ?? 1,
      total: c.usageLimit?.total ?? null,
      showRemaining: c.usageLimit?.showRemaining ?? false,
    },
    budget: { cap: c.budget?.cap ?? null, basis: c.budget?.basis ?? "platform" },
    validFrom: c.validFrom,
    validTo: c.validTo,
    isActive: !!c.isActive,
  };
}

const SURFACE_LABELS: Record<CampaignSurface, string> = {
  market: "Market",
  restaurant: "Restoran",
  taxi: "Taksi",
};

// ═══════════════════════════════════════════════════════════════════════════
export default function CampaignsPage() {
  const qc = useQueryClient();
  const { t } = useI18n();

  // ── Filters ──
  const [surface, setSurface] = React.useState<string>("");
  const [region, setRegion] = React.useState<string>("");
  const [isActive, setIsActive] = React.useState<string>("");

  const { data: resp, isLoading } = useQuery({
    queryKey: ["admin-campaigns", surface, region, isActive],
    queryFn: () =>
      listCampaigns({
        surface: (surface || "") as any,
        region: (region || "") as any,
        isActive: (isActive || "") as any,
      }),
  });
  const campaigns = resp?.items ?? [];

  // ── Editor panel state ──
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<CampaignInput>(emptyDraft());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);

  // ── Participations modal ──
  const [partsForId, setPartsForId] = React.useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormError(null);
    setEditorOpen(true);
  };
  const openEdit = (c: Campaign) => {
    setEditingId(c._id);
    setDraft(fromCampaign(c));
    setFormError(null);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editingId) return updateCampaign(editingId, draft);
      return createCampaign(draft);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      closeEditor();
    },
    onError: (e: any) => {
      setFormError(
        e?.response?.data?.message || e?.message || t("Kaydedilemedi")
      );
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => deleteCampaign(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    },
  });

  const validateAndSave = () => {
    setFormError(null);
    if (!draft.title.trim()) {
      setFormError(t("Başlık zorunlu"));
      return;
    }
    if (!draft.image.trim()) {
      setFormError(t("Görsel zorunlu"));
      return;
    }
    if (!draft.validFrom || !draft.validTo) {
      setFormError(t("Geçerlilik tarihleri zorunlu"));
      return;
    }
    saveMut.mutate();
  };

  // typed setter helpers
  const setD = (patch: Partial<CampaignInput>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const togglePayment = (m: CampaignPaymentMethod) => {
    setDraft((d) => {
      const has = d.conditions.paymentMethods.includes(m);
      const next = has
        ? d.conditions.paymentMethods.filter((x) => x !== m)
        : [...d.conditions.paymentMethods, m];
      return {
        ...d,
        conditions: { ...d.conditions, paymentMethods: next },
      };
    });
  };

  const toggleCategory = (k: string) => {
    setDraft((d) => {
      const has = d.conditions.categoryKeys.includes(k);
      const next = has
        ? d.conditions.categoryKeys.filter((x) => x !== k)
        : [...d.conditions.categoryKeys, k];
      return { ...d, conditions: { ...d.conditions, categoryKeys: next } };
    });
  };

  const isTaxi = draft.surface === "taxi";

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1280 }}>
      <AdminPageHeader
        title={t("Kampanyalar")}
        subtitle={t("İndirim ve promosyon kampanyalarını yönetin")}
        actions={
          <>
            <button
              style={ghostBtn}
              onClick={() =>
                qc.invalidateQueries({ queryKey: ["admin-campaigns"] })
              }
            >
              ↺ {t("Yenile")}
            </button>
            <button style={primaryBtn} onClick={openCreate}>
              + {t("Yeni Kampanya")}
            </button>
          </>
        }
      />

      {/* ── Filters ── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={sectionHeadingStyle as any}>{t("Filtreler")}</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
          }}
        >
          <FormField label={t("Yüzey")}>
            <select
              className={inputCls}
              value={surface}
              onChange={(e) => setSurface(e.target.value)}
            >
              <option value="">{t("Tümü")}</option>
              {SURFACES.map((s) => (
                <option key={s} value={s}>
                  {t(SURFACE_LABELS[s])}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("Bölge")}>
            <select
              className={inputCls}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">{t("Tümü")}</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("Durum")}>
            <select
              className={inputCls}
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
            >
              <option value="">{t("Hepsi")}</option>
              <option value="true">{t("Sadece aktif")}</option>
              <option value="false">{t("Sadece pasif")}</option>
            </select>
          </FormField>
        </div>
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
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--rezvix-text-soft)",
            }}
          >
            {t("Kampanyalar")}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
          >
            <thead>
              <tr style={{ background: "var(--rezvix-bg-soft)", textAlign: "left" }}>
                {[
                  t("Görsel"),
                  t("Başlık"),
                  t("Yüzey"),
                  t("Bölge"),
                  t("İndirim"),
                  t("Kitle"),
                  t("Geçerlilik"),
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
                    colSpan={9}
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

              {campaigns.map((c, idx) => (
                <tr
                  key={c._id}
                  style={{
                    borderTop: "1px solid var(--rezvix-border-subtle)",
                    background:
                      idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                    verticalAlign: "top",
                  }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    {c.image ? (
                      <img
                        src={c.image}
                        alt={c.title}
                        style={{
                          width: 96,
                          height: 54,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid var(--rezvix-border-subtle)",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 96,
                          height: 54,
                          borderRadius: 8,
                          background: "var(--rezvix-bg-soft)",
                          border: "1px solid var(--rezvix-border-subtle)",
                        }}
                      />
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--rezvix-text-main)",
                        marginBottom: 2,
                      }}
                    >
                      {c.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--rezvix-text-soft)",
                        maxWidth: 240,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.description}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Pill>{t(SURFACE_LABELS[c.surface])}</Pill>
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--rezvix-text-muted)",
                    }}
                  >
                    {c.region}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--rezvix-text-muted)",
                    }}
                  >
                    {describeDiscount(c)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Pill>
                      {c.audience?.kind === "targeted"
                        ? t("Hedefli")
                        : t("Herkese açık")}
                    </Pill>
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--rezvix-text-soft)",
                      fontSize: 11,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtDate(c.validFrom)}
                    <br />→ {fmtDate(c.validTo)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
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
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button
                        onClick={() => openEdit(c)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "var(--rezvix-bg-soft)",
                          border: "1px solid var(--rezvix-border-strong)",
                          color: "var(--rezvix-text-muted)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {t("Düzenle")}
                      </button>
                      <button
                        onClick={() => setPartsForId(c._id)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "var(--rezvix-bg-soft)",
                          border: "1px solid var(--rezvix-border-strong)",
                          color: "var(--rezvix-text-muted)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {t("Katılanlar")}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(t("Kampanya silinsin mi?")))
                            deleteMut.mutate(c._id);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          background: "rgba(220, 38, 38, 0.08)",
                          border: "1px solid rgba(220, 38, 38, 0.2)",
                          color: "var(--rezvix-danger)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {t("Sil")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!isLoading && campaigns.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
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

      {/* ── Editor side panel ── */}
      {editorOpen && (
        <Drawer
          title={editingId ? t("Kampanyayı Düzenle") : t("Yeni Kampanya")}
          onClose={closeEditor}
        >
          {/* TEMEL */}
          <Section title={t("Temel Bilgiler")}>
            <FormField label={t("Başlık")} required>
              <input
                className={inputCls}
                value={draft.title}
                onChange={(e) => setD({ title: e.target.value })}
              />
            </FormField>
            <FormField label={t("Açıklama")}>
              <textarea
                className={inputCls}
                rows={3}
                value={draft.description}
                onChange={(e) => setD({ description: e.target.value })}
              />
            </FormField>

            <FormField label={t("Görsel")} required hint={t("Kare (1:1) · 600×600 px önerilir")}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {draft.image ? (
                  <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
                    <img
                      src={draft.image}
                      alt="campaign"
                      style={{
                        width: 72,
                        height: 72,
                        objectFit: "cover",
                        borderRadius: 12,
                        border: "1px solid var(--rezvix-border-subtle)",
                        display: "block",
                      }}
                    />
                    {/* mobildeki kategori rozetinin yeri (sol üst) */}
                    <div
                      style={{
                        position: "absolute",
                        top: 5,
                        left: 5,
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        background: "rgba(17,24,39,0.55)",
                        border: "1px solid rgba(255,255,255,0.6)",
                      }}
                      title={t("Mobilde bu köşede kategori rozeti görünür")}
                    />
                  </div>
                ) : null}
                <input
                  type="file"
                  accept="image/*"
                  style={{ fontSize: 13, color: "var(--rezvix-text-muted)" }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    setFormError(null);
                    try {
                      const url = await uploadImage(f);
                      setD({ image: url });
                    } catch (err: any) {
                      setFormError(
                        err?.response?.data?.message ||
                          err?.message ||
                          t("Yükleme başarısız")
                      );
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                {uploading && (
                  <span
                    style={{ fontSize: 12, color: "var(--rezvix-text-soft)" }}
                  >
                    {t("Yükleniyor…")}
                  </span>
                )}
              </div>

              {/* ── Görsel kılavuzu ─────────────────────────────────────────── */}
              <div
                style={{
                  marginTop: 10,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--rezvix-surface-subtle, rgba(34,197,94,0.06))",
                  border: "1px solid var(--rezvix-border-subtle)",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: "var(--rezvix-text-soft)",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--rezvix-text)",
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  🎟️ {t("Görsel kılavuzu")}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 3 }}>
                  <li>
                    <b>{t("Oran")}:</b> {t("Kare (1:1). Mobilde kupon kartında dikeyce kırpılır.")}
                  </li>
                  <li>
                    <b>{t("Önerilen ölçü")}:</b> 600×600 px ({t("en az")} 300×300 px)
                  </li>
                  <li>
                    <b>{t("Biçim / boyut")}:</b> JPG {t("veya")} PNG · {t("maks.")} ~500 KB
                  </li>
                  <li>
                    <b>{t("Kırpma")}:</b>{" "}
                    {t("Görsel alana ortalanarak doldurulur (cover); kenarlardan bir miktar kırpılabilir. Önemli içeriği ortada tut.")}
                  </li>
                  <li>
                    <b>{t("Güvenli alan")}:</b>{" "}
                    {t("Sol üst köşede kategori rozeti (market/restoran/taksi) görünür — bu köşeye logo veya yazı koyma.")}
                  </li>
                  <li>
                    <b>{t("Kenar boşluğu")}:</b> {t("Yazı ve logoları kenarlardan ~%10 içeride tut.")}
                  </li>
                </ul>
              </div>
            </FormField>

            <Row>
              <FormField label={t("Yüzey")} required>
                <select
                  className={inputCls}
                  value={draft.surface}
                  onChange={(e) => {
                    const s = e.target.value as CampaignSurface;
                    setDraft((d) => ({
                      ...d,
                      surface: s,
                      // taxi → requiresOptIn forced off
                      requiresOptIn: s === "taxi" ? false : d.requiresOptIn,
                    }));
                  }}
                >
                  {SURFACES.map((s) => (
                    <option key={s} value={s}>
                      {t(SURFACE_LABELS[s])}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={t("Bölge")} required>
                <select
                  className={inputCls}
                  value={draft.region}
                  onChange={(e) =>
                    setD({ region: e.target.value as CampaignRegion })
                  }
                >
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </FormField>
            </Row>
          </Section>

          {/* İNDİRİM */}
          <Section title={t("İndirim")}>
            <Row>
              <FormField label={t("İndirim Tipi")} required>
                <select
                  className={inputCls}
                  value={draft.discount.kind}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      discount: {
                        ...d.discount,
                        kind: e.target.value as CampaignDiscountKind,
                      },
                    }))
                  }
                >
                  {DISCOUNT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(DISCOUNT_KIND_LABELS[k])}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label={t("Değer")}
                hint={
                  draft.discount.kind === "percent" ? t("Yüzde (%)") : t("Tutar")
                }
              >
                <input
                  type="number"
                  className={inputCls}
                  value={draft.discount.value}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      discount: {
                        ...d.discount,
                        value: Number(e.target.value),
                      },
                    }))
                  }
                />
              </FormField>
            </Row>
            <FormField
              label={t("Maks. İndirim")}
              hint={t("Boş = sınırsız (yalnızca yüzde için anlamlı)")}
            >
              <input
                type="number"
                className={inputCls}
                value={draft.discount.maxDiscount ?? ""}
                placeholder={t("sınırsız")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    discount: {
                      ...d.discount,
                      maxDiscount: numOrNull(e.target.value),
                    },
                  }))
                }
              />
            </FormField>
          </Section>

          {/* KOŞULLAR */}
          <Section title={t("Koşullar")}>
            <Row>
              <FormField label={t("Min. Sepet Tutarı")}>
                <input
                  type="number"
                  className={inputCls}
                  value={draft.conditions.minSubtotal}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      conditions: {
                        ...d.conditions,
                        minSubtotal: Number(e.target.value),
                      },
                    }))
                  }
                />
              </FormField>
              <FormField label={t("Kapsam")} required>
                <select
                  className={inputCls}
                  value={draft.conditions.scope}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      conditions: {
                        ...d.conditions,
                        scope: e.target.value as CampaignScope,
                      },
                    }))
                  }
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {t(SCOPE_LABELS[s])}
                    </option>
                  ))}
                </select>
              </FormField>
            </Row>

            {/* scope=category */}
            {draft.conditions.scope === "category" && (
              <FormField label={t("Kategoriler")}>
                {draft.surface === "market" ? (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                  >
                    {MARKET_CATEGORY_KEYS.map((k) => {
                      const on = draft.conditions.categoryKeys.includes(k);
                      return (
                        <Chip key={k} on={on} onClick={() => toggleCategory(k)}>
                          {t(MARKET_CATEGORY_LABELS[k])}
                        </Chip>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    className={inputCls}
                    placeholder={t("etiketleri virgülle ayırın")}
                    value={draft.conditions.categoryKeys.join(", ")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        conditions: {
                          ...d.conditions,
                          categoryKeys: splitTags(e.target.value),
                        },
                      }))
                    }
                  />
                )}
              </FormField>
            )}

            {/* scope=store */}
            {draft.conditions.scope === "store" && (
              <FormField
                label={t("Mağaza / Restoran ID'leri")}
                hint={t("Virgülle ayırın")}
              >
                <input
                  className={inputCls}
                  placeholder="id1, id2, ..."
                  value={draft.conditions.storeIds.join(", ")}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      conditions: {
                        ...d.conditions,
                        storeIds: splitTags(e.target.value),
                      },
                    }))
                  }
                />
              </FormField>
            )}

            {/* scope=chain */}
            {draft.conditions.scope === "chain" && (
              <FormField label={t("Zincir (Organizasyon)")}>
                <EntityPicker
                  fetcher={pickOrganizations}
                  value={draft.conditions.organizationId ?? null}
                  onChange={(id: string | null) =>
                    setDraft((d) => ({
                      ...d,
                      conditions: {
                        ...d.conditions,
                        organizationId: id || null,
                      },
                    }))
                  }
                  placeholder={t("Zincir ara…")}
                />
              </FormField>
            )}

            <FormField label={t("Ödeme Yöntemleri")}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PAYMENT_METHODS.map((m) => {
                  const on = draft.conditions.paymentMethods.includes(m);
                  return (
                    <Chip key={m} on={on} onClick={() => togglePayment(m)}>
                      {t(PAYMENT_LABELS[m])}
                    </Chip>
                  );
                })}
              </div>
            </FormField>
          </Section>

          {/* KİTLE */}
          <Section title={t("Hedef Kitle")}>
            <FormField label={t("Kitle Tipi")} required>
              <select
                className={inputCls}
                value={draft.audience.kind}
                onChange={(e) => {
                  const kind = e.target.value as CampaignAudienceKind;
                  setDraft((d) => ({
                    ...d,
                    audience: {
                      ...d.audience,
                      kind,
                      // public → clear trigger/winBackDays
                      trigger: kind === "public" ? null : d.audience.trigger,
                      winBackDays:
                        kind === "public" ? null : d.audience.winBackDays,
                    },
                  }));
                }}
              >
                <option value="public">{t("Herkese açık")}</option>
                <option value="targeted">{t("Hedefli")}</option>
              </select>
            </FormField>

            {draft.audience.kind === "targeted" && (
              <>
                <FormField label={t("Tetikleyici")}>
                  <select
                    className={inputCls}
                    value={draft.audience.trigger ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const trigger = (v || null) as CampaignTrigger | null;
                      setDraft((d) => ({
                        ...d,
                        audience: {
                          ...d.audience,
                          trigger,
                          winBackDays:
                            trigger === "win_back"
                              ? d.audience.winBackDays ?? 30
                              : null,
                        },
                      }));
                    }}
                  >
                    <option value="">{t("(yok)")}</option>
                    <option value="first_order">{t("İlk sipariş")}</option>
                    <option value="win_back">{t("Geri kazanım")}</option>
                  </select>
                </FormField>

                {draft.audience.trigger === "win_back" && (
                  <FormField
                    label={t("Geri Kazanım Gün Sayısı")}
                    hint={t("Kaç gün pasif kullanıcı hedeflenecek")}
                  >
                    <input
                      type="number"
                      className={inputCls}
                      value={draft.audience.winBackDays ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          audience: {
                            ...d.audience,
                            winBackDays: numOrNull(e.target.value),
                          },
                        }))
                      }
                    />
                  </FormField>
                )}
              </>
            )}

            <Toggle
              label={t("Toplanabilir (collectible)")}
              checked={draft.audience.collectible}
              onChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  audience: { ...d.audience, collectible: v },
                }))
              }
            />
          </Section>

          {/* FİNANSMAN */}
          <Section title={t("Finansman & Bütçe")}>
            <FormField
              label={t("Platform Payı")}
              hint={`${draft.funding.platformSharePct}%`}
            >
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={draft.funding.platformSharePct}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    funding: { platformSharePct: Number(e.target.value) },
                  }))
                }
                style={{ width: "100%", accentColor: "var(--rezvix-primary)" }}
              />
            </FormField>

            <Row>
              <FormField
                label={t("Bütçe Üst Sınırı")}
                hint={t("Boş = sınırsız")}
              >
                <input
                  type="number"
                  className={inputCls}
                  placeholder={t("sınırsız")}
                  value={draft.budget.cap ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      budget: { ...d.budget, cap: numOrNull(e.target.value) },
                    }))
                  }
                />
              </FormField>
              <FormField label={t("Bütçe Esası")}>
                <select
                  className={inputCls}
                  value={draft.budget.basis}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      budget: {
                        ...d.budget,
                        basis: e.target.value as CampaignBudgetBasis,
                      },
                    }))
                  }
                >
                  <option value="platform">{t("Platform")}</option>
                  <option value="discount">{t("İndirim")}</option>
                </select>
              </FormField>
            </Row>
          </Section>

          {/* KULLANIM LİMİTİ */}
          <Section title={t("Kullanım Limiti")}>
            <Row>
              <FormField label={t("Kullanıcı Başına")}>
                <input
                  type="number"
                  className={inputCls}
                  value={draft.usageLimit.perUser}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      usageLimit: {
                        ...d.usageLimit,
                        perUser: Number(e.target.value),
                      },
                    }))
                  }
                />
              </FormField>
              <FormField label={t("Toplam")} hint={t("Boş = sınırsız")}>
                <input
                  type="number"
                  className={inputCls}
                  placeholder={t("sınırsız")}
                  value={draft.usageLimit.total ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      usageLimit: {
                        ...d.usageLimit,
                        total: numOrNull(e.target.value),
                      },
                    }))
                  }
                />
              </FormField>
            </Row>
            <Toggle
              label={t("Kalan adedi göster")}
              checked={draft.usageLimit.showRemaining}
              onChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  usageLimit: { ...d.usageLimit, showRemaining: v },
                }))
              }
            />
          </Section>

          {/* YAYIN */}
          <Section title={t("Yayın & Geçerlilik")}>
            <Row>
              <FormField label={t("Başlangıç")} required>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={toDatetimeLocal(draft.validFrom)}
                  onChange={(e) =>
                    setD({ validFrom: fromDatetimeLocal(e.target.value) })
                  }
                />
              </FormField>
              <FormField label={t("Bitiş")} required>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={toDatetimeLocal(draft.validTo)}
                  onChange={(e) =>
                    setD({ validTo: fromDatetimeLocal(e.target.value) })
                  }
                />
              </FormField>
            </Row>

            <Toggle
              label={t("İşletme onayı gerekir (opt-in)")}
              checked={draft.requiresOptIn}
              disabled={isTaxi}
              hint={
                isTaxi
                  ? t("Taksi yüzeyinde devre dışı")
                  : undefined
              }
              onChange={(v) => setD({ requiresOptIn: v })}
            />
            <Toggle
              label={t("Aktif olarak yayınla")}
              checked={draft.isActive}
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

      {/* ── Participations modal ── */}
      {partsForId && (
        <ParticipationsModal
          campaignId={partsForId}
          onClose={() => setPartsForId(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

const DISCOUNT_KIND_LABELS: Record<CampaignDiscountKind, string> = {
  percent: "Yüzde indirim",
  fixed: "Sabit tutar indirim",
  free_delivery: "Ücretsiz teslimat",
  fixed_price: "Sabit fiyat",
};

const SCOPE_LABELS: Record<CampaignScope, string> = {
  platform: "Platform geneli",
  category: "Kategori",
  store: "Mağaza / Restoran",
  chain: "Zincir (organizasyon)",
};

const PAYMENT_LABELS: Record<CampaignPaymentMethod, string> = {
  all: "Tümü",
  cash: "Nakit",
  card: "Kapıda Kart",
  online: "Online",
};

function describeDiscount(c: Campaign): string {
  const d = c.discount;
  if (!d) return "-";
  switch (d.kind) {
    case "percent":
      return `%${d.value}`;
    case "fixed":
      return `-${d.value}`;
    case "fixed_price":
      return `= ${d.value}`;
    case "free_delivery":
      return "Ücretsiz teslimat";
    default:
      return String(d.value ?? "-");
  }
}

function fmtDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function splitTags(v: string): string[] {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        background: "var(--rezvix-bg-soft)",
        border: "1px solid var(--rezvix-border-strong)",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--rezvix-text-muted)",
        whiteSpace: "nowrap",
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

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
          style={{
            accentColor: "var(--rezvix-primary)",
            width: 15,
            height: 15,
          }}
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
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ParticipationsModal({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-campaign-participations", campaignId],
    queryFn: () => listParticipations(campaignId),
  });
  const items = data?.items ?? [];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "80vh",
          borderRadius: 18,
          background: "var(--rezvix-bg-elevated)",
          boxShadow: "var(--rezvix-shadow-soft)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: "var(--rezvix-text-main)",
            }}
          >
            {t("Katılan İşletmeler")}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: 9,
              border: "1.5px solid var(--rezvix-border-strong)",
              background: "transparent",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t("Kapat")}
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {isLoading && (
            <div
              style={{
                padding: "24px 20px",
                color: "var(--rezvix-text-soft)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {t("Yükleniyor…")}
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <div
              style={{
                padding: "28px 20px",
                color: "var(--rezvix-text-soft)",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {t("Henüz katılan işletme yok")}
            </div>
          )}
          {!isLoading && items.length > 0 && (
            <table
              style={{
                width: "100%",
                fontSize: 13,
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--rezvix-bg-soft)",
                    textAlign: "left",
                  }}
                >
                  {[t("İşletme"), t("ID"), t("Durum"), t("Tarih")].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "10px 16px",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--rezvix-text-soft)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((p, idx) => (
                  <tr
                    key={p._id ?? idx}
                    style={{
                      borderTop: "1px solid var(--rezvix-border-subtle)",
                      background:
                        idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                    }}
                  >
                    <td
                      style={{
                        padding: "10px 16px",
                        color: "var(--rezvix-text-main)",
                        fontWeight: 600,
                      }}
                    >
                      {p.name ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        color: "var(--rezvix-text-soft)",
                        fontSize: 11,
                        fontFamily: "monospace",
                      }}
                    >
                      {p.storeId ||
                        p.restaurantId ||
                        p.organizationId ||
                        p._id ||
                        "-"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        color: "var(--rezvix-text-muted)",
                      }}
                    >
                      {p.status ?? "-"}
                    </td>
                    <td
                      style={{
                        padding: "10px 16px",
                        color: "var(--rezvix-text-soft)",
                        fontSize: 11,
                      }}
                    >
                      {fmtDate(p.optInAt || p.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
