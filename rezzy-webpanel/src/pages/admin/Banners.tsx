import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Cropper from "react-easy-crop";
import { Card } from "../../components/Card";
import { api } from "../../api/client";
import {
  AdminBanner,
  AdminBannerTargetType,
  adminCreateBanner,
  adminDeleteBanner,
  adminListBanners,
  adminUpdateBanner,
} from "../../api/client";
import { useI18n } from "../../i18n";
import { EntityPicker } from "../../desktop/components/admin/EntityPicker";
import {
  pickMarketStores,
  pickMarketProducts,
  pickMarketCollections,
} from "../../api/adminPickers";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";

// ─── Human-readable placement labels ─────────────────────────────────────────
const PLACEMENT_LABELS: Record<string, string> = {
  home_top:          "Ana Sayfa — Üst Banner",
  home_mid:          "Ana Sayfa — Orta Banner",
  store_top:         "Restoran Sayfası — Üst",
  market_home_top:   "Market Ana Sayfa — Üst",
  market_store_top:  "Market Mağaza Sayfası — Üst",
};

// Non-market placements
const DELIVERY_PLACEMENTS = ["home_top", "home_mid", "store_top"] as const;
// Market placements
const MARKET_PLACEMENTS = ["market_home_top", "market_store_top"] as const;
// All placements combined
const ALL_PLACEMENTS = [...DELIVERY_PLACEMENTS, ...MARKET_PLACEMENTS] as const;

// ─── Shared style constants ───────────────────────────────────────────────────
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

// ─── Type helpers ─────────────────────────────────────────────────────────────
type RestaurantLite = { _id: string; name: string; region?: string };

async function fetchRestaurantsLite(): Promise<RestaurantLite[]> {
  const { data } = await api.get("/admin/restaurants");
  const items = Array.isArray(data) ? data : data?.items || [];
  return (items ?? []).map((r: any) => ({
    _id: String(r._id),
    name: String(r.name ?? ""),
    region: r.region ? String(r.region) : undefined,
  }));
}

function isoOrNull(v: string): string | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function fileToObjectUrl(file: File): Promise<string> {
  return URL.createObjectURL(file);
}

