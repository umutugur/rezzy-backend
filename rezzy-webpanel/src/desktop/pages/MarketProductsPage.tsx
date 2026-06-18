import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import {
  marketGetProducts,
  marketCreateProduct,
  marketUpdateProduct,
  marketDeleteProduct,
  getMarketCategories,
  uploadMarketImage,
  getProductImageSuggestions,
  type PanelProduct,
  type MarketCoreCategory,
  type ProductImageSuggestion,
} from "../../api/marketDesktop";
import { useI18n } from "../../i18n";
import { showToast } from "../../ui/Toast";

const emptyForm = { title: "", price: "", stock: "", unit: "piece", description: "", brand: "", netQuantity: "", discountPrice: "", barcode: "" };
const emptyNetUnit: "L" | "ml" | "kg" | "g" | "piece" | "" = "";
const emptyAttributes: { label: string; value: string }[] = [];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1px solid #2d3348", background: "#0f1117", color: "#fff",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 4,
};

// ── Redesigned modal style tokens ──────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  color: "#5b6577", fontSize: 11, fontWeight: 700, letterSpacing: "0.09em",
  textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
};

export function MarketProductsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; product: PanelProduct | null }>({ open: false, product: null });
  const [form, setForm] = useState(emptyForm);
  const [formNetUnit, setFormNetUnit] = useState<"L" | "ml" | "kg" | "g" | "piece" | "">(emptyNetUnit);
  const [formAttributes, setFormAttributes] = useState<{ label: string; value: string }[]>(emptyAttributes);
  const [formCategory, setFormCategory] = useState<string>("");
  const [formPhoto, setFormPhoto] = useState<string>("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<ProductImageSuggestion[]>([]);
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load categories
  const { data: categoriesData } = useQuery({
    queryKey: ["market-core-categories"],
    queryFn: getMarketCategories,
  });
  const categories: MarketCoreCategory[] = categoriesData?.items ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["market-products"],
    queryFn: () => marketGetProducts({ limit: 100 }),
  });

  const products: PanelProduct[] = (data?.items ?? []).filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );

  // Debounced suggestions fetch
  useEffect(() => {
    if (!modal.open) return;
    const { title, brand, barcode } = form;
    if (!title.trim() && !brand.trim() && !barcode.trim()) {
      setSuggestions([]);
      return;
    }
    if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
    suggestionsTimerRef.current = setTimeout(() => {
      getProductImageSuggestions({
        title: title.trim() || undefined,
        brand: brand.trim() || undefined,
        barcode: barcode.trim() || undefined,
      })
        .then(res => setSuggestions(res.items ?? []))
        .catch(() => setSuggestions([]));
    }, 500);
    return () => {
      if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
    };
  }, [form.title, form.brand, form.barcode, modal.open]);

  const openAdd = () => {
    setForm(emptyForm);
    setFormNetUnit(emptyNetUnit);
    setFormAttributes([]);
    setFormCategory("");
    setFormPhoto("");
    setSuggestions([]);
    setModal({ open: true, product: null });
  };

  const openEdit = (p: PanelProduct) => {
    setForm({
      title: p.title,
      price: String(p.price),
      stock: String(p.stock),
      unit: p.unit,
      description: p.description ?? "",
      brand: p.brand ?? "",
      netQuantity: p.netQuantity != null ? String(p.netQuantity) : "",
      discountPrice: p.discountPrice != null ? String(p.discountPrice) : "",
      barcode: (p as any).barcode ?? "",
    });
    setFormNetUnit((p.netUnit ?? "") as "L" | "ml" | "kg" | "g" | "piece" | "");
    setFormAttributes(p.attributes ? p.attributes.map(a => ({ ...a })) : []);
    // category may be an object { _id } or a string id
    const catVal = (p as any).category;
    setFormCategory(typeof catVal === "string" ? catVal : catVal?._id ?? "");
    setFormPhoto((p as any).photos?.[0] ?? "");
    setSuggestions([]);
    setModal({ open: true, product: p });
  };

  const closeModal = () => {
    setModal({ open: false, product: null });
    setSuggestions([]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const res = await uploadMarketImage(file);
      setFormPhoto(res.url);
    } catch {
      showToast(t("Görsel yüklenemedi"), "error");
    } finally {
      setPhotoUploading(false);
    }
  };

  const { mutate: saveProduct, isPending: saving } = useMutation({
    mutationFn: async () => {
      if (!formCategory) throw new Error("category_required");
      const priceNum = Number(form.price);
      const dpNum = form.discountPrice !== "" ? Number(form.discountPrice) : NaN;
      const validDiscount = !isNaN(dpNum) && dpNum >= 0 && dpNum < priceNum ? dpNum : null;
      const payload: any = {
        title: form.title.trim(),
        price: priceNum,
        stock: Number(form.stock),
        unit: form.unit,
        description: form.description,
        ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
        netQuantity: form.netQuantity !== "" ? Number(form.netQuantity) : null,
        netUnit: (formNetUnit || null) as "L" | "ml" | "kg" | "g" | "piece" | null,
        attributes: formAttributes.filter(a => a.label.trim() && a.value.trim()),
        discountPrice: validDiscount,
        category: formCategory,
        ...(form.barcode.trim() ? { barcode: form.barcode.trim() } : {}),
        photos: formPhoto ? [formPhoto] : [],
      };
      if (modal.product) return marketUpdateProduct(modal.product._id, payload);
      return marketCreateProduct(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-products"] });
      showToast(t("Kaydedildi"), "success");
      closeModal();
    },
    onError: (err: any) => {
      if (err?.message === "category_required") {
        showToast(t("Kategori seçimi zorunludur"), "error");
      } else {
        showToast(t("Kayıt başarısız"), "error");
      }
    },
  });

  const { mutate: deleteProduct } = useMutation({
    mutationFn: (id: string) => marketDeleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-products"] });
      showToast(t("Silindi"), "success");
    },
    onError: () => showToast(t("Silme başarısız"), "error"),
  });

  const { mutate: quickStock } = useMutation({
    mutationFn: ({ id, stock }: { id: string; stock: number }) =>
      marketUpdateProduct(id, { stock }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["market-products"] }),
  });

  // Discount percent (for the inline badge)
  const discountPct = (() => {
    const dp = Number(form.discountPrice);
    const pr = Number(form.price);
    if (form.discountPrice !== "" && !isNaN(dp) && dp >= 0 && pr > 0 && dp < pr) {
      return Math.round((1 - dp / pr) * 100);
    }
    return null;
  })();

  const canSave = !(!form.title.trim() || !form.price || !formCategory || saving);

  return (
    <MarketDesktopLayout>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ color: "#fff", margin: 0, fontSize: 22, fontWeight: 700 }}>{t("Ürünler")}</h2>
          <div style={{ display: "flex", gap: 12 }}>
            <input
              placeholder={t("Ara…")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid #2d3348",
                background: "#1e2330", color: "#fff", fontSize: 13, outline: "none", width: 200,
              }}
            />
            <button
              onClick={openAdd}
              style={{
                padding: "8px 20px", borderRadius: 8, border: "none",
                background: "#4f46e5", color: "#fff", cursor: "pointer",
                fontWeight: 600, fontSize: 14,
              }}
            >
              + {t("Ürün Ekle")}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ color: "#9ca3af" }}>{t("Yükleniyor…")}</div>
        ) : products.length === 0 ? (
          <div style={{ color: "#6b7280", textAlign: "center", marginTop: 60, fontSize: 16 }}>
            {t("Ürün bulunamadı.")}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2d3348" }}>
                {["Ürün Adı", "Fiyat", "Birim", "Stok", "Durum", ""].map(h => (
                  <th key={h} style={{ padding: "10px 12px", color: "#6b7280", fontWeight: 600, fontSize: 12, textAlign: "left" }}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p._id} style={{ borderBottom: "1px solid #2d3348" }}>
                  <td style={{ padding: "12px", color: "#e5e7eb", fontWeight: 500 }}>{p.title}</td>
                  <td style={{ padding: "12px", color: "#10b981", fontWeight: 700 }}>₺{p.price.toFixed(2)}</td>
                  <td style={{ padding: "12px", color: "#9ca3af" }}>{p.unit}</td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        onClick={() => quickStock({ id: p._id, stock: Math.max(0, p.stock - 1) })}
                        style={{
                          width: 24, height: 24, borderRadius: 4, border: "1px solid #374151",
                          background: "#1e2330", color: "#fff", cursor: "pointer",
                          fontWeight: 700, lineHeight: "22px", textAlign: "center",
                        }}
                      >
                        −
                      </button>
                      <span style={{ color: p.stock === 0 ? "#ef4444" : "#e5e7eb", minWidth: 28, textAlign: "center" }}>
                        {p.stock}
                      </span>
                      <button
                        onClick={() => quickStock({ id: p._id, stock: p.stock + 1 })}
                        style={{
                          width: 24, height: 24, borderRadius: 4, border: "1px solid #374151",
                          background: "#1e2330", color: "#fff", cursor: "pointer",
                          fontWeight: 700, lineHeight: "22px", textAlign: "center",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{
                      borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600,
                      background: p.isActive ? "#10b98122" : "#ef444422",
                      color: p.isActive ? "#10b981" : "#ef4444",
                    }}>
                      {p.isActive ? t("Aktif") : t("Pasif")}
                    </span>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => openEdit(p)}
                        style={{
                          padding: "5px 12px", borderRadius: 6, border: "1px solid #4f46e5",
                          background: "transparent", color: "#818cf8", cursor: "pointer", fontSize: 12,
                        }}
                      >
                        {t("Düzenle")}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(t("Silmek istediğinizden emin misiniz?"))) {
                            deleteProduct(p._id);
                          }
                        }}
                        style={{
                          padding: "5px 12px", borderRadius: 6, border: "1px solid #ef4444",
                          background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12,
                        }}
                      >
                        {t("Sil")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Product Modal (redesigned: two-column, sectioned, no-scroll-on-desktop) ── */}
        {modal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(7,9,14,0.74)",
            backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
            display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000,
            overflowY: "auto", padding: "32px 20px",
          }}>
            <style>{`
              @keyframes mpIn { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } }
              .mp-card { animation: mpIn .22s cubic-bezier(.16,1,.3,1) }
              .mp-input { transition: border-color .15s ease, box-shadow .15s ease, background .15s ease }
              .mp-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,.18) }
              .mp-input::placeholder { color: #4b5563 }
              .mp-drop { transition: border-color .15s ease, background .15s ease }
              .mp-drop:hover { border-color: #6366f1 !important; background: #14161e !important }
              .mp-sugg { transition: border-color .15s ease, transform .15s ease }
              .mp-sugg:hover { border-color: #6366f1 !important; transform: translateY(-3px) }
              .mp-body::-webkit-scrollbar { width: 9px }
              .mp-body::-webkit-scrollbar-thumb { background: #2d3348; border-radius: 6px }
              .mp-body::-webkit-scrollbar-track { background: transparent }
              .mp-ghost { transition: background .15s ease, color .15s ease, border-color .15s ease }
              .mp-ghost:hover { background: rgba(99,102,241,.12) }
              .mp-x:hover { background: #2d3348 !important; color: #fff !important }
            `}</style>

            <div className="mp-card" style={{
              background: "#161a24", borderRadius: 18, width: 960, maxWidth: "100%",
              maxHeight: "calc(100vh - 64px)", display: "flex", flexDirection: "column",
              border: "1px solid #262c3a", boxShadow: "0 24px 70px rgba(0,0,0,.55)", overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "20px 28px", borderBottom: "1px solid #232838",
                background: "linear-gradient(180deg, #1b2030 0%, #161a24 100%)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, boxShadow: "0 6px 18px rgba(79,70,229,.4)",
                  }}>🛒</div>
                  <div>
                    <h3 style={{ color: "#fff", margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
                      {modal.product ? t("Ürünü Düzenle") : t("Yeni Ürün")}
                    </h3>
                    <p style={{ color: "#6b7280", margin: "2px 0 0", fontSize: 12.5 }}>
                      {modal.product ? t("Ürün bilgilerini güncelleyin") : t("Mağazanıza yeni bir ürün ekleyin")}
                    </p>
                  </div>
                </div>
                <button
                  className="mp-x"
                  onClick={closeModal}
                  style={{
                    width: 34, height: 34, borderRadius: 9, border: "1px solid #2d3348",
                    background: "transparent", color: "#9ca3af", cursor: "pointer",
                    fontSize: 20, lineHeight: "30px", textAlign: "center", flexShrink: 0,
                  }}
                  aria-label={t("Kapat")}
                >×</button>
              </div>

              {/* Body — two columns */}
              <div className="mp-body" style={{
                flex: 1, overflowY: "auto", padding: 28,
                display: "grid", gridTemplateColumns: "300px 1fr", gap: 28, alignItems: "start",
              }}>
                {/* ── LEFT: media + identity ── */}
                <div>
                  <span style={sectionLabel}>{t("Görsel")}</span>

                  {formPhoto ? (
                    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid #2d3348" }}>
                      <img src={formPhoto} alt="preview" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                      <button
                        type="button"
                        onClick={() => setFormPhoto("")}
                        style={{
                          position: "absolute", top: 10, right: 10, padding: "6px 12px", borderRadius: 8,
                          border: "none", background: "rgba(15,17,23,.82)", color: "#f87171",
                          cursor: "pointer", fontSize: 12.5, fontWeight: 600, backdropFilter: "blur(4px)",
                        }}
                      >
                        {t("Kaldır")}
                      </button>
                    </div>
                  ) : (
                    <label className="mp-drop" style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 8, height: 200, borderRadius: 14, border: "1.5px dashed #313a4e",
                      background: "#10131b", cursor: photoUploading ? "wait" : "pointer", textAlign: "center", padding: 16,
                    }}>
                      <div style={{ fontSize: 30, opacity: 0.85 }}>{photoUploading ? "⏳" : "🖼️"}</div>
                      <span style={{ color: "#cbd5e1", fontSize: 13.5, fontWeight: 600 }}>
                        {photoUploading ? t("Yükleniyor…") : t("Görsel yükle")}
                      </span>
                      <span style={{ color: "#5b6577", fontSize: 11.5 }}>PNG · JPG</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={photoUploading}
                        style={{ display: "none" }}
                      />
                    </label>
                  )}

                  {/* Image suggestions — only when no photo chosen */}
                  {!formPhoto && suggestions.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <span style={{ color: "#818cf8", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
                        ✨ {t("Bu ürünün görseli sistemde var")}
                      </span>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                        {suggestions.slice(0, 8).map((s, i) => (
                          <img
                            key={i}
                            className="mp-sugg"
                            src={s.url}
                            alt={s.title}
                            title={s.title}
                            onClick={() => setFormPhoto(s.url)}
                            style={{
                              width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 9,
                              border: "2px solid #2d3348", cursor: "pointer", display: "block",
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ color: "#5b6577", fontSize: 11, marginTop: 6, display: "block" }}>
                        {t("birini seçin")}
                      </span>
                    </div>
                  )}
                </div>

                {/* ── RIGHT: fields ── */}
                <div>
                  {/* TEMEL BİLGİLER */}
                  <span style={sectionLabel}>{t("Temel Bilgiler")}</span>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{t("Kategori")} <span style={{ color: "#f87171" }}>*</span></label>
                    <select
                      className="mp-input"
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value)}
                      style={{ ...inputStyle, color: formCategory ? "#fff" : "#5b6577", cursor: "pointer", appearance: "none",
                        backgroundImage: "linear-gradient(45deg, transparent 50%, #6b7280 50%), linear-gradient(135deg, #6b7280 50%, transparent 50%)",
                        backgroundPosition: "calc(100% - 18px) 18px, calc(100% - 13px) 18px", backgroundSize: "5px 5px, 5px 5px", backgroundRepeat: "no-repeat",
                        borderColor: !formCategory ? "#7f1d1d" : "#2d3348" }}
                    >
                      <option value="">{t("Kategori seçiniz")}</option>
                      {categories.map(cat => (
                        <option key={cat._id} value={cat._id}>
                          {cat.i18n?.tr?.title ?? cat.key}
                        </option>
                      ))}
                    </select>
                    {!formCategory && (
                      <span style={{ color: "#f87171", fontSize: 11, marginTop: 5, display: "block" }}>
                        {t("Kategori zorunludur")}
                      </span>
                    )}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{t("Ürün Adı")} <span style={{ color: "#f87171" }}>*</span></label>
                    <input
                      className="mp-input"
                      type="text"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder={t("ör. Tam Yağlı Süt 1L")}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>{t("Fiyat")} (₺) <span style={{ color: "#f87171" }}>*</span></label>
                      <input
                        className="mp-input"
                        type="number"
                        value={form.price}
                        onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                        placeholder="0.00"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        {t("İndirimli Fiyat")} (₺)
                        {discountPct != null && (
                          <span style={{ color: "#10b981", marginLeft: 8, fontWeight: 700 }}>−%{discountPct}</span>
                        )}
                      </label>
                      <input
                        className="mp-input"
                        type="number"
                        value={form.discountPrice}
                        onChange={e => setForm(f => ({ ...f, discountPrice: e.target.value }))}
                        placeholder={t("isteğe bağlı")}
                        style={{ ...inputStyle, borderColor: discountPct != null ? "#10b98166" : "#2d3348" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>{t("Birim")}</label>
                      <input
                        className="mp-input"
                        type="text"
                        value={form.unit}
                        onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                        placeholder="piece"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t("Stok")}</label>
                      <input
                        className="mp-input"
                        type="number"
                        value={form.stock}
                        onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* DETAYLAR */}
                  <span style={{ ...sectionLabel, marginTop: 26 }}>{t("Detaylar")}</span>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>{t("Marka")}</label>
                      <input
                        className="mp-input"
                        type="text"
                        value={form.brand}
                        onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                        placeholder="ör. Ülker"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t("Barkod")}</label>
                      <input
                        className="mp-input"
                        type="text"
                        value={form.barcode}
                        onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))}
                        placeholder="8690504001986"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>{t("Net Miktar")}</label>
                      <input
                        className="mp-input"
                        type="number"
                        value={form.netQuantity}
                        onChange={e => setForm(f => ({ ...f, netQuantity: e.target.value }))}
                        placeholder="ör. 500"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t("Net Birim")}</label>
                      <select
                        className="mp-input"
                        value={formNetUnit}
                        onChange={e => setFormNetUnit(e.target.value as "L" | "ml" | "kg" | "g" | "piece" | "")}
                        style={{ ...inputStyle, color: formNetUnit ? "#fff" : "#5b6577", cursor: "pointer" }}
                      >
                        <option value="">{t("Seçiniz")}</option>
                        <option value="L">L</option>
                        <option value="ml">ml</option>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="piece">piece</option>
                      </select>
                    </div>
                  </div>

                  {/* ÖZELLİKLER */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 14 }}>
                    <span style={{ ...sectionLabel, margin: 0 }}>{t("Özellikler")}</span>
                    <button
                      type="button"
                      className="mp-ghost"
                      onClick={() => setFormAttributes(prev => [...prev, { label: "", value: "" }])}
                      style={{
                        padding: "5px 12px", borderRadius: 7, border: "1px solid #3730a3",
                        background: "transparent", color: "#818cf8", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      + {t("Özellik Ekle")}
                    </button>
                  </div>
                  {formAttributes.length === 0 ? (
                    <div style={{
                      border: "1px dashed #262c3a", borderRadius: 10, padding: "14px 16px",
                      color: "#5b6577", fontSize: 12.5, textAlign: "center",
                    }}>
                      {t("Renk, içerik gibi ek özellikler ekleyebilirsiniz")}
                    </div>
                  ) : (
                    formAttributes.map((attr, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <input
                          className="mp-input"
                          type="text"
                          value={attr.label}
                          onChange={e => setFormAttributes(prev => prev.map((a, i) => i === idx ? { ...a, label: e.target.value } : a))}
                          placeholder={t("ör. Renk")}
                          style={{ ...inputStyle, flex: 1, padding: "9px 12px", fontSize: 13 }}
                        />
                        <input
                          className="mp-input"
                          type="text"
                          value={attr.value}
                          onChange={e => setFormAttributes(prev => prev.map((a, i) => i === idx ? { ...a, value: e.target.value } : a))}
                          placeholder={t("ör. Kırmızı")}
                          style={{ ...inputStyle, flex: 1, padding: "9px 12px", fontSize: 13 }}
                        />
                        <button
                          type="button"
                          onClick={() => setFormAttributes(prev => prev.filter((_, i) => i !== idx))}
                          style={{
                            width: 32, height: 32, borderRadius: 7, border: "1px solid #3f2330",
                            background: "transparent", color: "#f87171", cursor: "pointer",
                            fontWeight: 700, fontSize: 16, lineHeight: "30px", textAlign: "center", flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "16px 28px", borderTop: "1px solid #232838",
                background: "#13161f",
              }}>
                <span style={{ color: canSave ? "#5b6577" : "#f8717199", fontSize: 12.5, flex: 1 }}>
                  {canSave ? t("Kaydetmeye hazır") : t("Kategori, ürün adı ve fiyat zorunludur")}
                </span>
                <button
                  className="mp-ghost"
                  onClick={closeModal}
                  style={{
                    padding: "10px 20px", borderRadius: 9, border: "1px solid #2d3348",
                    background: "transparent", color: "#9ca3af", cursor: "pointer", fontWeight: 600, fontSize: 14,
                  }}
                >
                  {t("Vazgeç")}
                </button>
                <button
                  onClick={() => saveProduct()}
                  disabled={!canSave}
                  style={{
                    padding: "10px 26px", borderRadius: 9, border: "none",
                    background: canSave ? "linear-gradient(135deg, #4f46e5, #6366f1)" : "#262c3a",
                    color: canSave ? "#fff" : "#5b6577",
                    cursor: canSave ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14,
                    boxShadow: canSave ? "0 6px 18px rgba(79,70,229,.35)" : "none",
                    transition: "transform .12s ease, box-shadow .15s ease",
                  }}
                  onMouseDown={e => { if (canSave) e.currentTarget.style.transform = "scale(.97)"; }}
                  onMouseUp={e => { e.currentTarget.style.transform = "none"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}
                >
                  {saving ? t("Kaydediliyor…") : (modal.product ? t("Güncelle") : t("Ekle"))}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MarketDesktopLayout>
  );
}
