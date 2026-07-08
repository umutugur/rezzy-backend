import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authStore } from "../../store/auth";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { DataTable, DataTableRow, type Column } from "../../desktop/components/admin/DataTable";
import {
  listOrgProducts,
  createOrgProduct,
  updateOrgProduct,
  deleteOrgProduct,
  getProductOverrides,
  bulkUpdateProducts,
  exportProductsCsv,
  orgBulkPrice,
  type OrgProduct,
  type ProductOverrideRow,
} from "../../api/marketOrgCatalog";
import { getMarketCategories, uploadMarketImage, type MarketCoreCategory } from "../../api/marketDesktop";
import { useI18n } from "../../i18n";
import { showToast } from "../../ui/Toast";
import CsvImportWizard from "./CsvImportWizard";
import BulkPriceWizard from "./BulkPriceWizard";

// ── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  color: "var(--rezvix-text-soft)",
  fontSize: 12,
  display: "block",
  marginBottom: 4,
  fontWeight: 600,
};

const sectionLabel: React.CSSProperties = {
  color: "var(--rezvix-text-soft)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  marginBottom: 14,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

// ── Empty state ───────────────────────────────────────────────────────────────

function NoOrgState({ t }: { t: (s: string) => string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.4 }}>🏢</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--rezvix-text-main)",
        }}
      >
        {t("Bir zincire bağlı değilsiniz")}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--rezvix-text-muted)",
          maxWidth: 360,
        }}
      >
        {t(
          "Bu paneli kullanabilmek için bir zincir organizasyonuna üye olmanız gerekmektedir.",
        )}
      </div>
    </div>
  );
}

// ── Product modal ─────────────────────────────────────────────────────────────

interface ModalState {
  open: boolean;
  product: OrgProduct | null;
}

const UNIT_OPTIONS: OrgProduct["unit"][] = ["kg", "piece", "litre", "pack"];

const emptyForm = {
  title: "",
  description: "",
  barcode: "",
  unit: "piece" as OrgProduct["unit"],
  defaultPrice: "",
  defaultDiscountPrice: "",
  imageUrl: "",
  order: "",
  category: "",
};

type FormState = typeof emptyForm;