async function getCroppedImgFile(
  imageSrc: string,
  cropPixels: { x: number; y: number; width: number; height: number },
  fileName: string
) {
  const image: HTMLImageElement = await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const OUT_W = 1200;
  const OUT_H = 520;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context yok");

  canvas.width = OUT_W;
  canvas.height = OUT_H;

  const sx = clamp(cropPixels.x, 0, Math.max(0, image.naturalWidth - 1));
  const sy = clamp(cropPixels.y, 0, Math.max(0, image.naturalHeight - 1));
  const sw = clamp(cropPixels.width, 1, image.naturalWidth - sx);
  const sh = clamp(cropPixels.height, 1, image.naturalHeight - sy);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.9
    );
  });

  const safe = fileName.replace(/\.[a-z0-9]+$/i, "");
  return new File([blob], `${safe}-banner.jpg`, { type: "image/jpeg" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminBannersPage() {
  const qc = useQueryClient();
  const { t } = useI18n();

  // ── List filter state ────────────────────────────────────────────────────────
  const [placement, setPlacement] = React.useState("home_top");
  const [region, setRegion] = React.useState<string>("");
  const [active, setActive] = React.useState<string>("true");

  const { data: bannersResp, isLoading } = useQuery({
    queryKey: ["admin-banners", placement, region, active],
    queryFn: () =>
      adminListBanners({
        placement: placement || undefined,
        region: region ? region.toUpperCase() : undefined,
        active: active === "all" ? undefined : (active as any),
      }),
  });

  const { data: restaurants } = useQuery({
    queryKey: ["admin-restaurants-lite"],
    queryFn: fetchRestaurantsLite,
  });

  const banners = bannersResp?.items ?? [];

  // ── Create form state ────────────────────────────────────────────────────────
  const [title, setTitle] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [order, setOrder] = React.useState<number>(0);
  const [isActiveCreate, setIsActiveCreate] = React.useState(true);
  const [startAt, setStartAt] = React.useState("");
  const [endAt, setEndAt] = React.useState("");
  const [targetType, setTargetType] = React.useState<AdminBannerTargetType>("delivery");
  const [formPlacement, setFormPlacement] = React.useState("home_top");
  const [restaurantId, setRestaurantId] = React.useState<string>("");
  const [marketStoreId, setMarketStoreId] = React.useState<string>("");
  const [marketProductId, setMarketProductId] = React.useState<string>("");
  const [marketCollectionId, setMarketCollectionId] = React.useState<string>("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imageSrc, setImageSrc] = React.useState<string>("");
  React.useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [crop, setCrop] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<any>(null);
  const [croppedFile, setCroppedFile] = React.useState<File | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!imageFile) throw new Error(t("Banner görseli zorunlu"));
      const finalImage = croppedFile ?? imageFile;
      if (targetType !== "market" && !restaurantId) throw new Error(t("Restoran seçmelisin"));
      return adminCreateBanner({
        placement: formPlacement,
        region: region ? region.toUpperCase() : null,
        title: title.trim() || null,
        linkUrl: linkUrl.trim() || null,
        order,
        isActive: isActiveCreate,
        startAt: isoOrNull(startAt),
        endAt: isoOrNull(endAt),
        targetType,
        restaurantId: targetType === "market" ? undefined : restaurantId,
        marketStoreId: targetType === "market" ? (marketStoreId.trim() || null) : undefined,
        marketProductId: targetType === "market" ? (marketProductId.trim() || null) : undefined,
        marketCollectionId: targetType === "market" ? (marketCollectionId.trim() || null) : undefined,
        imageFile: finalImage,
      });
    },
    onSuccess: async () => {
      setTitle("");
      setLinkUrl("");
      setOrder(0);
      setIsActiveCreate(true);
      setStartAt("");
      setEndAt("");
      setTargetType("delivery");
      setRestaurantId("");
      setMarketStoreId("");
      setMarketProductId("");
      setMarketCollectionId("");
      setImageFile(null);
      if (imageSrc) URL.revokeObjectURL(imageSrc);
      setImageSrc("");
      setCroppedFile(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropOpen(false);
      await qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: async (p: { id: string; patch: any }) => {
      return adminUpdateBanner(p.id, p.patch);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => adminDeleteBanner(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
  });

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1280 }}>
      <AdminPageHeader
        title={t("Banner Yönetimi")}
        subtitle={t("Uygulamada gösterilecek banner reklamlarını yönetin")}
        actions={
          <button
            style={{
              padding: "8px 18px",
              borderRadius: 10,
              background: "var(--rezvix-bg-soft)",
              border: "1.5px solid var(--rezvix-border-strong)",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
            onClick={() => qc.invalidateQueries({ queryKey: ["admin-banners"] })}
          >
            ↺ {t("Yenile")}
          </button>
        }
      />

      {/* ── Filter row ──────────────────────────────────────────────────────── */}
      <div
        style={{
          ...cardStyle,
          marginBottom: 20,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          alignItems: "end",
        }}
      >
        <div>
          <div style={sectionHeadingStyle as any}>{t("Filtreler")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, gridColumn: "1 / -1" }}>
            <FormField label={t("Yerleşim")}>
              <select
                className={inputCls}
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
              >
                <option value="">{t("Tüm yerleşimler")}</option>
                {ALL_PLACEMENTS.map((key) => (
                  <option key={key} value={key}>
                    {PLACEMENT_LABELS[key] ?? key}
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
                <option value="">{t("Tüm bölgeler")}</option>
                <option value="TR">TR — Türkiye</option>
                <option value="CY">CY — Kıbrıs</option>
              </select>
            </FormField>

            <FormField label={t("Durum")}>
              <select
                className={inputCls}
                value={active}
                onChange={(e) => setActive(e.target.value)}
              >
                <option value="true">{t("Sadece aktif")}</option>
                <option value="false">{t("Sadece pasif")}</option>
                <option value="all">{t("Hepsi")}</option>
              </select>
            </FormField>
          </div>
        </div>
      </div>

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={sectionHeadingStyle as any}>{t("Yeni Banner Ekle")}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <FormField label={t("Başlık")}>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("opsiyonel")}
            />
          </FormField>

          <FormField label={t("Link")}>
            <input
              className={inputCls}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
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

          <FormField label={t("Hedef Tip")} required>
            <select
              className={inputCls}
              value={targetType}
              onChange={(e) => {
                const tt = e.target.value as AdminBannerTargetType;
                setTargetType(tt);
                if (tt === "market") {
                  setFormPlacement((p) =>
                    p === "market_home_top" || p === "market_store_top" ? p : "market_home_top"
                  );
                } else {
                  setFormPlacement((p) =>
                    p === "market_home_top" || p === "market_store_top" ? "home_top" : p
                  );
                }
              }}
            >
              <option value="delivery">{t("Delivery (paket servis)")}</option>
              <option value="reservation">{t("Reservation (rezervasyon)")}</option>
              <option value="market">{t("Market")}</option>
            </select>
          </FormField>

          {targetType === "market" ? (
            <>
              <FormField
                label={t("Yerleşim")}
                hint={t("Bu banner uygulamada nerede gösterilecek?")}
                required
              >
                <select
                  className={inputCls}
                  value={formPlacement}
                  onChange={(e) => setFormPlacement(e.target.value)}
                >
                  {MARKET_PLACEMENTS.map((key) => (
                    <option key={key} value={key}>
                      {PLACEMENT_LABELS[key] ?? key}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label={t("Market Mağazası")}>
                <EntityPicker
                  fetcher={pickMarketStores}
                  value={marketStoreId || null}
                  onChange={(id: string | null) => setMarketStoreId(id || "")}
                  placeholder={t("Mağaza ara…")}
                />
              </FormField>

              <FormField label={t("Market Ürünü")}>
                <EntityPicker
                  fetcher={(q: string) => pickMarketProducts(q, marketStoreId || undefined)}
                  value={marketProductId || null}
                  onChange={(id: string | null) => setMarketProductId(id || "")}
                  placeholder={t("Ürün ara…")}
                />
              </FormField>

              <FormField label={t("Market Koleksiyonu")}>
                <EntityPicker
                  fetcher={pickMarketCollections}
                  value={marketCollectionId || null}
                  onChange={(id: string | null) => setMarketCollectionId(id || "")}
                  placeholder={t("Koleksiyon ara…")}
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField
                label={t("Yerleşim")}
                hint={t("Bu banner uygulamada nerede gösterilecek?")}
                required
              >
                <select
                  className={inputCls}
                  value={formPlacement}
                  onChange={(e) => setFormPlacement(e.target.value)}
                >
                  {DELIVERY_PLACEMENTS.map((key) => (
                    <option key={key} value={key}>
                      {PLACEMENT_LABELS[key] ?? key}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label={t("Restoran")} required>
                <select
                  className={inputCls}
                  value={restaurantId}
                  onChange={(e) => setRestaurantId(e.target.value)}
                >
                  <option value="">{t("Restoran seç")}</option>
                  {(restaurants ?? []).map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name} {r.region ? `(${r.region})` : ""}
                    </option>
                  ))}
                </select>
              </FormField>
            </>
          )}

          <FormField label={t("Başlangıç Tarihi")}>
            <input
              type="datetime-local"
              className={inputCls}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </FormField>

          <FormField label={t("Bitiş Tarihi")}>
            <input
              type="datetime-local"
              className={inputCls}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
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

          {/* Image upload — full width */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--rezvix-text-muted)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {t("Görsel")} <span style={{ color: "var(--rezvix-danger)" }}>*</span>
                </span>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    color: "var(--rezvix-text-soft)",
                  }}
                >
                  {t("Önerilen: 1200×520 — oran ~2.3:1")}
                </span>
              </div>
              {imageSrc && (
                <button
                  type="button"
                  onClick={() => setCropOpen(true)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 8,
                    border: "1.5px solid var(--rezvix-border-strong)",
                    background: "var(--rezvix-bg-soft)",
                    color: "var(--rezvix-text-muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ✂ {t("Kırp")}
                </button>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              style={{ fontSize: 13, color: "var(--rezvix-text-muted)" }}
              onChange={async (e) => {
                const f = e.target.files?.[0] ?? null;
                setImageFile(f);
                setCroppedFile(null);
                setCroppedAreaPixels(null);
                setCrop({ x: 0, y: 0 });
                setZoom(1);
                if (imageSrc) URL.revokeObjectURL(imageSrc);
                if (f) {
                  const url = await fileToObjectUrl(f);
                  setImageSrc(url);
                } else {
                  setImageSrc("");
                }
              }}
            />

            {imageSrc && (
              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    borderRadius: 12,
                    border: "1.5px solid var(--rezvix-border-subtle)",
                    padding: 12,
                    background: "var(--rezvix-bg-soft)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--rezvix-text-soft)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t("Önizleme")}
                  </div>
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "2.3 / 1",
                      overflow: "hidden",
                      borderRadius: 8,
                      border: "1px solid var(--rezvix-border-subtle)",
                      background: "white",
                    }}
                  >
                    <img
                      src={croppedFile ? URL.createObjectURL(croppedFile) : imageSrc}
                      alt={t("banner preview")}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: "var(--rezvix-text-soft)",
                    }}
                  >
                    {croppedFile
                      ? t("Kırpılmış görsel kullanılacak.")
                      : t("Görsel kırpılmadı; mobilde cover ile kesilebilir.")}
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: 12,
                    border: "1.5px solid var(--rezvix-border-subtle)",
                    padding: 12,
                    background: "var(--rezvix-bg-elevated)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--rezvix-text-soft)",
                      marginBottom: 8,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {t("İpuçları")}
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 16,
                      fontSize: 13,
                      color: "var(--rezvix-text-muted)",
                      lineHeight: 1.7,
                    }}
                  >
                    <li>{t("Metin/logoları merkeze yakın tut.")}</li>
                    <li>{t("Çok yüksek görsellerde üst-alt kesilir; mutlaka kırp.")}</li>
                    <li>{t("Yükleme JPEG'e çevrilir (kalite 0.9).")}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Submit button */}
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
              {createMut.isPending ? t("Ekleniyor...") : t("Banner Ekle")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Banners table ────────────────────────────────────────────────────── */}
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
            {t("Mevcut Bannerlar")}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "var(--rezvix-bg-soft)",
                  textAlign: "left",
                }}
              >
                {[
                  t("Görsel"),
                  t("Başlık"),
                  t("Target"),
                  t("Bağlantılı Kayıt"),
                  t("Yerleşim"),
                  t("Bölge"),
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
                    colSpan={9}
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

              {(banners ?? []).map((b: AdminBanner, idx: number) => (
                <tr
                  key={b._id}
                  style={{
                    borderTop: "1px solid var(--rezvix-border-subtle)",
                    background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                    verticalAlign: "top",
                  }}
                >
                  {/* Image */}
                  <td style={{ padding: "12px 16px" }}>
                    <img
                      src={b.imageUrl}
                      alt={b.title ?? "banner"}
                      style={{
                        width: 128,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 8,
                        border: "1px solid var(--rezvix-border-subtle)",
                      }}
                    />
                  </td>

                  {/* Title + link */}
                  <td style={{ padding: "12px 16px" }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--rezvix-text-main)",
                        marginBottom: 2,
                      }}
                    >
                      {b.title ?? "-"}
                    </div>
                    {b.linkUrl ? (
                      <a
                        style={{
                          color: "var(--rezvix-primary)",
                          fontSize: 12,
                          textDecoration: "underline",
                        }}
                        href={b.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("link")}
                      </a>
                    ) : (
                      <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                        {t("link yok")}
                      </span>
                    )}
                  </td>

                  {/* Target type */}
                  <td style={{ padding: "12px 16px" }}>
                    <select
                      className={inputCls}
                      style={{ width: "auto", minWidth: 120 }}
                      value={b.targetType}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: b._id,
                          patch: { targetType: e.target.value as AdminBannerTargetType },
                        })
                      }
                    >
                      <option value="delivery">{t("delivery")}</option>
                      <option value="reservation">{t("reservation")}</option>
                      <option value="market">{t("market")}</option>
                    </select>
                  </td>

                  {/* Restaurant / market entity */}
                  <td style={{ padding: "12px 16px" }}>
                    {b.targetType === "market" ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--rezvix-text-soft)",
                          lineHeight: 1.6,
                          maxWidth: 220,
                        }}
                      >
                        <div>{t("Store")}: {b.marketStoreId || "-"}</div>
                        <div>{t("Product")}: {b.marketProductId || "-"}</div>
                        <div>{t("Collection")}: {b.marketCollectionId || "-"}</div>
                      </div>
                    ) : (
                      <select
                        className={inputCls}
                        style={{ width: "auto", minWidth: 160, maxWidth: 220 }}
                        value={b.restaurantId ?? ""}
                        onChange={(e) =>
                          updateMut.mutate({
                            id: b._id,
                            patch: { restaurantId: e.target.value },
                          })
                        }
                      >
                        {(restaurants ?? []).map((r) => (
                          <option key={r._id} value={r._id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Placement — human-readable label */}
                  <td style={{ padding: "12px 16px" }}>
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
                      {PLACEMENT_LABELS[b.placement] ?? b.placement}
                    </span>
                  </td>

                  {/* Region */}
                  <td style={{ padding: "12px 16px", color: "var(--rezvix-text-muted)", fontSize: 13 }}>
                    {b.region ?? (
                      <span style={{ color: "var(--rezvix-text-soft)", fontStyle: "italic" }}>
                        {t("Hepsi")}
                      </span>
                    )}
                  </td>

                  {/* Order */}
                  <td style={{ padding: "12px 16px" }}>
                    <input
                      type="number"
                      className={inputCls}
                      style={{ width: 70 }}
                      defaultValue={b.order}
                      onBlur={(e) =>
                        updateMut.mutate({
                          id: b._id,
                          patch: { order: Number(e.target.value) },
                        })
                      }
                    />
                  </td>

                  {/* Status badge */}
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() =>
                        updateMut.mutate({
                          id: b._id,
                          patch: { isActive: !b.isActive },
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
                        background: b.isActive
                          ? "rgba(22, 163, 74, 0.1)"
                          : "rgba(220, 38, 38, 0.08)",
                        color: b.isActive
                          ? "var(--rezvix-success)"
                          : "var(--rezvix-danger)",
                      }}
                    >
                      <span style={{ fontSize: 9 }}>●</span>
                      {b.isActive ? t("Aktif") : t("Pasif")}
                    </button>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "12px 16px" }}>
                    <button
                      onClick={() => {
                        if (confirm(t("Banner silinsin mi?"))) deleteMut.mutate(b._id);
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

              {!isLoading && banners.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
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

      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          color: "var(--rezvix-text-soft)",
          fontStyle: "italic",
        }}
      >
        {t("Not: Banner tıklama aksiyonunu mobilde `targetType` üzerinden route edeceğiz.")}
      </div>

      {/* ── Crop modal ──────────────────────────────────────────────────────── */}
      {cropOpen && imageSrc ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              borderRadius: 18,
              background: "var(--rezvix-bg-elevated)",
              boxShadow: "var(--rezvix-shadow-soft)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--rezvix-border-subtle)",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    color: "var(--rezvix-text-main)",
                  }}
                >
                  {t("Banner Kırp")}
                </div>
                <div style={{ fontSize: 12, color: "var(--rezvix-text-soft)", marginTop: 2 }}>
                  {t("Çıktı: 1200×520 (oran ~2.3:1)")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCropOpen(false)}
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

            {/* Crop area */}
            <div style={{ position: "relative", width: "100%", height: 420 }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={2.3 / 1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            </div>

            {/* Controls */}
            <div
              style={{
                padding: "16px 20px",
                borderTop: "1px solid var(--rezvix-border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--rezvix-text-muted)",
                    minWidth: 40,
                  }}
                >
                  {t("Zoom")}
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "var(--rezvix-primary)" }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--rezvix-text-soft)",
                    minWidth: 36,
                    textAlign: "right",
                  }}
                >
                  {zoom.toFixed(2)}x
                </span>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setCroppedFile(null);
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setCroppedAreaPixels(null);
                  }}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 9,
                    border: "1.5px solid var(--rezvix-border-strong)",
                    background: "transparent",
                    color: "var(--rezvix-text-muted)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {t("Sıfırla")}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!imageFile) return;
                    if (!croppedAreaPixels) {
                      setCropOpen(false);
                      return;
                    }
                    try {
                      const f = await getCroppedImgFile(imageSrc, croppedAreaPixels, imageFile.name);
                      setCroppedFile(f);
                      setCropOpen(false);
                    } catch (e) {
                      console.error(e);
                      alert(t("Kırpma sırasında hata oluştu"));
                    }
                  }}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 9,
                    background: "var(--rezvix-primary)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {t("Kırpmayı Kaydet")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
