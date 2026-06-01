// src/desktop/pages/MarketSettingsPage.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import DeliveryZoneMap, { type DeliveryHexZone } from "../components/DeliveryZoneMap";
import {
  marketGetMyStore,
  marketUpdateMyStore,
  type MarketStoreSettings,
} from "../../api/marketDesktop";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

type GridSettings = {
  cellSizeMeters: number;
  radiusMeters: number;
  orientation: "flat" | "pointy";
};

type ZoneState = DeliveryHexZone & {
  freeDeliveryThreshold?: number | null;
};

// ─── Hex math helpers (same as SettingsPage) ─────────────────────────────────

function axialId(ax: { q: number; r: number }) {
  return `ax:${ax.q},${ax.r}`;
}

function axialRing(radius: number) {
  const out: Array<{ q: number; r: number }> = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push({ q, r });
  }
  return out;
}

function ringCountFromRadius(radiusMeters: number, cellSizeMeters: number) {
  const r = Number(radiusMeters);
  const s = Number(cellSizeMeters);
  if (!Number.isFinite(r) || !Number.isFinite(s) || r <= 0 || s <= 0) return 2;
  return Math.max(1, Math.min(6, Math.round(r / (s * 1.6))));
}

function makeBaseZones(grid: { radiusMeters: number; cellSizeMeters: number }): ZoneState[] {
  const ring = ringCountFromRadius(grid.radiusMeters, grid.cellSizeMeters);
  const coords = axialRing(ring);
  coords.sort((a, b) => {
    const da = Math.max(Math.abs(a.q), Math.abs(a.r), Math.abs(-a.q - a.r));
    const db = Math.max(Math.abs(b.q), Math.abs(b.r), Math.abs(-b.q - b.r));
    if (da !== db) return da - db;
    if (a.r !== b.r) return a.r - b.r;
    return a.q - b.q;
  });
  return coords.map((ax, i) => ({
    id: axialId(ax),
    name: `Bölge ${i + 1}`,
    isActive: false,
    minOrderAmount: 0,
    feeAmount: 0,
    freeDeliveryThreshold: null,
  }));
}

// ─── Days config ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

// ─── Input styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: 4,
};

const sectionCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
  border: "1px solid #e5e7eb",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#111827",
  marginBottom: 20,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MarketSettingsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  // ── Store data ──────────────────────────────────────────────────────────────
  const { data: store, isLoading } = useQuery({
    queryKey: ["market-my-store"],
    queryFn: marketGetMyStore,
  });

  // ── Local form state ────────────────────────────────────────────────────────
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [workingHours, setWorkingHours] = React.useState({
    open: "09:00",
    close: "22:00",
    days: [1, 2, 3, 4, 5, 6],
  });

  // ── Zone state ──────────────────────────────────────────────────────────────
  const [gridSettings, setGridSettings] = React.useState<GridSettings>({
    cellSizeMeters: 450,
    radiusMeters: 3000,
    orientation: "flat",
  });
  const [zones, setZones] = React.useState<ZoneState[]>([]);
  const [selectedZoneId, setSelectedZoneId] = React.useState<string | null>(null);
  const hydratedRef = React.useRef(false);

  // ── Hydrate from server data ────────────────────────────────────────────────
  React.useEffect(() => {
    if (!store || hydratedRef.current) return;
    hydratedRef.current = true;

    setName(store.name ?? "");
    setDescription(store.description ?? "");
    setIsActive(store.isActive !== false);
    if (store.workingHours) {
      setWorkingHours({
        open: store.workingHours.open ?? "09:00",
        close: store.workingHours.close ?? "22:00",
        days: store.workingHours.days ?? [1, 2, 3, 4, 5, 6],
      });
    }
    if (store.gridSettings) {
      setGridSettings({
        cellSizeMeters: store.gridSettings.cellSizeMeters ?? 450,
        radiusMeters: store.gridSettings.radiusMeters ?? 3000,
        orientation: store.gridSettings.orientation ?? "flat",
      });
    }
    if (store.deliveryZones && store.deliveryZones.length > 0) {
      setZones(store.deliveryZones.map((z) => ({
        id: z.id,
        name: z.name,
        isActive: z.isActive !== false,
        minOrderAmount: z.minOrderAmount ?? 0,
        feeAmount: z.feeAmount ?? 0,
        freeDeliveryThreshold: z.freeDeliveryThreshold ?? null,
      })));
    }
  }, [store]);

  // ── Auto-create placeholder zones when grid changes and no zones exist ──────
  React.useEffect(() => {
    if (zones.length === 0 && mapCenter) {
      setZones(makeBaseZones(gridSettings));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSettings.cellSizeMeters, gridSettings.radiusMeters]);

  // ── Map center from store location ──────────────────────────────────────────
  const mapCenter = React.useMemo(() => {
    const coords = store?.location?.coordinates;
    if (!coords || coords.length < 2) return undefined;
    const [lng, lat] = coords;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return undefined;
    return { lat, lng };
  }, [store]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const { mutate: saveInfo, isPending: savingInfo } = useMutation({
    mutationFn: () => marketUpdateMyStore({ name, description, isActive, workingHours }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-my-store"] });
      showToast(t("Kaydedildi"), "success");
    },
    onError: (e: any) => showToast(e?.response?.data?.message ?? t("Kayıt başarısız"), "error"),
  });

  const { mutate: saveZones, isPending: savingZones } = useMutation({
    mutationFn: () => marketUpdateMyStore({
      gridSettings,
      deliveryZones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        isActive: z.isActive,
        minOrderAmount: z.minOrderAmount,
        feeAmount: z.feeAmount,
        freeDeliveryThreshold: z.freeDeliveryThreshold ?? null,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-my-store"] });
      showToast(t("Teslimat bölgeleri kaydedildi"), "success");
    },
    onError: (e: any) => showToast(e?.response?.data?.message ?? t("Kayıt başarısız"), "error"),
  });

  // ── Zone helpers ────────────────────────────────────────────────────────────
  const handleToggleZone = React.useCallback((zoneId: string, isActive: boolean) => {
    setZones((prev) => prev.map((z) => z.id === zoneId ? { ...z, isActive } : z));
  }, []);

  const handleSelectZone = React.useCallback((zoneId: string) => {
    setSelectedZoneId((prev) => prev === zoneId ? null : zoneId);
  }, []);

  const updateZone = React.useCallback((zoneId: string, patch: Partial<ZoneState>) => {
    setZones((prev) => prev.map((z) => z.id === zoneId ? { ...z, ...patch } : z));
  }, []);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  // ── Day toggle ──────────────────────────────────────────────────────────────
  const toggleDay = (day: number) => {
    setWorkingHours((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day].sort(),
    }));
  };

  if (isLoading) {
    return (
      <MarketDesktopLayout>
        <div style={{ padding: 24, color: "#6b7280" }}>{t("Yükleniyor…")}</div>
      </MarketDesktopLayout>
    );
  }

  return (
    <MarketDesktopLayout>
      <div style={{ padding: 24, maxWidth: 900 }}>
        <h2 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 700, color: "#111827" }}>
          {t("Mağaza Ayarları")}
        </h2>

        {/* ── Section A: Mağaza Bilgileri ─────────────────────────────────── */}
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>📋 {t("Mağaza Bilgileri")}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>{t("Mağaza Adı")} *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
                placeholder="Mağaza adı"
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 20 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>{t("Durum")}</label>
              <button
                onClick={() => setIsActive((v) => !v)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 20,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  background: isActive ? "#10b981" : "#e5e7eb",
                  color: isActive ? "#fff" : "#374151",
                }}
              >
                {isActive ? t("Açık") : t("Kapalı")}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{t("Açıklama")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Kısa mağaza tanıtımı…"
            />
          </div>

          {/* Çalışma saatleri */}
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>{t("Çalışma Saatleri")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 12, color: "#6b7280", marginRight: 4 }}>{t("Açılış")}</span>
                <input
                  type="time"
                  value={workingHours.open}
                  onChange={(e) => setWorkingHours((p) => ({ ...p, open: e.target.value }))}
                  style={{ ...inputStyle, width: "auto" }}
                />
              </div>
              <div>
                <span style={{ fontSize: 12, color: "#6b7280", marginRight: 4 }}>{t("Kapanış")}</span>
                <input
                  type="time"
                  value={workingHours.close}
                  onChange={(e) => setWorkingHours((p) => ({ ...p, close: e.target.value }))}
                  style={{ ...inputStyle, width: "auto" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    background: workingHours.days.includes(i) ? "#4f46e5" : "#fff",
                    color: workingHours.days.includes(i) ? "#fff" : "#374151",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => saveInfo()}
              disabled={!name.trim() || savingInfo}
              style={{
                padding: "10px 28px",
                borderRadius: 8,
                border: "none",
                background: !name.trim() || savingInfo ? "#e5e7eb" : "#4f46e5",
                color: !name.trim() || savingInfo ? "#9ca3af" : "#fff",
                fontWeight: 700,
                fontSize: 14,
                cursor: !name.trim() || savingInfo ? "default" : "pointer",
              }}
            >
              {savingInfo ? t("Kaydediliyor…") : t("Bilgileri Kaydet")}
            </button>
          </div>
        </div>

        {/* ── Section B: Teslimat Bölgeleri ───────────────────────────────── */}
        <div style={sectionCardStyle}>
          <div style={sectionTitleStyle}>🗺️ {t("Teslimat Bölgeleri")}</div>

          {!mapCenter ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#9ca3af" }}>
              {t("Harita konumu için mağaza lokasyonu tanımlanmalıdır.")}
            </div>
          ) : (
            <>
              {/* Grid settings */}
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t("Hex Boyutu (m)")}</label>
                  <input
                    type="number"
                    min={50}
                    max={2000}
                    value={gridSettings.cellSizeMeters}
                    onChange={(e) => setGridSettings((p) => ({ ...p, cellSizeMeters: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t("Yarıçap (m)")}</label>
                  <input
                    type="number"
                    min={200}
                    max={20000}
                    value={gridSettings.radiusMeters}
                    onChange={(e) => setGridSettings((p) => ({ ...p, radiusMeters: Number(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t("Yönlendirme")}</label>
                  <select
                    value={gridSettings.orientation}
                    onChange={(e) => setGridSettings((p) => ({ ...p, orientation: e.target.value as "flat" | "pointy" }))}
                    style={{ ...inputStyle }}
                  >
                    <option value="flat">Flat</option>
                    <option value="pointy">Pointy</option>
                  </select>
                </div>
              </div>

              {/* Map + zone editor side by side */}
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 2 }}>
                  <DeliveryZoneMap
                    center={mapCenter}
                    zones={zones}
                    selectedZoneId={selectedZoneId}
                    gridSettings={gridSettings}
                    onSelectZone={handleSelectZone}
                    onToggleZone={handleToggleZone}
                    height={420}
                  />
                  <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>
                    {t("Tıklayın: seç • Çift tıklayın: aç/kapat")}
                  </p>
                </div>

                {/* Zone editor panel */}
                <div style={{ flex: 1, minWidth: 220 }}>
                  {selectedZone ? (
                    <div style={{ padding: 16, background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "#111827" }}>
                        {selectedZone.name ?? selectedZone.id}
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{t("Durum")}</label>
                        <button
                          onClick={() => updateZone(selectedZone.id, { isActive: !selectedZone.isActive })}
                          style={{
                            padding: "6px 16px",
                            borderRadius: 20,
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 700,
                            fontSize: 12,
                            background: selectedZone.isActive ? "#10b981" : "#e5e7eb",
                            color: selectedZone.isActive ? "#fff" : "#374151",
                          }}
                        >
                          {selectedZone.isActive ? t("Aktif") : t("Pasif")}
                        </button>
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <label style={labelStyle}>{t("Teslimat Ücreti (₺)")}</label>
                        <input
                          type="number"
                          min={0}
                          value={selectedZone.feeAmount}
                          onChange={(e) => updateZone(selectedZone.id, { feeAmount: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ marginBottom: 10 }}>
                        <label style={labelStyle}>{t("Min. Sipariş (₺)")}</label>
                        <input
                          type="number"
                          min={0}
                          value={selectedZone.minOrderAmount}
                          onChange={(e) => updateZone(selectedZone.id, { minOrderAmount: Number(e.target.value) })}
                          style={inputStyle}
                        />
                      </div>

                      <div>
                        <label style={labelStyle}>{t("Ücretsiz Teslimat Eşiği (₺)")} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({t("boş bırakın = yok")})</span></label>
                        <input
                          type="number"
                          min={0}
                          value={selectedZone.freeDeliveryThreshold ?? ""}
                          placeholder={t("Yok")}
                          onChange={(e) => updateZone(selectedZone.id, {
                            freeDeliveryThreshold: e.target.value === "" ? null : Number(e.target.value),
                          })}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13, background: "#f9fafb", borderRadius: 10, border: "1px dashed #d1d5db" }}>
                      {t("Bir bölge seçin")}
                    </div>
                  )}

                  {/* Stats summary */}
                  <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
                    <div>{t("Toplam bölge")}: <b>{zones.length}</b></div>
                    <div>{t("Aktif bölge")}: <b style={{ color: "#10b981" }}>{zones.filter(z => z.isActive).length}</b></div>
                  </div>
                </div>
              </div>

              {/* Reset + Save */}
              <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={() => {
                    setZones(makeBaseZones(gridSettings));
                    setSelectedZoneId(null);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    color: "#374151",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {t("Bölgeleri Sıfırla")}
                </button>
                <button
                  onClick={() => saveZones()}
                  disabled={savingZones}
                  style={{
                    padding: "10px 28px",
                    borderRadius: 8,
                    border: "none",
                    background: savingZones ? "#e5e7eb" : "#4f46e5",
                    color: savingZones ? "#9ca3af" : "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: savingZones ? "default" : "pointer",
                  }}
                >
                  {savingZones ? t("Kaydediliyor…") : t("Bölgeleri Kaydet")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </MarketDesktopLayout>
  );
}
