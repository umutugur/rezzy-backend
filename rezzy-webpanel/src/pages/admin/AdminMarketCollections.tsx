import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import {
  MarketCollection,
  MarketCollectionInput,
  MarketCollectionKind,
  adminCreateMarketCollection,
  adminDeleteMarketCollection,
  adminListMarketCollections,
  adminUpdateMarketCollection,
} from "../../api/adminTaxiMarket";
import { EntityPicker } from "../../desktop/components/admin/EntityPicker";
import { pickMarketProducts } from "../../api/adminPickers";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";

// ─── Shared style constants ───────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-[var(--rezvix-border-strong)] bg-[var(--rezvix-bg-elevated)] text-[var(--rezvix-text-main)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rezvix-primary)] placeholder:text-[var(--rezvix-text-soft)]";

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1.5px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "22px 24px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  marginBottom: 20,
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminMarketCollectionsPage() {
  const qc = useQueryClient();
  const { t } = useI18n();

  const { data: collectionsResp, isLoading } = useQuery({
    queryKey: ["admin-market-collections"],
    queryFn: adminListMarketCollections,
  });
  const collections = collectionsResp?.items ?? [];

  // Create form state
  const [title, setTitle] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [kind, setKind] = React.useState<MarketCollectionKind>("manual");
  const [productIds, setProductIds] = React.useState<string[]>([]);
  const [imageUrl, setImageUrl] = React.useState("");
  const [order, setOrder] = React.useState<number>(0);
  const [isActiveCreate, setIsActiveCreate] = React.useState(true);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error(t("Başlık zorunlu"));
      const body: MarketCollectionInput = {
        title: title.trim(),
        region: region ? region.toUpperCase() : null,
        kind,
        productIds: kind === "manual" ? productIds : [],
        imageUrl: imageUrl.trim() || null,
        order,
        isActive: isActiveCreate,
      };
      return adminCreateMarketCollection(body);
    },
    onSuccess: async () => {
      setTitle("");
      setRegion("");
      setKind("manual");
      setProductIds([]);
      setImageUrl("");
      setOrder(0);
      setIsActiveCreate(true);
      await qc.invalidateQueries({ queryKey: ["admin-market-collections"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: async (p: { id: string; patch: Partial<MarketCollectionInput> }) =>
      adminUpdateMarketCollection(p.id, p.patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-market-collections"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => adminDeleteMarketCollection(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-market-collections"] });
    },
  });

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <AdminPageHeader
        title={t("Market Koleksiyonları")}
        subtitle={t("Ürün gruplarını ve otomatik koleksiyonları yönetin")}
      />

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={sectionHeadingStyle as any}>{t("Yeni Koleksiyon Ekle")}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <FormField label={t("Başlık")} required>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("örn: İndirimdekiler")}
            />
          </FormField>

          <FormField label={t("Bölge")} hint={t("Boş bırakırsanız tüm bölgelerde gösterilir")}>
            <select
              className={inputCls}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">{t("Tüm bölgeler")}</option>
              <option value="TR">TR — Türkiye</option>
              <option value="CY">CY — Kıbrıs</option>
            </select>
          </FormField>

          <FormField label={t("Koleksiyon Tipi")}>
            <select
              className={inputCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as MarketCollectionKind)}
            >
              <option value="manual">{t("Elle seçilen ürünler")}</option>
              <option value="discounted">{t("İndirimdekiler")}</option>
            </select>
          </FormField>

          <FormField label={t("Görsel URL")}>
            <input
              className={inputCls}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </FormField>

          <FormField label={t("Sıra")}>
            <input
              type="number"
              className={inputCls}
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
            />
          </FormField>

          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 14 }}>
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
                type="checkbox"
                checked={isActiveCreate}
                onChange={(e) => setIsActiveCreate(e.target.checked)}
                style={{ accentColor: "var(--rezvix-primary)", width: 15, height: 15 }}
              />
              {t("Aktif olarak yayınla")}
            </label>
          </div>

          {kind === "manual" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <FormField label={t("Ürünler")} hint={t("Arama yaparak koleksiyona ürün ekleyin")}>
                <EntityPicker
                  multiple
                  fetcher={pickMarketProducts}
                  value={productIds}
                  onChange={(ids) => setProductIds(ids as string[])}
                  placeholder={t("Ürün ara ve ekle...")}
                />
              </FormField>
            </div>
          )}

          <div style={{ gridColumn: "1 / -1", paddingTop: 4 }}>
            <button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                background: "var(--rezvix-primary)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                cursor: createMut.isPending ? "not-allowed" : "pointer",
                opacity: createMut.isPending ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {createMut.isPending ? t("Ekleniyor...") : t("Koleksiyon Ekle")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Collections table ────────────────────────────────────────────────── */}
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
            {t("Mevcut Koleksiyonlar")}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--rezvix-bg-soft)", textAlign: "left" }}>
                {[
                  t("Başlık"),
                  t("Bölge"),
                  t("Tip"),
                  t("Ürün Sayısı"),
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
                    colSpan={7}
                    style={{
                      padding: "24px 16px",
                      color: "var(--rezvix-text-soft)",
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    {t("Yükleniyor…")}
                  </td>
                </tr>
              )}

              {(collections ?? []).map((c: MarketCollection, idx: number) => (
                <tr
                  key={c._id}
                  style={{
                    borderTop: "1px solid var(--rezvix-border-subtle)",
                    background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                    verticalAlign: "top",
                  }}
                >
                  {/* Title (editable) */}
                  <td style={{ padding: "12px 16px" }}>
                    <input
                      className={inputCls}
                      style={{ minWidth: 160 }}
                      defaultValue={c.title}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== c.title) {
                          updateMut.mutate({ id: c._id, patch: { title: e.target.value.trim() } });
                        }
                      }}
                    />
                  </td>

                  {/* Region */}
                  <td style={{ padding: "12px 16px" }}>
                    <select
                      className={inputCls}
                      style={{ width: "auto", minWidth: 100 }}
                      value={c.region ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        updateMut.mutate({
                          id: c._id,
                          patch: { region: v ? v.toUpperCase() : null },
                        });
                      }}
                    >
                      <option value="">{t("Tüm bölgeler")}</option>
                      <option value="TR">TR</option>
                      <option value="CY">CY</option>
                    </select>
                  </td>

                  {/* Kind */}
                  <td style={{ padding: "12px 16px" }}>
                    <select
                      className={inputCls}
                      style={{ width: "auto", minWidth: 140 }}
                      value={c.kind}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: c._id,
                          patch: { kind: e.target.value as MarketCollectionKind },
                        })
                      }
                    >
                      <option value="manual">{t("Elle seçilen ürünler")}</option>
                      <option value="discounted">{t("İndirimdekiler")}</option>
                    </select>
                  </td>

                  {/* Product count */}
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--rezvix-text-muted)",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    {c.kind === "manual" ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "var(--rezvix-bg-soft)",
                          border: "1px solid var(--rezvix-border-strong)",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--rezvix-text-muted)",
                        }}
                      >
                        {c.productIds?.length ?? 0} {t("ürün")}
                      </span>
                    ) : (
                      <span style={{ color: "var(--rezvix-text-soft)", fontStyle: "italic" }}>—</span>
                    )}
                  </td>

                  {/* Order */}
                  <td style={{ padding: "12px 16px" }}>
                    <input
                      type="number"
                      className={inputCls}
                      style={{ width: 70 }}
                      defaultValue={c.order}
                      onBlur={(e) =>
                        updateMut.mutate({
                          id: c._id,
                          patch: { order: Number(e.target.value) },
                        })
                      }
                    />
                  </td>

                  {/* Status */}
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() =>
                        updateMut.mutate({
                          id: c._id,
                          patch: { isActive: !c.isActive },
                        })
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        border: "none",
                        cursor: "pointer",
                        background: c.isActive
                          ? "rgba(22, 163, 74, 0.1)"
                          : "rgba(220, 38, 38, 0.08)",
                        color: c.isActive ? "var(--rezvix-success)" : "var(--rezvix-danger)",
                      }}
                    >
                      <span style={{ fontSize: 9 }}>●</span>
                      {c.isActive ? t("Aktif") : t("Pasif")}
                    </button>
                  </td>

                  {/* Delete */}
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => {
                        if (confirm(t("Koleksiyon silinsin mi?"))) deleteMut.mutate(c._id);
                      }}
                      style={{
                        padding: "6px 14px",
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
                  </td>
                </tr>
              ))}

              {!isLoading && collections.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "32px 16px",
                      textAlign: "center",
                      color: "var(--rezvix-text-soft)",
                      fontSize: 13,
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
    </div>
  );
}
