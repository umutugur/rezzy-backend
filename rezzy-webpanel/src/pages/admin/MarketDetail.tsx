// src/pages/admin/MarketDetail.tsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminGetMarketStore, adminUpdateMarketStore } from "../../api/adminMarketStores";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";
import { EntityPicker } from "../../desktop/components/admin/EntityPicker";
import { pickOrganizations, type PickerItem } from "../../api/adminPickers";

// ─── Category enum ────────────────────────────────────────────────────────────

const MARKET_STORE_CATEGORIES: string[] = [
  "supermarket",
  "bakery",
  "greengrocer",
  "organic",
  "pharmacy",
];

const CATEGORY_LABELS: Record<string, string> = {
  supermarket: "Süpermarket",
  bakery: "Fırın",
  greengrocer: "Manav",
  organic: "Organik",
  pharmacy: "Eczane",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (n: number) =>
  "₺" + (n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function safeNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Input style shared across inputs ─────────────────────────────────────────

const inputSx: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1.5px solid var(--rezvix-border-strong)",
  background: "var(--rezvix-bg-elevated)",
  color: "var(--rezvix-text-main)",
  fontSize: 13.5,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.15s, box-shadow 0.15s",
  fontFamily: "inherit",
};

const sectionCardSx: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1px solid var(--rezvix-border-subtle)",
  borderRadius: 14,
  padding: "20px 24px",
  marginBottom: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

const sectionTitleSx: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--rezvix-text-soft)",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  marginBottom: 18,
};