function ProductModal({
  modal,
  orgId,
  categories,
  onClose,
}: {
  modal: ModalState;
  orgId: string;
  categories: MarketCoreCategory[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageUploading, setImageUploading] = useState(false);

  React.useEffect(() => {
    if (!modal.open) return;
    if (modal.product) {
      const p = modal.product;
      const catId =
        p.category && typeof p.category === "object"
          ? (p.category._id ?? "")
          : p.category ?? "";
      setForm({
        title: p.title,
        description: p.description ?? "",
        barcode: p.barcode ?? "",
        unit: p.unit,
        defaultPrice: String(p.defaultPrice ?? ""),
        defaultDiscountPrice:
          p.defaultDiscountPrice != null ? String(p.defaultDiscountPrice) : "",
        imageUrl: p.imageUrl ?? "",
        order: p.order != null ? String(p.order) : "",
        category: catId,
      });
    } else {
      setForm(emptyForm);
    }
  }, [modal.open, modal.product]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("title_required");
      if (!form.category) throw new Error("category_required");
      if (!form.defaultPrice) throw new Error("price_required");

      const payload: Partial<OrgProduct> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        unit: form.unit,
        defaultPrice: Number(form.defaultPrice),
        defaultDiscountPrice:
          form.defaultDiscountPrice !== ""
            ? Number(form.defaultDiscountPrice)
            : null,
        imageUrl: form.imageUrl.trim() || undefined,
        order: form.order !== "" ? Number(form.order) : undefined,
        category: form.category,
      };

      if (modal.product) {
        return updateOrgProduct(orgId, modal.product._id, payload);
      }
      return createOrgProduct(orgId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-products", orgId] });
      showToast(t("Kaydedildi"), "success");
      onClose();
    },
    onError: (err: any) => {
      const msg = err?.message;
      if (msg === "title_required") showToast(t("Ürün adı zorunludur"), "error");
      else if (msg === "category_required") showToast(t("Kategori seçimi zorunludur"), "error");
      else if (msg === "price_required") showToast(t("Fiyat zorunludur"), "error");
      else showToast(t("Kayıt başarısız"), "error");
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploading(true);
    try {
      const res = await uploadMarketImage(file);
      setForm((f) => ({ ...f, imageUrl: res.url }));
    } catch {
      showToast(t("Görsel yüklenemedi"), "error");
    } finally {
      setImageUploading(false);
    }
  };

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const canSave = !saving && !!form.title.trim() && !!form.category && !!form.defaultPrice;

  if (!modal.open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,20,40,.48)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        overflowY: "auto",
        padding: "32px 20px",
      }}
    >
      <style>{`
        @keyframes orgModalIn { from { opacity: 0; transform: translateY(12px) scale(.98) } to { opacity: 1; transform: none } }
        .org-modal-card { animation: orgModalIn .22s cubic-bezier(.16,1,.3,1) }
        .org-input:focus { border-color: var(--rezvix-primary) !important; box-shadow: 0 0 0 3px var(--rezvix-primary-soft) !important; }
        .org-input::placeholder { color: var(--rezvix-text-soft) }
        .org-btn-ghost:hover { background: var(--rezvix-bg-soft) !important; }
        .org-btn-x:hover { background: var(--rezvix-bg-soft) !important; color: var(--rezvix-text-main) !important; }
      `}</style>

      <div
        className="org-modal-card"
        style={{
          background: "var(--rezvix-bg-elevated)",
          borderRadius: 18,
          width: 860,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--rezvix-border-subtle)",
          boxShadow: "0 28px 72px rgba(17,20,40,.24)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 28px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
            background: "var(--rezvix-bg-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background:
                  "radial-gradient(circle at 30% 0%, #f9d58b 0, #f3b36b 28%, #7b2c2c 65%, #2b1010 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                boxShadow: "0 6px 18px rgba(123,44,44,.32)",
              }}
            >
              🏷️
            </div>
            <div>
              <h3
                style={{
                  color: "var(--rezvix-text-main)",
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                {modal.product ? t("Ürünü Düzenle") : t("Yeni Ürün")}
              </h3>
              <p
                style={{
                  color: "var(--rezvix-text-soft)",
                  margin: "2px 0 0",
                  fontSize: 12.5,
                }}
              >
                {modal.product
                  ? t("Master katalog ürününü güncelleyin")
                  : t("Zincir genelinde geçerli yeni bir ürün ekleyin")}
              </p>
            </div>
          </div>
          <button
            className="org-btn-x"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: "1px solid var(--rezvix-border-subtle)",
              background: "transparent",
              color: "var(--rezvix-text-soft)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: "30px",
              textAlign: "center",
              flexShrink: 0,
            }}
            aria-label={t("Kapat")}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 28,
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: 28,
            alignItems: "start",
          }}
        >
          {/* Left: image */}
          <div>
            <span style={sectionLabel}>{t("Görsel")}</span>

            {form.imageUrl ? (
              <div
                style={{
                  position: "relative",
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid var(--rezvix-border-subtle)",
                }}
              >
                <img
                  src={form.imageUrl}
                  alt="preview"
                  style={{
                    width: "100%",
                    height: 190,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                  style={{
                    position: "absolute",
                    top: 10,
                    right: 10,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: "rgba(255,255,255,.92)",
                    color: "var(--rezvix-danger)",
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 600,
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {t("Kaldır")}
                </button>
              </div>
            ) : (
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  height: 190,
                  borderRadius: 14,
                  border: "1.5px dashed var(--rezvix-border-strong)",
                  background: "var(--rezvix-bg-soft)",
                  cursor: imageUploading ? "wait" : "pointer",
                  textAlign: "center",
                  padding: 16,
                  transition: "border-color .15s ease, background .15s ease",
                }}
              >
                <div style={{ fontSize: 30, opacity: 0.7 }}>
                  {imageUploading ? "⏳" : "🖼️"}
                </div>
                <span
                  style={{
                    color: "var(--rezvix-text-main)",
                    fontSize: 13.5,
                    fontWeight: 600,
                  }}
                >
                  {imageUploading ? t("Yükleniyor…") : t("Görsel yükle")}
                </span>
                <span
                  style={{ color: "var(--rezvix-text-soft)", fontSize: 11.5 }}
                >
                  PNG · JPG
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={imageUploading}
                  style={{ display: "none" }}
                />
              </label>
            )}

            {/* Order field */}
            <div style={{ marginTop: 20 }}>
              <label style={labelStyle}>{t("Sıralama")}</label>
              <input
                className="org-input"
                type="number"
                value={form.order}
                onChange={set("order")}
                placeholder="0"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Right: fields */}
          <div>
            <span style={sectionLabel}>{t("Temel Bilgiler")}</span>

            {/* Category */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                {t("Kategori")}{" "}
                <span style={{ color: "var(--rezvix-danger)" }}>*</span>
              </label>
              <select
                className="org-input"
                value={form.category}
                onChange={set("category")}
                style={{
                  ...inputStyle,
                  cursor: "pointer",
                  borderColor: !form.category
                    ? "rgba(220,38,38,.45)"
                    : "var(--rezvix-border-strong)",
                }}
              >
                <option value="">{t("Kategori seçiniz")}</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.i18n?.tr?.title ?? cat.key}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                {t("Ürün Adı")}{" "}
                <span style={{ color: "var(--rezvix-danger)" }}>*</span>
              </label>
              <input
                className="org-input"
                type="text"
                value={form.title}
                onChange={set("title")}
                placeholder={t("ör. Tam Yağlı Süt 1L")}
                style={inputStyle}
              />
            </div>

            {/* Price + discount */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <label style={labelStyle}>
                  {t("Varsayılan Fiyat")}{" "}
                  <span style={{ color: "var(--rezvix-danger)" }}>*</span>
                </label>
                <input
                  className="org-input"
                  type="number"
                  value={form.defaultPrice}
                  onChange={set("defaultPrice")}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  {t("İndirimli Fiyat")}{" "}
                  <span style={{ color: "var(--rezvix-text-soft)", fontWeight: 400 }}>
                    ({t("isteğe bağlı")})
                  </span>
                </label>
                <input
                  className="org-input"
                  type="number"
                  value={form.defaultDiscountPrice}
                  onChange={set("defaultDiscountPrice")}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Unit + barcode */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <label style={labelStyle}>{t("Birim")}</label>
                <select
                  className="org-input"
                  value={form.unit}
                  onChange={set("unit")}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t("Barkod")}</label>
                <input
                  className="org-input"
                  type="text"
                  value={form.barcode}
                  onChange={set("barcode")}
                  placeholder="8690504001986"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Description */}
            <span style={{ ...sectionLabel, marginTop: 20 }}>
              {t("Açıklama")}
            </span>
            <textarea
              className="org-input"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder={t("Ürün açıklaması (isteğe bağlı)")}
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 28px",
            borderTop: "1px solid var(--rezvix-border-subtle)",
            background: "var(--rezvix-bg-soft)",
          }}
        >
          <span
            style={{
              color: canSave ? "var(--rezvix-text-soft)" : "var(--rezvix-danger)",
              fontSize: 12.5,
              flex: 1,
            }}
          >
            {canSave
              ? t("Kaydetmeye hazır")
              : t("Kategori, ürün adı ve fiyat zorunludur")}
          </span>
          <button
            className="org-btn-ghost"
            onClick={onClose}
            style={{
              padding: "10px 20px",
              borderRadius: 9,
              border: "1px solid var(--rezvix-border-strong)",
              background: "transparent",
              color: "var(--rezvix-text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {t("Vazgeç")}
          </button>
          <button
            onClick={() => save()}
            disabled={!canSave}
            style={{
              padding: "10px 26px",
              borderRadius: 9,
              border: "none",
              background: canSave
                ? "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))"
                : "var(--rezvix-bg-soft)",
              color: canSave ? "#fff" : "var(--rezvix-text-soft)",
              cursor: canSave ? "pointer" : "not-allowed",
              fontWeight: 700,
              fontSize: 14,
              boxShadow: canSave
                ? "0 6px 18px rgba(123,44,44,.30)"
                : "none",
              transition: "transform .12s ease, box-shadow .15s ease",
            }}
          >
            {saving
              ? t("Kaydediliyor…")
              : modal.product
              ? t("Güncelle")
              : t("Ekle")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Override Drawer ────────────────────────────────────────────────────────────

interface OverrideDrawerProps {
  open: boolean;
  product: OrgProduct | null;
  orgId: string;
  onClose: () => void;
  t: (s: string) => string;
}

function ProductOverridesDrawer({ open, product, orgId, onClose, t }: OverrideDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["product-overrides", orgId, product?._id],
    queryFn: () => getProductOverrides(orgId, product!._id),
    enabled: open && !!product,
  });

  const items: ProductOverrideRow[] = data?.items ?? [];

  if (!open || !product) return null;

  return (
    <>
      <style>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .override-drawer { animation: drawerSlideIn .26s cubic-bezier(.16,1,.3,1); }
        .override-row:hover { background: var(--rezvix-bg-soft) !important; }
        .override-close-btn:hover { background: var(--rezvix-bg-soft) !important; color: var(--rezvix-text-main) !important; }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,20,40,.38)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          zIndex: 1100,
        }}
      />

      {/* Drawer panel */}
      <div
        className="override-drawer"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: "100vw",
          background: "var(--rezvix-bg-elevated)",
          borderLeft: "1px solid var(--rezvix-border-subtle)",
          boxShadow: "-24px 0 72px rgba(17,20,40,.22)",
          zIndex: 1101,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
            background: "var(--rezvix-bg-soft)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt=""
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                objectFit: "cover",
                border: "1px solid var(--rezvix-border-subtle)",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background:
                  "radial-gradient(circle at 30% 0%, #f9d58b 0, #f3b36b 28%, #7b2c2c 65%, #2b1010 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              {product.title.charAt(0).toUpperCase()}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                color: "var(--rezvix-text-main)",
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {product.title}
            </h3>
            <p
              style={{
                color: "var(--rezvix-text-soft)",
                margin: "3px 0 0",
                fontSize: 12.5,
              }}
            >
              {t("Şube sapmaları")}
              {" · "}
              <span style={{ color: "var(--rezvix-primary)", fontWeight: 600 }}>
                ₺{product.defaultPrice.toFixed(2)}
              </span>
              {" "}
              {t("zincir fiyatı")}
            </p>
          </div>

          <button
            className="override-close-btn"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: "1px solid var(--rezvix-border-subtle)",
              background: "transparent",
              color: "var(--rezvix-text-soft)",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: "30px",
              textAlign: "center",
              flexShrink: 0,
            }}
            aria-label={t("Kapat")}
          >
            ×
          </button>
        </div>

        {/* Count summary bar */}
        <div
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              background: "var(--rezvix-primary-soft)",
              color: "var(--rezvix-primary)",
              border: "1px solid rgba(123,44,44,.22)",
            }}
          >
            {isLoading ? "…" : items.length} {t("şube")}
          </span>
          <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12.5 }}>
            {t("zincir varsayılanından sapıyor")}
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {isLoading ? (
            <div style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 68,
                    borderRadius: 12,
                    background: "var(--rezvix-bg-soft)",
                    opacity: 0.6,
                  }}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "72px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 44, opacity: 0.35 }}>✅</div>
              <div
                style={{
                  color: "var(--rezvix-text-main)",
                  fontWeight: 700,
                  fontSize: 15,
                }}
              >
                {t("Tüm şubeler zincir fiyatını kullanıyor")}
              </div>
              <div
                style={{
                  color: "var(--rezvix-text-muted)",
                  fontSize: 13,
                  maxWidth: 300,
                }}
              >
                {t("Bu ürün için hiçbir şube sapması bulunamadı.")}
              </div>
            </div>
          ) : (
            items.map((row) => {
              const hasCustomPrice = row.price !== null;
              const chainPrice = product.defaultPrice;
              const chainDiscount = product.defaultDiscountPrice ?? null;
              const priceDiff =
                hasCustomPrice && row.price !== null
                  ? row.price - chainPrice
                  : null;

              return (
                <div
                  key={row.storeId}
                  className="override-row"
                  style={{
                    padding: "14px 24px",
                    borderBottom: "1px solid var(--rezvix-border-subtle)",
                    transition: "background .12s ease",
                    cursor: "default",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          background: "var(--rezvix-primary-soft)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          flexShrink: 0,
                        }}
                      >
                        🏪
                      </div>
                      <div>
                        <div
                          style={{
                            color: "var(--rezvix-text-main)",
                            fontWeight: 600,
                            fontSize: 13.5,
                          }}
                        >
                          {row.storeName}
                        </div>
                        {row.city && (
                          <div
                            style={{
                              color: "var(--rezvix-text-soft)",
                              fontSize: 11.5,
                              marginTop: 1,
                            }}
                          >
                            {row.city}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {row.isAvailable === false && (
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: "rgba(220,38,38,.10)",
                            color: "var(--rezvix-danger)",
                            border: "1px solid rgba(220,38,38,.24)",
                          }}
                        >
                          {t("Stokta yok")}
                        </span>
                      )}
                      {row.hidden && (
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: "rgba(107,114,128,.12)",
                            color: "var(--rezvix-text-soft)",
                            border: "1px solid rgba(107,114,128,.24)",
                          }}
                        >
                          {t("Gizli")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      paddingLeft: 44,
                      flexWrap: "wrap",
                    }}
                  >
                    {hasCustomPrice && row.price !== null ? (
                      <>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span
                            style={{
                              color: "var(--rezvix-text-soft)",
                              fontSize: 10.5,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {t("Şube fiyatı")}
                          </span>
                          <span
                            style={{
                              color: "var(--rezvix-text-main)",
                              fontSize: 14,
                              fontWeight: 700,
                            }}
                          >
                            ₺{row.price.toFixed(2)}
                          </span>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span
                            style={{
                              color: "var(--rezvix-text-soft)",
                              fontSize: 10.5,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {t("Zincir fiyatı")}
                          </span>
                          <span
                            style={{
                              color: "var(--rezvix-text-soft)",
                              fontSize: 13,
                              fontWeight: 600,
                              textDecoration: "line-through",
                            }}
                          >
                            ₺{chainPrice.toFixed(2)}
                          </span>
                        </div>

                        {priceDiff !== null && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span
                              style={{
                                color: "var(--rezvix-text-soft)",
                                fontSize: 10.5,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              {t("Fark")}
                            </span>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color:
                                  priceDiff > 0
                                    ? "var(--rezvix-danger)"
                                    : "var(--rezvix-success)",
                              }}
                            >
                              {priceDiff > 0 ? "+" : ""}
                              ₺{priceDiff.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {row.discountPrice !== null && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span
                              style={{
                                color: "var(--rezvix-text-soft)",
                                fontSize: 10.5,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              {t("İnd. fiyat")}
                            </span>
                            <span
                              style={{
                                color: "var(--rezvix-success)",
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              ₺{row.discountPrice.toFixed(2)}
                              {chainDiscount !== null && chainDiscount !== row.discountPrice && (
                                <span
                                  style={{
                                    color: "var(--rezvix-text-soft)",
                                    fontWeight: 400,
                                    marginLeft: 6,
                                    textDecoration: "line-through",
                                    fontSize: 11.5,
                                  }}
                                >
                                  ₺{chainDiscount.toFixed(2)}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <span
                        style={{
                          color: "var(--rezvix-text-soft)",
                          fontSize: 12.5,
                          fontStyle: "italic",
                        }}
                      >
                        {t("Fiyat sapması yok — stok/görünürlük sapması")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--rezvix-border-subtle)",
            background: "var(--rezvix-bg-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "9px 22px",
              borderRadius: 9,
              border: "1px solid var(--rezvix-border-strong)",
              background: "transparent",
              color: "var(--rezvix-text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13.5,
            }}
          >
            {t("Kapat")}
          </button>
        </div>
      </div>
    </>
  );
}

// ── (CsvImportModal removed — replaced by CsvImportWizard) ──────────────────

// ── Bulk Price Modal ───────────────────────────────────────────────────────────

function BulkPriceModal({
  open,
  productIds,
  orgId,
  onClose,
  t,
}: {
  open: boolean;
  productIds: string[];
  orgId: string;
  onClose: () => void;
  t: (s: string) => string;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"set" | "percent">("set");
  const [amount, setAmount] = useState("");
  const [applying, setApplying] = useState(false);

  if (!open) return null;

  const handleApply = async () => {
    const num = Number(amount);
    if (!amount || isNaN(num) || num <= 0) {
      showToast(t("Geçerli bir değer girin"), "error");
      return;
    }
    setApplying(true);
    try {
      const result = await bulkUpdateProducts(orgId, {
        productIds,
        op: "price",
        value: { mode, amount: num },
      });
      qc.invalidateQueries({ queryKey: ["org-products", orgId] });
      showToast(`${result.modified} ${t("ürün güncellendi")}`, "success");
      onClose();
    } catch {
      showToast(t("Toplu güncelleme başarısız"), "error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,20,40,.52)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1300,
        padding: 24,
      }}
    >
      <style>{`
        @keyframes priceModalIn { from { opacity: 0; transform: scale(.94) } to { opacity: 1; transform: none } }
        .price-modal { animation: priceModalIn .18s cubic-bezier(.16,1,.3,1); }
        .mode-btn-active { background: var(--rezvix-primary-soft) !important; color: var(--rezvix-primary) !important; border-color: rgba(123,44,44,.32) !important; }
      `}</style>

      <div
        className="price-modal"
        style={{
          background: "var(--rezvix-bg-elevated)",
          borderRadius: 16,
          width: 420,
          maxWidth: "100%",
          border: "1px solid var(--rezvix-border-subtle)",
          boxShadow: "0 28px 64px rgba(17,20,40,.30)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
            background: "var(--rezvix-bg-soft)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3
              style={{
                color: "var(--rezvix-text-main)",
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {t("Toplu Fiyat Güncelle")}
            </h3>
            <p style={{ color: "var(--rezvix-text-soft)", margin: "2px 0 0", fontSize: 12 }}>
              <span style={{ color: "var(--rezvix-primary)", fontWeight: 700 }}>{productIds.length}</span> {t("ürün seçildi")}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--rezvix-border-subtle)",
              background: "transparent",
              color: "var(--rezvix-text-soft)",
              cursor: "pointer",
              fontSize: 17,
              lineHeight: "26px",
              textAlign: "center",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px" }}>
          <label style={labelStyle}>{t("Güncelleme Modu")}</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              className={mode === "set" ? "mode-btn-active" : ""}
              onClick={() => setMode("set")}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 9,
                border: "1px solid var(--rezvix-border-strong)",
                background: "transparent",
                color: "var(--rezvix-text-muted)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                transition: "all .12s ease",
              }}
            >
              {t("Sabit Fiyat")}
            </button>
            <button
              className={mode === "percent" ? "mode-btn-active" : ""}
              onClick={() => setMode("percent")}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 9,
                border: "1px solid var(--rezvix-border-strong)",
                background: "transparent",
                color: "var(--rezvix-text-muted)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                transition: "all .12s ease",
              }}
            >
              {t("Yüzde Değişim")} (%±)
            </button>
          </div>

          <label style={labelStyle}>
            {mode === "set" ? t("Yeni Fiyat (₺)") : t("Yüzde Değişim (ör. +10 veya -5)")}
          </label>
          <div style={{ position: "relative" }}>
            <span
              style={{
                position: "absolute",
                left: 13,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--rezvix-text-soft)",
                fontSize: 14,
                fontWeight: 700,
                pointerEvents: "none",
              }}
            >
              {mode === "set" ? "₺" : "%"}
            </span>
            <input
              className="org-input"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={mode === "set" ? "49.90" : "10"}
              style={{
                ...inputStyle,
                paddingLeft: 30,
              }}
            />
          </div>

          {mode === "percent" && amount && (
            <p
              style={{
                color: Number(amount) >= 0 ? "var(--rezvix-danger)" : "var(--rezvix-success)",
                fontSize: 12,
                marginTop: 6,
              }}
            >
              {Number(amount) >= 0
                ? `${t("Fiyatlar")} %${amount} ${t("artırılacak")}`
                : `${t("Fiyatlar")} %${Math.abs(Number(amount))} ${t("düşürülecek")}`}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--rezvix-border-subtle)",
            background: "var(--rezvix-bg-soft)",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            disabled={applying}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "1px solid var(--rezvix-border-strong)",
              background: "transparent",
              color: "var(--rezvix-text-muted)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            {t("Vazgeç")}
          </button>
          <button
            onClick={handleApply}
            disabled={applying || !amount}
            style={{
              padding: "9px 22px",
              borderRadius: 8,
              border: "none",
              background: applying || !amount
                ? "var(--rezvix-bg-soft)"
                : "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))",
              color: applying || !amount ? "var(--rezvix-text-soft)" : "#fff",
              cursor: applying || !amount ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 13,
              boxShadow: applying || !amount ? "none" : "0 4px 14px rgba(123,44,44,.28)",
            }}
          >
            {applying ? t("Uygulanıyor…") : t("Uygula")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrgCatalog() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const [modal, setModal] = useState<ModalState>({ open: false, product: null });
  const [overrideDrawer, setOverrideDrawer] = useState<{ open: boolean; product: OrgProduct | null }>({
    open: false,
    product: null,
  });

  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportLoading, setExportLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [excelWizardOpen, setExcelWizardOpen] = useState(false);

  // Categories
  const { data: catData } = useQuery({
    queryKey: ["market-core-categories"],
    queryFn: getMarketCategories,
    enabled: !!orgId,
  });
  const categories: MarketCoreCategory[] = catData?.items ?? [];
  // Normalized categories for wizard (title derived from i18n.tr.title, fallback to key)
  const normalizedCategories = categories.map((cat) => ({
    _id: cat._id,
    key: cat.key,
    title: cat.i18n?.tr?.title ?? cat.key,
  }));

  // Products
  const { data, isLoading } = useQuery({
    queryKey: ["org-products", orgId, search, categoryFilter, page],
    queryFn: () =>
      listOrgProducts(orgId!, {
        q: search || undefined,
        category: categoryFilter || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: !!orgId,
  });

  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  // ── Category grouping (main category → subcategory), collapsible ──────────
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isFiltering = search.trim().length > 0 || !!categoryFilter;

  const catIdOf = (p: OrgProduct): string => {
    const c = p.category;
    return c && typeof c === "object" ? c._id ?? "" : c ?? "";
  };

  const groupedSections = React.useMemo(() => {
    if (isFiltering) return null;
    if (categories.length === 0) return null;

    const catById = new Map<string, MarketCoreCategory>();
    for (const cat of categories) catById.set(cat._id, cat);

    const byCat = new Map<string, OrgProduct[]>();
    for (const p of products) {
      const cid = catIdOf(p);
      if (!byCat.has(cid)) byCat.set(cid, []);
      byCat.get(cid)!.push(p);
    }

    const parents = categories.filter((c) => !c.parentId);
    type Section = { id: string; title: string; items: OrgProduct[]; children: Section[] };
    const sections: Section[] = [];
    const usedCatIds = new Set<string>();

    for (const parent of parents) {
      const kids = categories.filter((c) => c.parentId === parent._id);
      const parentItems = byCat.get(parent._id) ?? [];
      const childSections: Section[] = [];
      for (const kid of kids) {
        usedCatIds.add(kid._id);
        const kidItems = byCat.get(kid._id) ?? [];
        if (kidItems.length > 0) {
          childSections.push({
            id: kid._id,
            title: kid.i18n?.tr?.title ?? kid.key,
            items: kidItems,
            children: [],
          });
        }
      }
      usedCatIds.add(parent._id);
      const totalCount = parentItems.length + childSections.reduce((s, c) => s + c.items.length, 0);
      if (totalCount > 0) {
        sections.push({
          id: parent._id,
          title: parent.i18n?.tr?.title ?? parent.key,
          items: parentItems,
          children: childSections,
        });
      }
    }

    const orphanItems: OrgProduct[] = [];
    for (const [cid, prods] of byCat.entries()) {
      if (!cid || !catById.has(cid) || !usedCatIds.has(cid)) orphanItems.push(...prods);
    }
    if (orphanItems.length > 0) {
      sections.push({ id: "__other", title: t("Diğer"), items: orphanItems, children: [] });
    }

    return sections;
  }, [isFiltering, categories, products]);

  // Delete mutation
  const { mutate: del } = useMutation({
    mutationFn: (id: string) => deleteOrgProduct(orgId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-products", orgId] });
      showToast(t("Silindi"), "success");
    },
    onError: () => showToast(t("Silme başarısız"), "error"),
  });

  // Bulk active mutation
  const { mutate: bulkActive, isPending: bulkActivePending } = useMutation({
    mutationFn: (value: boolean) =>
      bulkUpdateProducts(orgId!, {
        productIds: Array.from(selectedIds),
        op: "active",
        value,
      }),
    onSuccess: (result, value) => {
      qc.invalidateQueries({ queryKey: ["org-products", orgId] });
      showToast(`${result.modified} ${t("ürün güncellendi")}`, "success");
      setSelectedIds(new Set());
    },
    onError: () => showToast(t("Toplu güncelleme başarısız"), "error"),
  });

  const openAdd = () => setModal({ open: true, product: null });
  const openEdit = (p: OrgProduct) => setModal({ open: true, product: p });
  const closeModal = () => setModal({ open: false, product: null });

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!orgId) return;
    setExportLoading(true);
    try {
      await exportProductsCsv(orgId);
    } catch {
      showToast(t("Dışa aktarma başarısız"), "error");
    } finally {
      setExportLoading(false);
    }
  };

  // ── Checkbox helpers ──────────────────────────────────────────────────────
  const allOnPageSelected = products.length > 0 && products.every((p) => selectedIds.has(p._id));
  const someOnPageSelected = products.some((p) => selectedIds.has(p._id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      const newSet = new Set(selectedIds);
      products.forEach((p) => newSet.delete(p._id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      products.forEach((p) => newSet.add(p._id));
      setSelectedIds(newSet);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  if (!orgId) {
    return (
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          title={t("Ürün Kataloğu")}
          subtitle={t("Zincir genelinde geçerli master ürün listesi")}
        />
        <NoOrgState t={t} />
      </div>
    );
  }

  const columns: Column<OrgProduct>[] = [
    // ── Checkbox column ──────────────────────────────────────────────────────
    {
      key: "checkbox",
      header: (
        <div
          onClick={toggleSelectAll}
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            border: allOnPageSelected
              ? "2px solid var(--rezvix-primary)"
              : someOnPageSelected
              ? "2px solid var(--rezvix-primary)"
              : "1.5px solid var(--rezvix-border-strong)",
            background: allOnPageSelected
              ? "var(--rezvix-primary)"
              : someOnPageSelected
              ? "var(--rezvix-primary-soft)"
              : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .12s ease",
            flexShrink: 0,
          }}
          title={allOnPageSelected ? t("Tümünü kaldır") : t("Sayfadakileri seç")}
        >
          {allOnPageSelected && (
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>
          )}
          {someOnPageSelected && !allOnPageSelected && (
            <span style={{ color: "var(--rezvix-primary)", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>−</span>
          )}
        </div>
      ) as any,
      width: "42px",
      render: (p) => (
        <div
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(p._id);
          }}
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            border: selectedIds.has(p._id)
              ? "2px solid var(--rezvix-primary)"
              : "1.5px solid var(--rezvix-border-strong)",
            background: selectedIds.has(p._id) ? "var(--rezvix-primary)" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all .12s ease",
            flexShrink: 0,
          }}
        >
          {selectedIds.has(p._id) && (
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>
          )}
        </div>
      ),
    },
    {
      key: "image",
      header: t("Görsel"),
      width: "70px",
      render: (p) =>
        p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt=""
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              objectFit: "cover",
              border: "1px solid var(--rezvix-border-subtle)",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "var(--rezvix-bg-soft)",
              border: "1px solid var(--rezvix-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--rezvix-primary)",
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            {p.title.charAt(0).toUpperCase()}
          </div>
        ),
    },
    {
      key: "title",
      header: t("Ürün"),
      render: (p) => (
        <div>
          <div
            style={{
              color: "var(--rezvix-text-main)",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {p.title}
          </div>
          {p.barcode ? (
            <div
              style={{
                color: "var(--rezvix-text-soft)",
                fontSize: 11.5,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                marginTop: 2,
              }}
            >
              {p.barcode}
            </div>
          ) : (
            <div
              style={{
                color: "var(--rezvix-text-soft)",
                fontSize: 11.5,
                marginTop: 2,
                opacity: 0.6,
              }}
            >
              {t("Barkod yok")}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: t("Kategori"),
      render: (p) => {
        const cat = p.category;
        const label =
          cat && typeof cat === "object"
            ? (cat.i18n?.tr?.title ?? cat.key ?? "")
            : cat ?? "";
        return label ? (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--rezvix-primary-soft)",
              color: "var(--rezvix-primary)",
              border: "1px solid rgba(123,44,44,.20)",
            }}
          >
            {label}
          </span>
        ) : (
          <span style={{ color: "var(--rezvix-text-soft)", opacity: 0.5 }}>—</span>
        );
      },
    },
    {
      key: "unit",
      header: t("Birim"),
      render: (p) => (
        <span style={{ color: "var(--rezvix-text-muted)", fontSize: 13 }}>
          {p.unit}
        </span>
      ),
    },
    {
      key: "price",
      header: t("Varsayılan Fiyat"),
      align: "right",
      render: (p) => {
        const hasDisc =
          p.defaultDiscountPrice != null &&
          p.defaultDiscountPrice < p.defaultPrice;
        return (
          <div style={{ textAlign: "right" }}>
            {hasDisc ? (
              <>
                <span
                  style={{
                    color: "var(--rezvix-text-soft)",
                    textDecoration: "line-through",
                    fontSize: 12,
                    marginRight: 6,
                  }}
                >
                  ₺{p.defaultPrice.toFixed(2)}
                </span>
                <span
                  style={{
                    color: "var(--rezvix-success)",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  ₺{(p.defaultDiscountPrice as number).toFixed(2)}
                </span>
              </>
            ) : (
              <span
                style={{
                  color: "var(--rezvix-success)",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                ₺{p.defaultPrice.toFixed(2)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "overrides",
      header: t("Sapmalar"),
      render: (p) =>
        (p.overrideCount ?? 0) > 0 ? (
          <button
            onClick={() => setOverrideDrawer({ open: true, product: p })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 11px",
              borderRadius: 999,
              border: "1px solid rgba(123,44,44,.26)",
              background: "var(--rezvix-primary-soft)",
              color: "var(--rezvix-primary)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              transition: "opacity .12s ease, transform .12s ease",
              whiteSpace: "nowrap",
            }}
            title={t("Şube sapmalarını gör")}
          >
            <span style={{ fontSize: 13 }}>⚠️</span>
            {p.overrideCount} {t("şube")}
          </button>
        ) : (
          <span
            style={{
              color: "var(--rezvix-text-soft)",
              opacity: 0.45,
              fontSize: 14,
            }}
          >
            —
          </span>
        ),
    },
    {
      key: "status",
      header: t("Durum"),
      render: (p) => (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 999,
            padding: "4px 11px",
            fontSize: 12,
            fontWeight: 600,
            background:
              p.isActive !== false
                ? "rgba(22,163,74,.10)"
                : "rgba(220,38,38,.10)",
            color:
              p.isActive !== false
                ? "var(--rezvix-success)"
                : "var(--rezvix-danger)",
            border: `1px solid ${
              p.isActive !== false
                ? "rgba(22,163,74,.24)"
                : "rgba(220,38,38,.24)"
            }`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background:
                p.isActive !== false
                  ? "var(--rezvix-success)"
                  : "var(--rezvix-danger)",
            }}
          />
          {p.isActive !== false ? t("Aktif") : t("Pasif")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => openEdit(p)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(123,44,44,.30)",
              background: "transparent",
              color: "var(--rezvix-primary)",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              transition: "background .12s ease",
            }}
          >
            {t("Düzenle")}
          </button>
          <button
            onClick={() => {
              if (window.confirm(t("Silmek istediğinizden emin misiniz?"))) {
                del(p._id);
              }
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid rgba(220,38,38,.30)",
              background: "transparent",
              color: "var(--rezvix-danger)",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              transition: "background .12s ease",
            }}
          >
            {t("Sil")}
          </button>
        </div>
      ),
    },
  ];

  const selectedCount = selectedIds.size;

  return (
    <div style={{ padding: 32 }}>
      <style>{`
        .org-input:focus { border-color: var(--rezvix-primary) !important; box-shadow: 0 0 0 3px var(--rezvix-primary-soft) !important; outline: none; }
        .org-input::placeholder { color: var(--rezvix-text-soft); }
        .toolbar-btn:hover { opacity: 0.82 !important; }
        .toolbar-btn:active { transform: scale(.97) !important; }
        @keyframes bulkBarIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }
        .bulk-bar { animation: bulkBarIn .18s cubic-bezier(.16,1,.3,1); }
      `}</style>

      <AdminPageHeader
        title={t("Ürün Kataloğu")}
        subtitle={t("Zincir genelinde geçerli master ürün listesi")}
        actions={
          <button
            onClick={openAdd}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background:
                "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              boxShadow: "0 6px 16px rgba(123,44,44,.28)",
              whiteSpace: "nowrap",
            }}
          >
            + {t("Ürün Ekle")}
          </button>
        }
      />

      {/* ── Bulk Toolbar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "10px 16px",
          borderRadius: 12,
          background: "var(--rezvix-bg-soft)",
          border: "1px solid var(--rezvix-border-subtle)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--rezvix-text-soft)",
            marginRight: 4,
            whiteSpace: "nowrap",
          }}
        >
          {t("Toplu İşlemler")}
        </span>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 20,
            background: "var(--rezvix-border-strong)",
            margin: "0 4px",
          }}
        />

        {/* CSV Export */}
        <button
          className="toolbar-btn"
          onClick={handleExport}
          disabled={exportLoading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 8,
            border: "1px solid var(--rezvix-border-strong)",
            background: "var(--rezvix-bg-elevated)",
            color: "var(--rezvix-text-main)",
            cursor: exportLoading ? "wait" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            transition: "opacity .12s ease, transform .1s ease",
            whiteSpace: "nowrap",
          }}
          title={t("Tüm ürünleri CSV olarak indir")}
        >
          <span style={{ fontSize: 14 }}>{exportLoading ? "⏳" : "⬇️"}</span>
          {exportLoading ? t("İndiriliyor…") : t("CSV Dışa Aktar")}
        </button>

        {/* CSV Import */}
        <button
          className="toolbar-btn"
          onClick={() => setWizardOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 8,
            border: "1px solid var(--rezvix-border-strong)",
            background: "var(--rezvix-bg-elevated)",
            color: "var(--rezvix-text-main)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            transition: "opacity .12s ease, transform .1s ease",
            whiteSpace: "nowrap",
          }}
          title={t("CSV dosyasından ürün içe aktar (barkod upsert)")}
        >
          <span style={{ fontSize: 14 }}>⬆️</span>
          {t("CSV İçe Aktar")}
        </button>

        {/* Excel Bulk Price Update */}
        {orgId && (
          <button
            className="toolbar-btn"
            onClick={() => setExcelWizardOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              borderRadius: 8,
              border: "1px solid var(--rezvix-border-strong)",
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-text-main)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "opacity .12s ease, transform .1s ease",
              whiteSpace: "nowrap",
            }}
            title={t("Excel ile toplu fiyat güncelle")}
          >
            <span style={{ fontSize: 14 }}>📊</span>
            {t("Fiyat Güncelle (Excel)")}
          </button>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Selection count */}
        {selectedCount > 0 && (
          <span
            style={{
              fontSize: 12.5,
              color: "var(--rezvix-text-soft)",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--rezvix-primary)", fontWeight: 700 }}>{selectedCount}</span> {t("seçildi")}
          </span>
        )}
      </div>

      {/* ── Bulk Actions Bar (appears when rows selected) ─────────────────────── */}
      {selectedCount > 0 && (
        <div
          className="bulk-bar"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
            padding: "10px 16px",
            borderRadius: 12,
            background: "var(--rezvix-primary-soft)",
            border: "1px solid rgba(123,44,44,.22)",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--rezvix-primary)",
              whiteSpace: "nowrap",
            }}
          >
            {selectedCount} {t("ürün seçildi")}
          </span>

          <div
            style={{
              width: 1,
              height: 20,
              background: "rgba(123,44,44,.22)",
              margin: "0 4px",
            }}
          />

          {/* Bulk Price */}
          <button
            className="toolbar-btn"
            onClick={() => setBulkPriceOpen(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(123,44,44,.28)",
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-primary)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "opacity .12s ease, transform .1s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 13 }}>💰</span>
            {t("Toplu Fiyat")}
          </button>

          {/* Bulk Active */}
          <button
            className="toolbar-btn"
            onClick={() => bulkActive(true)}
            disabled={bulkActivePending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(22,163,74,.28)",
              background: "rgba(22,163,74,.08)",
              color: "var(--rezvix-success)",
              cursor: bulkActivePending ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "opacity .12s ease, transform .1s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 12 }}>●</span>
            {t("Aktif Yap")}
          </button>

          {/* Bulk Passive */}
          <button
            className="toolbar-btn"
            onClick={() => bulkActive(false)}
            disabled={bulkActivePending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid rgba(220,38,38,.28)",
              background: "rgba(220,38,38,.06)",
              color: "var(--rezvix-danger)",
              cursor: bulkActivePending ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              transition: "opacity .12s ease, transform .1s ease",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 12 }}>○</span>
            {t("Pasif Yap")}
          </button>

          {/* Clear selection */}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              border: "1px solid rgba(123,44,44,.20)",
              background: "transparent",
              color: "var(--rezvix-text-soft)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {t("Seçimi Temizle")}
          </button>
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--rezvix-text-soft)",
              fontSize: 14,
              pointerEvents: "none",
            }}
          >
            🔍
          </span>
          <input
            className="org-input"
            type="text"
            placeholder={t("Ürün adı veya barkod ara…")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            style={{
              ...inputStyle,
              paddingLeft: 34,
              width: 280,
            }}
          />
        </div>

        <select
          className="org-input"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setPage(0);
          }}
          style={{ ...inputStyle, width: 200, cursor: "pointer" }}
        >
          <option value="">{t("Tüm Kategoriler")}</option>
          {categories.map((cat) => (
            <option key={cat._id} value={cat._id}>
              {cat.i18n?.tr?.title ?? cat.key}
            </option>
          ))}
        </select>
      </div>

      <DataTable<OrgProduct>
        columns={columns}
        rows={products}
        rowKey={(p) => p._id}
        loading={isLoading}
        emptyText={t("Ürün bulunamadı.")}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
        }}
        renderBody={
          groupedSections
            ? () => {
                const groupHeaderRow = (id: string, title: string, count: number, depth: 0 | 1) => {
                  const collapsed = collapsedGroups.has(id);
                  return (
                    <tr
                      key={`group-${id}`}
                      onClick={() => toggleGroup(id)}
                      style={{
                        cursor: "pointer",
                        background:
                          depth === 0 ? "var(--rezvix-bg-soft)" : "var(--rezvix-bg-elevated)",
                        borderBottom: "1px solid var(--rezvix-border-subtle)",
                      }}
                    >
                      <td
                        colSpan={columns.length}
                        style={{
                          padding: depth === 0 ? "10px 14px" : "8px 14px 8px 38px",
                          fontWeight: 700,
                          fontSize: depth === 0 ? 13 : 12.5,
                          color: depth === 0 ? "var(--rezvix-text-main)" : "var(--rezvix-primary)",
                        }}
                      >
                        <span style={{ marginRight: 8, display: "inline-block", width: 10 }}>
                          {collapsed ? "▸" : "▼"}
                        </span>
                        {depth === 0 ? title.toUpperCase() : title}
                        <span
                          style={{
                            marginLeft: 8,
                            color: "var(--rezvix-text-soft)",
                            fontWeight: 600,
                            fontSize: 11.5,
                          }}
                        >
                          ({count})
                        </span>
                      </td>
                    </tr>
                  );
                };

                return groupedSections.map((section) => {
                  const parentCollapsed = collapsedGroups.has(section.id);
                  const totalCount =
                    section.items.length + section.children.reduce((s, c) => s + c.items.length, 0);
                  return (
                    <React.Fragment key={section.id}>
                      {groupHeaderRow(section.id, section.title, totalCount, 0)}
                      {!parentCollapsed &&
                        section.items.map((p) => (
                          <DataTableRow
                            key={p._id}
                            row={p}
                            columns={columns}
                            rowKey={(r) => r._id}
                            isLast={false}
                          />
                        ))}
                      {!parentCollapsed &&
                        section.children.map((child) => (
                          <React.Fragment key={child.id}>
                            {groupHeaderRow(child.id, child.title, child.items.length, 1)}
                            {!collapsedGroups.has(child.id) &&
                              child.items.map((p) => (
                                <DataTableRow
                                  key={p._id}
                                  row={p}
                                  columns={columns}
                                  rowKey={(r) => r._id}
                                  isLast={false}
                                />
                              ))}
                          </React.Fragment>
                        ))}
                    </React.Fragment>
                  );
                });
              }
            : undefined
        }
      />

      <ProductModal
        modal={modal}
        orgId={orgId}
        categories={categories}
        onClose={closeModal}
      />

      <ProductOverridesDrawer
        open={overrideDrawer.open}
        product={overrideDrawer.product}
        orgId={orgId}
        onClose={() => setOverrideDrawer({ open: false, product: null })}
        t={t}
      />

      {wizardOpen && (
        <CsvImportWizard
          orgId={orgId}
          categories={normalizedCategories}
          onClose={() => setWizardOpen(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ["org-products", orgId] });
          }}
        />
      )}

      <BulkPriceModal
        open={bulkPriceOpen}
        productIds={Array.from(selectedIds)}
        orgId={orgId}
        onClose={() => {
          setBulkPriceOpen(false);
          setSelectedIds(new Set());
        }}
        t={t}
      />

      {excelWizardOpen && orgId && (
        <BulkPriceWizard
          onClose={() => setExcelWizardOpen(false)}
          onDone={() => {
            setExcelWizardOpen(false);
            qc.invalidateQueries({ queryKey: ["org-products", orgId] });
          }}
          submit={(rows, dryRun) => orgBulkPrice(orgId, rows, dryRun)}
        />
      )}
    </div>
  );
}
