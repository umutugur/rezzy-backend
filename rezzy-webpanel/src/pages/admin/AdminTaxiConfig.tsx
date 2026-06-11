import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminGetTaxiConfigs,
  adminUpsertTaxiConfig,
  TaxiRegionConfig,
  TaxiTariff,
} from "../../api/adminTaxiMarket";
import Sidebar from "../../components/Sidebar";
import { ADMIN_SIDEBAR_ITEMS } from "../../components/adminSidebarItems";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

const REGIONS = ["TR", "CY", "UK", "US"];

type TariffKey = "ride" | "xl" | "lux" | "pet";
const TARIFF_LABELS: Record<TariffKey, string> = {
  ride: "Ride",
  xl: "XL",
  lux: "Lüks",
  pet: "Pet",
};

const DEFAULT_CONFIG: Omit<TaxiRegionConfig, "region"> = {
  dispatchRadiusKm: 5,
  commissionRate: 0.1,
  tariffs: {
    ride: { base: 30, perKm: 12 },
    xl: { base: 45, perKm: 18 },
    lux: { base: 80, perKm: 25 },
    pet: { base: 40, perKm: 15 },
  },
  isActive: true,
};

type FormState = {
  dispatchRadiusKm: number;
  commissionRatePct: number; // stored as percent (e.g. 10 for 0.10)
  isActive: boolean;
  tariffs: Record<TariffKey, TaxiTariff>;
};

export default function AdminTaxiConfigPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [region, setRegion] = useState<string>(REGIONS[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-taxi-configs"],
    queryFn: adminGetTaxiConfigs,
  });

  const configForRegion = data?.configs?.find((c) => c.region === region);

  const [form, setForm] = useState<FormState>(() => ({
    dispatchRadiusKm: DEFAULT_CONFIG.dispatchRadiusKm,
    commissionRatePct: DEFAULT_CONFIG.commissionRate * 100,
    isActive: DEFAULT_CONFIG.isActive,
    tariffs: { ...DEFAULT_CONFIG.tariffs },
  }));

  // Sync form when region or data changes
  useEffect(() => {
    const cfg = data?.configs?.find((c) => c.region === region);
    if (cfg) {
      setForm({
        dispatchRadiusKm: cfg.dispatchRadiusKm,
        commissionRatePct: cfg.commissionRate * 100,
        isActive: cfg.isActive,
        tariffs: { ...cfg.tariffs },
      });
    } else {
      setForm({
        dispatchRadiusKm: DEFAULT_CONFIG.dispatchRadiusKm,
        commissionRatePct: DEFAULT_CONFIG.commissionRate * 100,
        isActive: DEFAULT_CONFIG.isActive,
        tariffs: { ...DEFAULT_CONFIG.tariffs },
      });
    }
  }, [region, data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      adminUpsertTaxiConfig(region, {
        region,
        dispatchRadiusKm: form.dispatchRadiusKm,
        commissionRate: form.commissionRatePct / 100,
        isActive: form.isActive,
        tariffs: form.tariffs,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-taxi-configs"] });
      showToast(t("Kaydedildi"), "success");
    },
    onError: () => showToast(t("Kayıt başarısız"), "error"),
  });

  const setTariff = (key: TariffKey, field: keyof TaxiTariff, value: number) => {
    setForm((prev) => ({
      ...prev,
      tariffs: {
        ...prev.tariffs,
        [key]: { ...prev.tariffs[key], [field]: value },
      },
    }));
  };

  return (
    <div className="flex gap-6">
      <Sidebar items={ADMIN_SIDEBAR_ITEMS.map((i) => ({ ...i, label: t(i.label) }))} />

      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">{t("Taksi Tarifeleri")}</h2>

        {/* Region tabs */}
        <div className="flex gap-2 flex-wrap">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                region === r
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {r}
              {!data?.configs?.find((c) => c.region === r) && (
                <span className="ml-1 text-xs text-gray-400">({t("yeni")})</span>
              )}
            </button>
          ))}
        </div>

        {isLoading && <div>{t("Yükleniyor…")}</div>}

        {!isLoading && (
          <div className="bg-white rounded-2xl shadow-soft p-6 space-y-6">
            {/* General settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {t("Çağrı Yarıçapı (km)")}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.dispatchRadiusKm}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dispatchRadiusKm: Number(e.target.value) }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  {t("Komisyon Oranı (%)")}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.commissionRatePct}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, commissionRatePct: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                    }
                  />
                  {t("Aktif")}
                </label>
              </div>
            </div>

            {/* Tariff grid */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("Araç Tarifeleri")}</h3>
              <div className="overflow-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-4">{t("Araç Tipi")}</th>
                      <th className="py-2 px-4">{t("Baz Fiyat (₺)")}</th>
                      <th className="py-2 px-4">{t("Km Ücreti (₺)")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["ride", "xl", "lux", "pet"] as TariffKey[]).map((key) => (
                      <tr key={key} className="border-t">
                        <td className="py-2 px-4 font-medium">
                          {t(TARIFF_LABELS[key])}
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                            value={form.tariffs[key].base}
                            onChange={(e) => setTariff(key, "base", Number(e.target.value))}
                          />
                        </td>
                        <td className="py-2 px-4">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            className="w-28 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                            value={form.tariffs[key].perKm}
                            onChange={(e) => setTariff(key, "perKm", Number(e.target.value))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <button
                onClick={() => save()}
                disabled={isPending}
                className="px-6 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium disabled:opacity-60"
              >
                {isPending ? t("Kaydediliyor…") : t("Kaydet")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
