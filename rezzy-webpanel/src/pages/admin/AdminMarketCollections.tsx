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
          <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("Market Koleksiyonları")}</h2>
        </div>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">{t("Yeni Koleksiyon Ekle")}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Başlık")}</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("örn: İndirimdekiler")}
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Bölge (opsiyonel)")}</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">{t("Hepsi")}</option>
                <option value="TR">TR</option>
                <option value="CY">CY</option>
              </select>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Tip")}</div>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as MarketCollectionKind)}
              >
                <option value="manual">{t("Elle seçilen ürünler")}</option>
                <option value="discounted">{t("İndirimdekiler")}</option>
              </select>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Görsel URL (opsiyonel)")}</div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">{t("Sıra (order)")}</div>
              <input
                type="number"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActiveCreate}
                  onChange={(e) => setIsActiveCreate(e.target.checked)}
                />
                {t("Aktif")}
              </label>
            </div>

            {kind === "manual" ? (
              <div className="md:col-span-3">
                <div className="text-xs text-gray-500 mb-1">{t("Ürünler")}</div>
                <EntityPicker
                  multiple
                  fetcher={pickMarketProducts}
                  value={productIds}
                  onChange={(ids) => setProductIds(ids as string[])}
                  placeholder={t("Ürün ara ve ekle...")}
                />
              </div>
            ) : null}

            <div className="md:col-span-3">
              <button
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60"
              >
                {createMut.isPending ? t("Ekleniyor...") : t("Koleksiyon Ekle")}
              </button>
            </div>
          </div>
        </Card>

        <div className="overflow-auto bg-white rounded-2xl shadow-soft">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-4">{t("Başlık")}</th>
                <th className="py-2 px-4">{t("Region")}</th>
                <th className="py-2 px-4">{t("Tip")}</th>
                <th className="py-2 px-4">{t("Ürün Sayısı")}</th>
                <th className="py-2 px-4">{t("Order")}</th>
                <th className="py-2 px-4">{t("Durum")}</th>
                <th className="py-2 px-4">{t("İşlem")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={7}>
                    {t("Yükleniyor…")}
                  </td>
                </tr>
              )}

              {(collections ?? []).map((c: MarketCollection) => (
                <tr key={c._id} className="border-t align-top">
                  <td className="py-2 px-4">
                    <input
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      defaultValue={c.title}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value !== c.title) {
                          updateMut.mutate({ id: c._id, patch: { title: e.target.value.trim() } });
                        }
                      }}
                    />
                  </td>

                  <td className="py-2 px-4">
                    <input
                      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      defaultValue={c.region ?? ""}
                      placeholder={t("hepsi")}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        updateMut.mutate({
                          id: c._id,
                          patch: { region: v ? v.toUpperCase() : null },
                        });
                      }}
                    />
                  </td>

                  <td className="py-2 px-4">
                    <select
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      value={c.kind}
                      onChange={(e) =>
                        updateMut.mutate({
                          id: c._id,
                          patch: { kind: e.target.value as MarketCollectionKind },
                        })
                      }
                    >
                      <option value="manual">{t("manual")}</option>
                      <option value="discounted">{t("discounted")}</option>
                    </select>
                  </td>

                  <td className="py-2 px-4 text-gray-600">
                    {c.kind === "manual" ? c.productIds?.length ?? 0 : "—"}
                  </td>

                  <td className="py-2 px-4">
                    <input
                      type="number"
                      className="w-20 rounded-lg border border-gray-300 px-2 py-1"
                      defaultValue={c.order}
                      onBlur={(e) =>
                        updateMut.mutate({
                          id: c._id,
                          patch: { order: Number(e.target.value) },
                        })
                      }
                    />
                  </td>

                  <td className="py-2 px-4">
                    <button
                      className={
                        "inline-flex px-2 py-0.5 text-xs rounded-full " +
                        (c.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700")
                      }
                      onClick={() =>
                        updateMut.mutate({
                          id: c._id,
                          patch: { isActive: !c.isActive },
                        })
                      }
                    >
                      {c.isActive ? t("Aktif") : t("Pasif")}
                    </button>
                  </td>

                  <td className="py-2 px-4">
                    <button
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs hover:opacity-90"
                      onClick={() => {
                        if (confirm(t("Koleksiyon silinsin mi?"))) deleteMut.mutate(c._id);
                      }}
                    >
                      {t("Sil")}
                    </button>
                  </td>
                </tr>
              ))}

              {!isLoading && collections.length === 0 && (
                <tr>
                  <td className="py-3 px-4 text-gray-500" colSpan={7}>
                    {t("Kayıt yok")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
  );
}
