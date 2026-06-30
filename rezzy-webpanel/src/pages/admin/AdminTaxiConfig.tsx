import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminGetTaxiConfigs,
  adminUpsertTaxiConfig,
  TaxiRegionConfig,
  VehicleType,
} from "../../api/adminTaxiMarket";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";

const REGIONS = ["TR", "CY", "UK", "US"];

const ICON_KEYS = [
  "car", "car-front", "users", "user", "crown", "gem", "briefcase",
  "van", "truck", "bus", "bike", "leaf", "snowflake", "baby",
  "accessible", "paw-print", "star", "shield",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

const DEFAULT_VEHICLE_TYPE: Omit<VehicleType, "key"> & { key: string } = {
  key: "",
  name: "",
  icon: "car",
  capacity: null,
  description: "",
  order: 0,
  isActive: true,
  base: 30,
  perKm: 12,
  nightBase: null,
  nightPerKm: null,
};

type FormState = {
  dispatchRadiusKm: number;
  commissionRatePct: number;
  isActive: boolean;
  vehicleTypes: VehicleType[];
  nightTariff: { enabled: boolean; start: string; end: string };
  petAddon: { enabled: boolean; surcharge: number };
  timezone: string;
};

const DEFAULT_FORM: FormState = {
  dispatchRadiusKm: 5,
  commissionRatePct: 10,
  isActive: true,
  vehicleTypes: [],
  nightTariff: { enabled: false, start: "22:00", end: "06:00" },
  petAddon: { enabled: true, surcharge: 0 },
  timezone: "Europe/Istanbul",
};

// ── Shared style primitives (match existing admin styling) ────────────────────
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
  width: 96,
  borderRadius: 8,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const disabledInputStyle: React.CSSProperties = {
  ...narrowInputStyle,
  opacity: 0.4,
  cursor: "not-allowed",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--rezvix-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 12px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--rezvix-text-muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const iconBtnStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-soft)",
  color: "var(--rezvix-text-muted)",
  fontSize: 12,
  cursor: "pointer",
  lineHeight: 1,
};

const removeBtnStyle: React.CSSProperties = {
  ...iconBtnStyle,
  color: "var(--rezvix-danger, #e74c3c)",
  borderColor: "var(--rezvix-danger, #e74c3c)",
};

// ── VehicleTypeRow ────────────────────────────────────────────────────────────
type VehicleTypeRowProps = {
  vt: VehicleType;
  index: number;
  total: number;
  nightEnabled: boolean;
  onChange: (index: number, updated: VehicleType) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
};