// ─── KPI stat card ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: "var(--rezvix-bg-elevated)",
        border: "1px solid var(--rezvix-border-subtle)",
        borderRadius: 14,
        padding: "16px 18px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        flex: "1 1 0",
        minWidth: 140,
      }}
    >
      {/* Background circle accent */}
      <div
        style={{
          position: "absolute",
          top: -24,
          right: -24,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: accent,
          opacity: 0.1,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: accent,
            opacity: 0.15,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            fontSize: 14,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--rezvix-text-soft)",
            marginLeft: 22,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: "var(--rezvix-text-main)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminMarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Server data ─────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-market-store", id],
    queryFn: () => adminGetMarketStore(id!),
    enabled: !!id,
  });

  const store = data?.store ?? null;
  const stats = data?.stats ?? null;

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState(MARKET_STORE_CATEGORIES[0]);
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);
  const [pickupEnabled, setPickupEnabled] = React.useState(false);
  const [commissionRate, setCommissionRate] = React.useState("0");
  const [deliveryZoneKm, setDeliveryZoneKm] = React.useState("0");
  const [minOrderAmount, setMinOrderAmount] = React.useState("0");
  const [deliveryFee, setDeliveryFee] = React.useState("0");
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = React.useState("");
  const [orgId, setOrgId] = React.useState<string | null>(null);

  // Hydrated once
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!store || hydratedRef.current) return;
    hydratedRef.current = true;

    setName(store.name ?? "");
    setDescription(store.description ?? "");
    setCategory(store.category ?? MARKET_STORE_CATEGORIES[0]);
    setAddress(store.address ?? "");
    setCity(store.city ?? "");
    setIsActive(store.isActive !== false);
    setPickupEnabled(store.pickupEnabled === true);
    setCommissionRate(String(store.commissionRate ?? 0));
    setDeliveryZoneKm(String(store.deliveryZoneKm ?? 0));
    setMinOrderAmount(String(store.minOrderAmount ?? 0));
    setDeliveryFee(String(store.deliveryFee ?? 0));
    setFreeDeliveryThreshold(
      store.freeDeliveryThreshold != null
        ? String(store.freeDeliveryThreshold)
        : ""
    );
    setOrgId(store.organization?._id ?? null);
  }, [store]);

  // ── resolveLabels for EntityPicker pre-selection ─────────────────────────
  const resolveOrgLabels = React.useCallback(
    async (_ids: string[]): Promise<PickerItem[]> => {
      // We already have the populated org from the store doc — return it directly
      // so the chip shows the org name without a round-trip.
      if (store?.organization) {
        return [
          {
            id: store.organization._id,
            label: store.organization.name,
            sub: store.organization.region,
          },
        ];
      }
      // Fallback: search by empty string and let EntityPicker match
      return [];
    },
    [store?.organization]
  );

  // ── Save mutation ────────────────────────────────────────────────────────
  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const fdt =
        freeDeliveryThreshold.trim() === ""
          ? null
          : safeNum(freeDeliveryThreshold);

      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        category,
        address: address.trim(),
        city: city.trim(),
        isActive,
        pickupEnabled,
        commissionRate: safeNum(commissionRate),
        deliveryZoneKm: safeNum(deliveryZoneKm),
        minOrderAmount: safeNum(minOrderAmount),
        deliveryFee: safeNum(deliveryFee),
        freeDeliveryThreshold: fdt,
        organization: orgId,
      };

      return adminUpdateMarketStore(id!, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-market-store", id] });
      qc.invalidateQueries({ queryKey: ["admin-market-stores"] });
      showToast(t("Mağaza güncellendi"), "success");
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message ?? t("Kayıt başarısız"), "error"),
  });

  // ── Loading / error states ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        style={{
          padding: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--rezvix-text-soft)",
          fontSize: 14,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            border: "2px solid var(--rezvix-border-strong)",
            borderTopColor: "var(--rezvix-primary)",
            borderRadius: "50%",
            animation: "mds-spin 0.7s linear infinite",
            marginRight: 12,
          }}
        />
        {t("Yükleniyor…")}
        <style>{`@keyframes mds-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (isError || !store) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          color: "var(--rezvix-danger)",
          fontSize: 14,
        }}
      >
        {t("Mağaza yüklenemedi.")}
      </div>
    );
  }

  const subtitle = [store.city, CATEGORY_LABELS[store.category] ?? store.category]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <style>{`@keyframes mds-spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ── */}
      <AdminPageHeader
        title={store.name}
        subtitle={subtitle}
        actions={
          <button
            onClick={() => navigate("/admin/market/stores")}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "1.5px solid var(--rezvix-border-strong)",
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "background 0.14s, border-color 0.14s",
            }}
          >
            ← {t("Listeye Dön")}
          </button>
        }
      />

      {/* ── Stats row ── */}
      {stats && (
        <div
          style={{
            display: "flex",
            gap: 14,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <StatCard
            icon="📦"
            label={t("Ürün Sayısı")}
            value={String(stats.productCount ?? 0)}
            accent="var(--rezvix-primary)"
          />
          <StatCard
            icon="🧾"
            label={t("Toplam Sipariş")}
            value={String(stats.orders?.total ?? 0)}
            accent="#4f46e5"
          />
          <StatCard
            icon="✅"
            label={t("Teslim Edilen")}
            value={String(stats.orders?.delivered ?? 0)}
            accent="var(--rezvix-success)"
          />
          <StatCard
            icon="💰"
            label={t("Ciro")}
            value={money(stats.orders?.revenue ?? 0)}
            accent="#0891b2"
          />
        </div>
      )}

      {/* ── Edit form ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Mağaza Bilgileri")}</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 20px",
          }}
        >
          {/* Name */}
          <FormField label={t("Mağaza Adı")} required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputSx}
              placeholder={t("Mağaza adı")}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>

          {/* Category */}
          <FormField label={t("Kategori")}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ ...inputSx, cursor: "pointer" }}
            >
              {MARKET_STORE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c] ?? c}
                </option>
              ))}
            </select>
          </FormField>

          {/* Address */}
          <FormField label={t("Adres")}>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={inputSx}
              placeholder={t("Sokak, mahalle, bina no…")}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>

          {/* City */}
          <FormField label={t("Şehir")}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={inputSx}
              placeholder={t("Şehir")}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>
        </div>

        {/* Description — full width */}
        <FormField label={t("Açıklama")} hint={t("Kısa mağaza tanıtımı")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ ...inputSx, resize: "vertical" }}
            placeholder={t("Kısa mağaza tanıtımı…")}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--rezvix-primary)";
              e.currentTarget.style.boxShadow =
                "0 0 0 3px var(--rezvix-primary-soft)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </FormField>
      </div>

      {/* ── Financial & Delivery ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Teslimat & Komisyon")}</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0 20px",
          }}
        >
          {/* Commission Rate */}
          <FormField
            label={t("Komisyon Oranı")}
            hint={t("0 – 1 arası (örn. 0.10 = %10)")}
          >
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              style={inputSx}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>

          {/* Delivery Zone Km */}
          <FormField label={t("Teslimat Yarıçapı (km)")}>
            <input
              type="number"
              min={0}
              step={0.5}
              value={deliveryZoneKm}
              onChange={(e) => setDeliveryZoneKm(e.target.value)}
              style={inputSx}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>

          {/* Min Order Amount */}
          <FormField label={t("Min. Sipariş Tutarı (₺)")}>
            <input
              type="number"
              min={0}
              step={1}
              value={minOrderAmount}
              onChange={(e) => setMinOrderAmount(e.target.value)}
              style={inputSx}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>

          {/* Delivery Fee */}
          <FormField label={t("Teslimat Ücreti (₺)")}>
            <input
              type="number"
              min={0}
              step={0.5}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              style={inputSx}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>

          {/* Free Delivery Threshold */}
          <FormField
            label={t("Ücretsiz Teslimat Eşiği (₺)")}
            hint={t("Boş bırakın = yok")}
          >
            <input
              type="number"
              min={0}
              step={1}
              value={freeDeliveryThreshold}
              onChange={(e) => setFreeDeliveryThreshold(e.target.value)}
              style={inputSx}
              placeholder={t("Yok")}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-primary)";
                e.currentTarget.style.boxShadow =
                  "0 0 0 3px var(--rezvix-primary-soft)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </FormField>
        </div>

        {/* Checkboxes row */}
        <div style={{ display: "flex", gap: 28, marginTop: 6 }}>
          {/* isActive */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "var(--rezvix-primary)" }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--rezvix-text-muted)",
              }}
            >
              {t("Aktif")}
            </span>
          </label>

          {/* pickupEnabled */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={pickupEnabled}
              onChange={(e) => setPickupEnabled(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: "var(--rezvix-primary)" }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--rezvix-text-muted)",
              }}
            >
              {t("Gel-Al (Pickup)")}
            </span>
          </label>
        </div>
      </div>

      {/* ── Zincir (Organization) ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Zincir (Organizasyon)")}</div>

        {/* Current org info pill */}
        {store.organization && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 14,
              padding: "4px 12px",
              borderRadius: 999,
              background: "var(--rezvix-primary-soft)",
              border: "1px solid var(--rezvix-border-subtle)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--rezvix-primary)",
            }}
          >
            <span style={{ opacity: 0.7 }}>🔗</span>
            {store.organization.name}
            {store.organization.region && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 400,
                  color: "var(--rezvix-text-soft)",
                  marginLeft: 2,
                }}
              >
                · {store.organization.region}
              </span>
            )}
          </div>
        )}

        <FormField
          label={t("Zincir Ara")}
          hint={t("Mağazayı bir organizasyona bağlayın veya bağlantıyı kesin")}
        >
          <EntityPicker
            fetcher={pickOrganizations}
            value={orgId}
            onChange={(id: string | null) => setOrgId(id)}
            multiple={false}
            placeholder={t("Zincir ara...")}
            resolveLabels={resolveOrgLabels}
          />
        </FormField>

        {orgId && (
          <button
            type="button"
            onClick={() => setOrgId(null)}
            style={{
              marginTop: 4,
              padding: "7px 14px",
              borderRadius: 8,
              border: "1.5px solid var(--rezvix-border-strong)",
              background: "var(--rezvix-bg-elevated)",
              color: "var(--rezvix-danger)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.12s",
            }}
          >
            {t("Zincirden Çıkar")}
          </button>
        )}
      </div>

      {/* ── Save button ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingBottom: 40,
        }}
      >
        <button
          type="button"
          onClick={() => save()}
          disabled={saving || !name.trim()}
          style={{
            padding: "11px 32px",
            borderRadius: 999,
            border: "none",
            background:
              saving || !name.trim()
                ? "var(--rezvix-bg-soft)"
                : "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))",
            color:
              saving || !name.trim() ? "var(--rezvix-text-soft)" : "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: saving || !name.trim() ? "not-allowed" : "pointer",
            boxShadow:
              saving || !name.trim()
                ? "none"
                : "0 4px 14px var(--rezvix-primary-soft)",
            transition: "opacity 0.15s, transform 0.1s",
          }}
          onMouseEnter={(e) => {
            if (!saving && name.trim()) {
              (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
              (e.currentTarget as HTMLButtonElement).style.transform =
                "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = "1";
            (e.currentTarget as HTMLButtonElement).style.transform = "none";
          }}
        >
          {saving ? t("Kaydediliyor…") : t("Değişiklikleri Kaydet")}
        </button>
      </div>
    </div>
  );
}
