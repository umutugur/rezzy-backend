import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminGetTaxiConfigs,
  adminUpsertTaxiConfig,
  TaxiRegionConfig,
  TaxiTariff,
} from "../../api/adminTaxiMarket";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

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

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  padding: "8px 12px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const narrowInputStyle: React.CSSProperties = {
  width: 112,
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
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
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={t("Taksi Tarifeleri")}
        subtitle={t("Bölgelere göre tarife ve komisyon ayarlarını yönetin")}
      />

      {/* Region tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {REGIONS.map((r) => {
          const isSelected = region === r;
          return (
            <button
              key={r}
              onClick={() => setRegion(r)}
              style={{
                padding: "6px 18px",
                borderRadius: 8,
                border: isSelected
                  ? "1px solid var(--rezvix-primary)"
                  : "1px solid var(--rezvix-border-strong)",
                background: isSelected ? "var(--rezvix-primary)" : "var(--rezvix-bg-elevated)",
                color: isSelected ? "#fff" : "var(--rezvix-text-muted)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {r}
              {!data?.configs?.find((c) => c.region === r) && (
                <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.7 }}>({t("yeni")})</span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div style={{ color: "var(--rezvix-text-soft)", fontSize: 13 }}>{t("Yükleniyor…")}</div>
      )}

      {!isLoading && (
        <div
          style={{
            background: "var(--rezvix-bg-elevated)",
            borderRadius: "var(--rezvix-radius-lg)",
            border: "1px solid var(--rezvix-border-subtle)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* General settings */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--rezvix-text-muted)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {t("Çağrı Yarıçapı (km)")}
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                style={inputStyle}
                value={form.dispatchRadiusKm}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, dispatchRadiusKm: Number(e.target.value) }))
                }
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--rezvix-text-muted)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {t("Komisyon Oranı (%)")}
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                style={inputStyle}
                value={form.commissionRatePct}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, commissionRatePct: Number(e.target.value) }))
                }
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--rezvix-text-main)" }}>
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
            <h3
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--rezvix-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 12,
                margin: "0 0 12px",
              }}
            >
              {t("Araç Tarifeleri")}
            </h3>
            <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--rezvix-border-subtle)" }}>
              <table style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr
                    style={{
                      background: "var(--rezvix-bg-soft)",
                      borderBottom: "1px solid var(--rezvix-border-subtle)",
                      textAlign: "left",
                      color: "var(--rezvix-text-soft)",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    <th style={{ padding: "10px 16px" }}>{t("Araç Tipi")}</th>
                    <th style={{ padding: "10px 16px" }}>{t("Baz Fiyat (₺)")}</th>
                    <th style={{ padding: "10px 16px" }}>{t("Km Ücreti (₺)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(["ride", "xl", "lux", "pet"] as TariffKey[]).map((key) => (
                    <tr
                      key={key}
                      style={{ borderTop: "1px solid var(--rezvix-border-subtle)" }}
                    >
                      <td
                        style={{
                          padding: "10px 16px",
                          fontWeight: 600,
                          color: "var(--rezvix-text-main)",
                        }}
                      >
                        {t(TARIFF_LABELS[key])}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          style={narrowInputStyle}
                          value={form.tariffs[key].base}
                          onChange={(e) => setTariff(key, "base", Number(e.target.value))}
                        />
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          style={narrowInputStyle}
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
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => save()}
              disabled={isPending}
              style={{
                padding: "9px 24px",
                borderRadius: 8,
                border: "none",
                background: "var(--rezvix-primary)",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: isPending ? "not-allowed" : "pointer",
                opacity: isPending ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {isPending ? t("Kaydediliyor…") : t("Kaydet")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
