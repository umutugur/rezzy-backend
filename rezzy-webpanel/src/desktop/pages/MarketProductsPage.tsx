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
  panelBulkPrice,
  type PanelProduct,
  type MarketCoreCategory,
  type ProductImageSuggestion,
} from "../../api/marketDesktop";
import { useI18n } from "../../i18n";
import { showToast } from "../../ui/Toast";
import BulkPriceWizard from "../../pages/marketOrg/BulkPriceWizard";

const emptyForm = { title: "", price: "", stock: "", unit: "piece", description: "", brand: "", netQuantity: "", discountPrice: "", barcode: "" };
const emptyNetUnit: "L" | "ml" | "kg" | "g" | "piece" | "" = "";
const emptyAttributes: { label: string; value: string }[] = [];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1px solid #d7dbe6", background: "#ffffff", color: "#1b1c22",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  color: "#5b6172", fontSize: 12, display: "block", marginBottom: 4,
};

// ── Light section label ──────────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  color: "#9aa1b1", fontSize: 11, fontWeight: 700, letterSpacing: "0.09em",
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
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const allProducts: PanelProduct[] = data?.items ?? [];
  const products: PanelProduct[] = (() => {
    const s = search.trim().toLowerCase();
    if (!s) return allProducts;
    return allProducts.filter(p =>
      p.title.toLowerCase().includes(s) ||
      (p.barcode ?? "").toLowerCase().includes(s) ||
      (p.brand ?? "").toLowerCase().includes(s)
    );
  })();

  // List summary stats
  const statTotal = allProducts.length;
  const statActive = allProducts.filter(p => p.isActive).length;
  const statOut = allProducts.filter(p => p.stock === 0).length;

  const isSearching = search.trim().length > 0;

  const catIdOf = (p: PanelProduct): string => {
    const c = (p as any).category;
    return typeof c === "string" ? c : c?._id ?? "";
  };

  // ── Category grouping (parent → children) — only when not searching ──
  const groupedSections = (() => {
    if (isSearching) return null;
    const catsById = new Map(categories.map(c => [c._id, c]));
    const parents = categories.filter(c => !c.parentId);
    const childrenOf = (parentId: string) => categories.filter(c => c.parentId === parentId);

    const byCat = new Map<string, PanelProduct[]>();
    for (const p of products) {
      const cid = catIdOf(p);
      if (!byCat.has(cid)) byCat.set(cid, []);
      byCat.get(cid)!.push(p);
    }

    type Section = { id: string; title: string; products: PanelProduct[]; children: Section[] };
    const sections: Section[] = [];
    const usedCatIds = new Set<string>();

    for (const parent of parents) {
      const kids = childrenOf(parent._id);
      const parentProducts = byCat.get(parent._id) ?? [];
      const childSections: Section[] = [];
      for (const kid of kids) {
        const kidProducts = byCat.get(kid._id) ?? [];
        usedCatIds.add(kid._id);
        if (kidProducts.length > 0) {
          childSections.push({ id: kid._id, title: kid.i18n?.tr?.title ?? kid.key, products: kidProducts, children: [] });
        }
      }
      usedCatIds.add(parent._id);
      const totalCount = parentProducts.length + childSections.reduce((s, c) => s + c.products.length, 0);
      if (totalCount > 0) {
        sections.push({
          id: parent._id,
          title: parent.i18n?.tr?.title ?? parent.key,
          products: parentProducts,
          children: childSections,
        });
      }
    }

    // Products whose category isn't in the known list (or uncategorized)
    const orphanProducts: PanelProduct[] = [];
    for (const [cid, prods] of byCat.entries()) {
      if (!cid || !usedCatIds.has(cid)) orphanProducts.push(...prods);
    }
    if (orphanProducts.length > 0) {
      sections.push({ id: "__other", title: t("Diğer"), products: orphanProducts, children: [] });
    }

    return sections;
  })();

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ color: "#1b1c22", margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>{t("Ürünler")}</h2>
              <p style={{ color: "#5b6172", margin: "3px 0 0", fontSize: 13 }}>{t("Mağaza ürünlerinizi yönetin")}</p>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9aa1b1", fontSize: 14, pointerEvents: "none" }}>🔍</span>
                <input
                  className="mp-input"
                  placeholder={t("Ürün veya barkod ara…")}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    padding: "9px 14px 9px 34px", borderRadius: 10, border: "1px solid #d7dbe6",
                    background: "#ffffff", color: "#1b1c22", fontSize: 13.5, outline: "none", width: 260,
                  }}
                />
              </div>
              <button
                onClick={() => setBulkPriceOpen(true)}
                style={{
                  padding: "9px 18px", borderRadius: 10, border: "1px solid #cdd0f5",
                  background: "transparent", color: "#4f46e5", cursor: "pointer",
                  fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap",
                }}
              >
                📊 {t("Fiyat Güncelle (Excel)")}
              </button>
              <button
                onClick={openAdd}
                style={{
                  padding: "9px 18px", borderRadius: 10, border: "none",
                  background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", cursor: "pointer",
                  fontWeight: 700, fontSize: 13.5, boxShadow: "0 6px 16px rgba(79,70,229,.28)", whiteSpace: "nowrap",
                }}
              >
                + {t("Ürün Ekle")}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {[
              { label: t("Toplam"), value: statTotal, color: "#4f46e5", dot: "#6366f1" },
              { label: t("Aktif"), value: statActive, color: "#16a34a", dot: "#22c55e" },
              { label: t("Tükenen"), value: statOut, color: "#dc2626", dot: "#ef4444" },
            ].map(s => (
              <div key={s.label} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                borderRadius: 10, background: "#ffffff", border: "1px solid #e6e8ef", boxShadow: "0 1px 2px rgba(17,20,40,.04)",
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot }} />
                <span style={{ color: "#5b6172", fontSize: 12.5 }}>{s.label}</span>
                <span style={{ color: s.color, fontSize: 14, fontWeight: 700 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        <style>{`
          .mp-input { transition: border-color .15s ease, box-shadow .15s ease }
          .mp-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,.14) }
          .mp-input::placeholder { color: #9aa1b1 }
          .mp-row { transition: background .12s ease }
          .mp-row:hover { background: #f5f6fa }
          .mp-act { transition: background .12s ease }
          .mp-act:hover { background: rgba(99,102,241,.10) }
          .mp-act-del:hover { background: rgba(220,38,38,.08) }
          .mp-drop { transition: border-color .15s ease, background .15s ease }
          .mp-drop:hover { border-color: #6366f1 !important; background: #f3f4fb !important }
          .mp-sugg { transition: border-color .15s ease, transform .15s ease }
          .mp-sugg:hover { border-color: #6366f1 !important; transform: translateY(-3px) }
          .mp-body::-webkit-scrollbar { width: 9px }
          .mp-body::-webkit-scrollbar-thumb { background: #d7dbe6; border-radius: 6px }
          .mp-body::-webkit-scrollbar-track { background: transparent }
          .mp-ghost { transition: background .15s ease }
          .mp-ghost:hover { background: rgba(99,102,241,.10) }
          .mp-x:hover { background: #f1f3f9 !important; color: #1b1c22 !important }
        `}</style>

        {isLoading ? (
          <div style={{ color: "#5b6172", padding: 40, textAlign: "center" }}>{t("Yükleniyor…")}</div>
        ) : products.length === 0 ? (
          <div style={{
            color: "#9aa1b1", textAlign: "center", marginTop: 8, padding: "60px 20px",
            background: "#ffffff", borderRadius: 16, border: "1px dashed #e6e8ef",
          }}>
            <div style={{ fontSize: 40, marginBottom: 10, opacity: .7 }}>📦</div>
            <div style={{ fontSize: 16, color: "#5b6172" }}>
              {search ? t("Eşleşen ürün yok.") : t("Ürün bulunamadı.")}
            </div>
          </div>
        ) : (
          <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid #e6e8ef", overflow: "hidden", boxShadow: "0 1px 2px rgba(17,20,40,.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #eef0f4", background: "#f8f9fc" }}>
                  {[t("Ürün"), t("Kategori"), t("Fiyat"), t("Stok"), t("Durum"), ""].map((h, i) => (
                    <th key={i} style={{ padding: "13px 16px", color: "#9aa1b1", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: (i === 2 || i === 3) ? "center" : "left" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const renderRow = (p: PanelProduct) => {
                  const cat = typeof p.category === "object" && p.category ? (p.category.i18n?.tr?.title ?? p.category.key ?? "") : "";
                  const photo = p.photos?.[0] ?? null;
                  const hasDisc = p.discountPrice != null && p.discountPrice < p.price;
                  return (
                    <tr key={p._id} className="mp-row" style={{ borderBottom: "1px solid #f0f1f6" }}>
                      {/* Ürün: thumb + title + barcode */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {photo ? (
                            <img src={photo} alt="" style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", border: "1px solid #e6e8ef", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0, background: "#f1f3f9", border: "1px solid #e6e8ef", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1", fontWeight: 800, fontSize: 16 }}>
                              {p.title.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: "#1b1c22", fontWeight: 600, fontSize: 14 }}>{p.title}</div>
                            {p.barcode ? (
                              <div style={{ color: "#9aa1b1", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ fontSize: 11, letterSpacing: "-1px" }}>▌▍▌</span>{p.barcode}
                              </div>
                            ) : (
                              <div style={{ color: "#c3c7d2", fontSize: 11.5, marginTop: 2 }}>{t("Barkod yok")}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Kategori */}
                      <td style={{ padding: "12px 16px" }}>
                        {cat ? (
                          <span style={{ padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(99,102,241,.10)", color: "#4f46e5", border: "1px solid rgba(99,102,241,.22)" }}>{cat}</span>
                        ) : <span style={{ color: "#c3c7d2" }}>—</span>}
                      </td>
                      {/* Fiyat (discount-aware) */}
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        {hasDisc ? (
                          <div>
                            <span style={{ color: "#9aa1b1", textDecoration: "line-through", fontSize: 12.5, marginRight: 6 }}>₺{p.price.toFixed(2)}</span>
                            <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 14 }}>₺{(p.discountPrice as number).toFixed(2)}</span>
                          </div>
                        ) : (
                          <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 14 }}>₺{p.price.toFixed(2)}</span>
                        )}
                        <div style={{ color: "#9aa1b1", fontSize: 11, marginTop: 1 }}>/ {p.unit}</div>
                      </td>
                      {/* Stok stepper */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <button onClick={() => quickStock({ id: p._id, stock: Math.max(0, p.stock - 1) })} style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #d7dbe6", background: "#ffffff", color: "#5b6172", cursor: "pointer", fontWeight: 700, fontSize: 15, lineHeight: "24px" }}>−</button>
                          <span style={{ color: p.stock === 0 ? "#dc2626" : "#1b1c22", minWidth: 30, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{p.stock}</span>
                          <button onClick={() => quickStock({ id: p._id, stock: p.stock + 1 })} style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid #d7dbe6", background: "#ffffff", color: "#5b6172", cursor: "pointer", fontWeight: 700, fontSize: 15, lineHeight: "24px" }}>+</button>
                        </div>
                      </td>
                      {/* Durum */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 600, background: p.isActive ? "rgba(22,163,74,.10)" : "rgba(220,38,38,.10)", color: p.isActive ? "#16a34a" : "#dc2626", border: `1px solid ${p.isActive ? "rgba(22,163,74,.24)" : "rgba(220,38,38,.24)"}` }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.isActive ? "#16a34a" : "#dc2626" }} />
                          {p.isActive ? t("Aktif") : t("Pasif")}
                        </span>
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button className="mp-act" onClick={() => openEdit(p)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #cdd0f5", background: "transparent", color: "#4f46e5", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>{t("Düzenle")}</button>
                          <button className="mp-act-del" onClick={() => { if (window.confirm(t("Silmek istediğinizden emin misiniz?"))) deleteProduct(p._id); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #f1d5d5", background: "transparent", color: "#dc2626", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>{t("Sil")}</button>
                        </div>
                      </td>
                    </tr>
                  );
                  };

                  const groupHeaderRow = (id: string, title: string, count: number, depth: 0 | 1) => {
                    const collapsed = collapsedGroups.has(id);
                    return (
                      <tr key={`group-${id}`} onClick={() => toggleGroup(id)} style={{ cursor: "pointer", background: depth === 0 ? "#f3f4fb" : "#f8f9fc", borderBottom: "1px solid #eef0f4" }}>
                        <td colSpan={6} style={{ padding: depth === 0 ? "10px 16px" : "8px 16px 8px 40px", fontWeight: 700, fontSize: depth === 0 ? 13 : 12.5, color: depth === 0 ? "#1b1c22" : "#4f46e5" }}>
                          <span style={{ marginRight: 8, display: "inline-block", width: 10 }}>{collapsed ? "▸" : "▾"}</span>
                          {depth === 0 ? title.toUpperCase() : title}
                          <span style={{ marginLeft: 8, color: "#9aa1b1", fontWeight: 600, fontSize: 11.5 }}>({count})</span>
                        </td>
                      </tr>
                    );
                  };

                  if (groupedSections) {
                    return groupedSections.map(section => {
                      const parentCollapsed = collapsedGroups.has(section.id);
                      const totalCount = section.products.length + section.children.reduce((s, c) => s + c.products.length, 0);
                      return (
                        <React.Fragment key={section.id}>
                          {groupHeaderRow(section.id, section.title, totalCount, 0)}
                          {!parentCollapsed && section.products.map(renderRow)}
                          {!parentCollapsed && section.children.map(child => (
                            <React.Fragment key={child.id}>
                              {groupHeaderRow(child.id, child.title, child.products.length, 1)}
                              {!collapsedGroups.has(child.id) && child.products.map(renderRow)}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      );
                    });
                  }

                  return products.map(renderRow);
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Product Modal (light, two-column, sectioned, no-scroll-on-desktop) ── */}
        {modal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(17,20,40,.42)",
            backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
            display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000,
            overflowY: "auto", padding: "32px 20px",
          }}>
            <style>{`
              @keyframes mpIn { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } }
              .mp-card { animation: mpIn .22s cubic-bezier(.16,1,.3,1) }
            `}</style>

            <div className="mp-card" style={{
              background: "#ffffff", borderRadius: 18, width: 960, maxWidth: "100%",
              maxHeight: "calc(100vh - 64px)", display: "flex", flexDirection: "column",
              border: "1px solid #e6e8ef", boxShadow: "0 24px 70px rgba(17,20,40,.22)", overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "20px 28px", borderBottom: "1px solid #eef0f4",
                background: "linear-gradient(180deg, #fafbff 0%, #ffffff 100%)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, boxShadow: "0 6px 18px rgba(79,70,229,.32)",
                  }}>🛒</div>
                  <div>
                    <h3 style={{ color: "#1b1c22", margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>
                      {modal.product ? t("Ürünü Düzenle") : t("Yeni Ürün")}
                    </h3>
                    <p style={{ color: "#9aa1b1", margin: "2px 0 0", fontSize: 12.5 }}>
                      {modal.product ? t("Ürün bilgilerini güncelleyin") : t("Mağazanıza yeni bir ürün ekleyin")}
                    </p>
                  </div>
                </div>
                <button
                  className="mp-x"
                  onClick={closeModal}
                  style={{
                    width: 34, height: 34, borderRadius: 9, border: "1px solid #e6e8ef",
                    background: "transparent", color: "#9aa1b1", cursor: "pointer",
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
                    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid #e6e8ef" }}>
                      <img src={formPhoto} alt="preview" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                      <button
                        type="button"
                        onClick={() => setFormPhoto("")}
                        style={{
                          position: "absolute", top: 10, right: 10, padding: "6px 12px", borderRadius: 8,
                          border: "none", background: "rgba(255,255,255,.92)", color: "#dc2626",
                          cursor: "pointer", fontSize: 12.5, fontWeight: 600, backdropFilter: "blur(4px)", boxShadow: "0 2px 8px rgba(17,20,40,.12)",
                        }}
                      >
                        {t("Kaldır")}
                      </button>
                    </div>
                  ) : (
                    <label className="mp-drop" style={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      gap: 8, height: 200, borderRadius: 14, border: "1.5px dashed #d7dbe6",
                      background: "#f8f9fc", cursor: photoUploading ? "wait" : "pointer", textAlign: "center", padding: 16,
                    }}>
                      <div style={{ fontSize: 30, opacity: 0.85 }}>{photoUploading ? "⏳" : "🖼️"}</div>
                      <span style={{ color: "#1b1c22", fontSize: 13.5, fontWeight: 600 }}>
                        {photoUploading ? t("Yükleniyor…") : t("Görsel yükle")}
                      </span>
                      <span style={{ color: "#9aa1b1", fontSize: 11.5 }}>PNG · JPG</span>
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
                      <span style={{ color: "#4f46e5", fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
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
                              border: "2px solid #e6e8ef", cursor: "pointer", display: "block",
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ color: "#9aa1b1", fontSize: 11, marginTop: 6, display: "block" }}>
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
                    <label style={labelStyle}>{t("Kategori")} <span style={{ color: "#dc2626" }}>*</span></label>
                    <select
                      className="mp-input"
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value)}
                      style={{ ...inputStyle, color: formCategory ? "#1b1c22" : "#9aa1b1", cursor: "pointer", appearance: "none",
                        backgroundImage: "linear-gradient(45deg, transparent 50%, #9aa1b1 50%), linear-gradient(135deg, #9aa1b1 50%, transparent 50%)",
                        backgroundPosition: "calc(100% - 18px) 18px, calc(100% - 13px) 18px", backgroundSize: "5px 5px, 5px 5px", backgroundRepeat: "no-repeat",
                        borderColor: !formCategory ? "#f0c8c8" : "#d7dbe6" }}
                    >
                      <option value="">{t("Kategori seçiniz")}</option>
                      {categories.map(cat => (
                        <option key={cat._id} value={cat._id}>
                          {cat.i18n?.tr?.title ?? cat.key}
                        </option>
                      ))}
                    </select>
                    {!formCategory && (
                      <span style={{ color: "#dc2626", fontSize: 11, marginTop: 5, display: "block" }}>
                        {t("Kategori zorunludur")}
                      </span>
                    )}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{t("Ürün Adı")} <span style={{ color: "#dc2626" }}>*</span></label>
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
                      <label style={labelStyle}>{t("Fiyat")} (₺) <span style={{ color: "#dc2626" }}>*</span></label>
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
                          <span style={{ color: "#16a34a", marginLeft: 8, fontWeight: 700 }}>−%{discountPct}</span>
                        )}
                      </label>
                      <input
                        className="mp-input"
                        type="number"
                        value={form.discountPrice}
                        onChange={e => setForm(f => ({ ...f, discountPrice: e.target.value }))}
                        placeholder={t("isteğe bağlı")}
                        style={{ ...inputStyle, borderColor: discountPct != null ? "#9be0b6" : "#d7dbe6" }}
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
                        style={{ ...inputStyle, color: formNetUnit ? "#1b1c22" : "#9aa1b1", cursor: "pointer" }}
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
                        padding: "5px 12px", borderRadius: 7, border: "1px solid #cdd0f5",
                        background: "transparent", color: "#4f46e5", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      + {t("Özellik Ekle")}
                    </button>
                  </div>
                  {formAttributes.length === 0 ? (
                    <div style={{
                      border: "1px dashed #e6e8ef", borderRadius: 10, padding: "14px 16px",
                      color: "#9aa1b1", fontSize: 12.5, textAlign: "center",
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
                            width: 32, height: 32, borderRadius: 7, border: "1px solid #f1d5d5",
                            background: "transparent", color: "#dc2626", cursor: "pointer",
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
                padding: "16px 28px", borderTop: "1px solid #eef0f4",
                background: "#fafbff",
              }}>
                <span style={{ color: canSave ? "#9aa1b1" : "#dc2626", fontSize: 12.5, flex: 1 }}>
                  {canSave ? t("Kaydetmeye hazır") : t("Kategori, ürün adı ve fiyat zorunludur")}
                </span>
                <button
                  className="mp-ghost"
                  onClick={closeModal}
                  style={{
                    padding: "10px 20px", borderRadius: 9, border: "1px solid #d7dbe6",
                    background: "transparent", color: "#5b6172", cursor: "pointer", fontWeight: 600, fontSize: 14,
                  }}
                >
                  {t("Vazgeç")}
                </button>
                <button
                  onClick={() => saveProduct()}
                  disabled={!canSave}
                  style={{
                    padding: "10px 26px", borderRadius: 9, border: "none",
                    background: canSave ? "linear-gradient(135deg, #4f46e5, #6366f1)" : "#eceef4",
                    color: canSave ? "#fff" : "#9aa1b1",
                    cursor: canSave ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14,
                    boxShadow: canSave ? "0 6px 18px rgba(79,70,229,.30)" : "none",
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

        {bulkPriceOpen && (
          <BulkPriceWizard
            onClose={() => setBulkPriceOpen(false)}
            onDone={() => {
              setBulkPriceOpen(false);
              qc.invalidateQueries({ queryKey: ["market-products"] });
            }}
            submit={(rows, dryRun) => panelBulkPrice(rows, dryRun)}
          />
        )}
      </div>
    </MarketDesktopLayout>
  );
}