function VehicleTypeRow({ vt, index, total, nightEnabled, onChange, onMove, onRemove }: VehicleTypeRowProps) {
  const set = <K extends keyof VehicleType>(field: K, value: VehicleType[K]) =>
    onChange(index, { ...vt, [field]: value });

  const rowStyle: React.CSSProperties = {
    padding: "16px",
    borderTop: index === 0 ? "none" : "1px solid var(--rezvix-border-subtle)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const gridRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 140px 80px 1fr",
    gap: 10,
    alignItems: "end",
  };

  const priceRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 96px) auto",
    gap: 10,
    alignItems: "end",
  };

  return (
    <div style={rowStyle}>
      {/* Row header: key (read-only if set), reorder, remove */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--rezvix-text-soft)",
            background: "var(--rezvix-bg-soft)",
            border: "1px solid var(--rezvix-border-subtle)",
            borderRadius: 5,
            padding: "2px 8px",
            letterSpacing: "0.04em",
            minWidth: 60,
            textAlign: "center",
          }}
        >
          {vt.key || "new"}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={iconBtnStyle} disabled={index === 0} onClick={() => onMove(index, -1)} title="Yukarı">↑</button>
          <button style={iconBtnStyle} disabled={index === total - 1} onClick={() => onMove(index, 1)} title="Aşağı">↓</button>
        </div>
        <div style={{ flex: 1 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", color: "var(--rezvix-text-muted)" }}>
          <input
            type="checkbox"
            checked={vt.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Aktif
        </label>
        <button style={removeBtnStyle} onClick={() => onRemove(index)} title="Kaldır">✕</button>
      </div>

      {/* Name / Icon / Capacity / Description */}
      <div style={gridRow}>
        <div>
          <label style={labelStyle}>Ad</label>
          <input
            type="text"
            style={inputStyle}
            value={vt.name}
            placeholder="ör. Standart"
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label style={labelStyle}>İkon</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select
              style={{ ...narrowInputStyle, width: 120 }}
              value={vt.icon}
              onChange={(e) => set("icon", e.target.value)}
            >
              {ICON_KEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Kapasite</label>
          <input
            type="number"
            min={1}
            style={narrowInputStyle}
            value={vt.capacity ?? ""}
            placeholder="—"
            onChange={(e) => set("capacity", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        <div>
          <label style={labelStyle}>Açıklama</label>
          <input
            type="text"
            style={inputStyle}
            value={vt.description}
            placeholder="Kısa açıklama (isteğe bağlı)"
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
      </div>

      {/* Price fields */}
      <div style={priceRow}>
        <div>
          <label style={labelStyle}>Baz (gündüz)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            style={narrowInputStyle}
            value={vt.base}
            onChange={(e) => set("base", Number(e.target.value))}
          />
        </div>
        <div>
          <label style={labelStyle}>Km (gündüz)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            style={narrowInputStyle}
            value={vt.perKm}
            onChange={(e) => set("perKm", Number(e.target.value))}
          />
        </div>
        <div>
          <label style={{ ...labelStyle, opacity: nightEnabled ? 1 : 0.4 }}>Baz (gece)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            style={nightEnabled ? narrowInputStyle : disabledInputStyle}
            disabled={!nightEnabled}
            value={vt.nightBase ?? ""}
            placeholder="—"
            onChange={(e) => set("nightBase", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        <div>
          <label style={{ ...labelStyle, opacity: nightEnabled ? 1 : 0.4 }}>Km (gece)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            style={nightEnabled ? narrowInputStyle : disabledInputStyle}
            disabled={!nightEnabled}
            value={vt.nightPerKm ?? ""}
            placeholder="—"
            onChange={(e) => set("nightPerKm", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminTaxiConfigPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [region, setRegion] = useState<string>(REGIONS[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-taxi-configs"],
    queryFn: adminGetTaxiConfigs,
  });

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  // Sync form when region or data changes
  useEffect(() => {
    const cfg = data?.configs?.find((c) => c.region === region);
    if (cfg) {
      setForm({
        dispatchRadiusKm: cfg.dispatchRadiusKm,
        commissionRatePct: cfg.commissionRate * 100,
        isActive: cfg.isActive,
        vehicleTypes: Array.isArray(cfg.vehicleTypes) ? cfg.vehicleTypes : [],
        nightTariff: cfg.nightTariff ?? { enabled: false, start: "22:00", end: "06:00" },
        petAddon: cfg.petAddon ?? { enabled: true, surcharge: 0 },
        timezone: cfg.timezone ?? "Europe/Istanbul",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [region, data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      // Auto-slug key from name for new rows (key === "")
      const vehicleTypes = form.vehicleTypes.map((vt, i) => ({
        ...vt,
        key: vt.key || slugify(vt.name) || `type-${i}`,
        order: i,
      }));
      return adminUpsertTaxiConfig(region, {
        region,
        dispatchRadiusKm: form.dispatchRadiusKm,
        commissionRate: form.commissionRatePct / 100,
        isActive: form.isActive,
        vehicleTypes,
        nightTariff: form.nightTariff,
        petAddon: form.petAddon,
        timezone: form.timezone,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-taxi-configs"] });
      showToast(t("Kaydedildi"), "success");
    },
    onError: () => showToast(t("Kayıt başarısız"), "error"),
  });

  // ── Vehicle type helpers ────────────────────────────────────────────────────
  const addVehicleType = () => {
    setForm((prev) => ({
      ...prev,
      vehicleTypes: [
        ...prev.vehicleTypes,
        { ...DEFAULT_VEHICLE_TYPE, order: prev.vehicleTypes.length },
      ],
    }));
  };

  const updateVehicleType = (index: number, updated: VehicleType) => {
    setForm((prev) => {
      const next = [...prev.vehicleTypes];
      next[index] = updated;
      return { ...prev, vehicleTypes: next };
    });
  };

  const moveVehicleType = (index: number, dir: -1 | 1) => {
    setForm((prev) => {
      const next = [...prev.vehicleTypes];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, vehicleTypes: next };
    });
  };

  const removeVehicleType = (index: number) => {
    setForm((prev) => ({
      ...prev,
      vehicleTypes: prev.vehicleTypes.filter((_, i) => i !== index),
    }));
  };

  return (
    <div style={{ padding: 24 }}>
      <AdminPageHeader
        title={t("Taksi Tarifeleri")}
        subtitle={t("Bölgelere göre araç tipleri ve tarife ayarlarını yönetin")}
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
          {/* ── General settings ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
            }}
          >
            <div>
              <label style={labelStyle}>{t("Çağrı Yarıçapı (km)")}</label>
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
              <label style={labelStyle}>{t("Komisyon Oranı (%)")}</label>
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
            <div>
              <label style={labelStyle}>{t("Zaman Dilimi (IANA)")}</label>
              <input
                type="text"
                style={inputStyle}
                value={form.timezone}
                placeholder="ör. Europe/Istanbul"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, timezone: e.target.value }))
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

          {/* ── Night tariff ── */}
          <div>
            <h3 style={sectionHeadingStyle}>{t("Gece Tarifesi")}</h3>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--rezvix-text-main)" }}>
                <input
                  type="checkbox"
                  checked={form.nightTariff.enabled}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      nightTariff: { ...prev.nightTariff, enabled: e.target.checked },
                    }))
                  }
                />
                {t("Aktif")}
              </label>
              <div>
                <label style={labelStyle}>{t("Başlangıç (HH:MM)")}</label>
                <input
                  type="text"
                  style={{ ...narrowInputStyle, opacity: form.nightTariff.enabled ? 1 : 0.4 }}
                  disabled={!form.nightTariff.enabled}
                  value={form.nightTariff.start}
                  placeholder="22:00"
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      nightTariff: { ...prev.nightTariff, start: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label style={labelStyle}>{t("Bitiş (HH:MM)")}</label>
                <input
                  type="text"
                  style={{ ...narrowInputStyle, opacity: form.nightTariff.enabled ? 1 : 0.4 }}
                  disabled={!form.nightTariff.enabled}
                  value={form.nightTariff.end}
                  placeholder="06:00"
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      nightTariff: { ...prev.nightTariff, end: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* ── Pet add-on ── */}
          <div>
            <h3 style={sectionHeadingStyle}>{t("Evcil Hayvan Ek Ücreti")}</h3>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", color: "var(--rezvix-text-main)" }}>
                <input
                  type="checkbox"
                  checked={form.petAddon.enabled}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      petAddon: { ...prev.petAddon, enabled: e.target.checked },
                    }))
                  }
                />
                {t("Aktif")}
              </label>
              <div>
                <label style={labelStyle}>{t("Ek Ücret")}</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  style={{ ...narrowInputStyle, opacity: form.petAddon.enabled ? 1 : 0.4 }}
                  disabled={!form.petAddon.enabled}
                  value={form.petAddon.surcharge}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      petAddon: { ...prev.petAddon, surcharge: Number(e.target.value) },
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* ── Vehicle types repeater ── */}
          <div>
            <h3 style={sectionHeadingStyle}>{t("Araç Tipleri")}</h3>
            <div
              style={{
                border: "1px solid var(--rezvix-border-subtle)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {form.vehicleTypes.length === 0 && (
                <div style={{ padding: "20px 16px", color: "var(--rezvix-text-soft)", fontSize: 13, textAlign: "center" }}>
                  {t("Henüz araç tipi yok. Aşağıdan ekleyin.")}
                </div>
              )}
              {form.vehicleTypes.map((vt, i) => (
                <VehicleTypeRow
                  key={i}
                  vt={vt}
                  index={i}
                  total={form.vehicleTypes.length}
                  nightEnabled={form.nightTariff.enabled}
                  onChange={updateVehicleType}
                  onMove={moveVehicleType}
                  onRemove={removeVehicleType}
                />
              ))}
            </div>
            <button
              onClick={addVehicleType}
              style={{
                marginTop: 10,
                padding: "7px 16px",
                borderRadius: 8,
                border: "1px dashed var(--rezvix-border-strong)",
                background: "transparent",
                color: "var(--rezvix-primary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + {t("Tür Ekle")}
            </button>
          </div>

          {/* ── Save ── */}
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
