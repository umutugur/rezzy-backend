import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import {
  marketGetProducts,
  marketCreateProduct,
  marketUpdateProduct,
  marketDeleteProduct,
  type PanelProduct,
} from "../../api/marketDesktop";
import { useI18n } from "../../i18n";
import { showToast } from "../../ui/Toast";

const emptyForm = { title: "", price: "", stock: "", unit: "adet", description: "" };

export function MarketProductsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; product: PanelProduct | null }>({ open: false, product: null });
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["market-products"],
    queryFn: () => marketGetProducts({ limit: 100 }),
  });

  const products: PanelProduct[] = (data?.items ?? []).filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setForm(emptyForm); setModal({ open: true, product: null }); };
  const openEdit = (p: PanelProduct) => {
    setForm({
      title: p.title,
      price: String(p.price),
      stock: String(p.stock),
      unit: p.unit,
      description: p.description ?? "",
    });
    setModal({ open: true, product: p });
  };
  const closeModal = () => setModal({ open: false, product: null });

  const { mutate: saveProduct, isPending: saving } = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        price: Number(form.price),
        stock: Number(form.stock),
        unit: form.unit,
        description: form.description,
      };
      if (modal.product) return marketUpdateProduct(modal.product._id, payload);
      return marketCreateProduct(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-products"] });
      showToast(t("Kaydedildi"), "success");
      closeModal();
    },
    onError: () => showToast(t("Kayıt başarısız"), "error"),
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

        {/* Modal */}
        {modal.open && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}>
            <div style={{
              background: "#1e2330", borderRadius: 16, padding: 32, width: 480,
              border: "1px solid #2d3348",
            }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>
                {modal.product ? t("Ürünü Düzenle") : t("Yeni Ürün")}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {([
                  { label: "Ürün Adı *", key: "title", type: "text" },
                  { label: "Fiyat (₺) *", key: "price", type: "number" },
                  { label: "Birim", key: "unit", type: "text" },
                  { label: "Stok", key: "stock", type: "number" },
                ] as Array<{ label: string; key: keyof typeof emptyForm; type: string }>).map(({ label, key, type }) => (
                  <div key={key}>
                    <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 4 }}>
                      {t(label)}
                    </label>
                    <input
                      type={type}
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{
                        width: "100%", padding: "10px 14px", borderRadius: 8,
                        border: "1px solid #2d3348", background: "#0f1117", color: "#fff",
                        fontSize: 14, outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
                <button
                  onClick={closeModal}
                  style={{
                    padding: "10px 20px", borderRadius: 8, border: "1px solid #374151",
                    background: "transparent", color: "#9ca3af", cursor: "pointer",
                  }}
                >
                  {t("Vazgeç")}
                </button>
                <button
                  onClick={() => saveProduct()}
                  disabled={!form.title.trim() || !form.price || saving}
                  style={{
                    padding: "10px 24px", borderRadius: 8, border: "none",
                    background: saving ? "#374151" : "#4f46e5", color: "#fff",
                    cursor: "pointer", fontWeight: 700,
                    opacity: (!form.title.trim() || !form.price) ? 0.5 : 1,
                  }}
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
