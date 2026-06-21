// src/pages/marketOrg/OrgBranchDetail.tsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authStore } from "../../store/auth";
import { getOrgBranch, updateOrgBranch } from "../../api/marketOrgCatalog";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (n: number) =>
  "₺" +
  (n ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function safeNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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

// ─── Stat card ────────────────────────────────────────────────────────────────

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
        minWidth: 130,
      }}
    >
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
          fontSize: 22,
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

// ─── Days toggle ──────────────────────────────────────────────────────────────

const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function DaysToggle({
  value,
  onChange,
}: {
  value: number[];
  onChange: (days: number[]) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {DAY_LABELS.map((lbl, idx) => {
        const active = value.includes(idx);
        return (
          <button
            key={idx}
            type="button"
            onClick={() => {
              onChange(
                active ? value.filter((d) => d !== idx) : [...value, idx].sort()
              );
            }}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              border: active
                ? "1.5px solid var(--rezvix-primary)"
                : "1.5px solid var(--rezvix-border-strong)",
              background: active ? "var(--rezvix-primary-soft)" : "transparent",
              color: active ? "var(--rezvix-primary)" : "var(--rezvix-text-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.13s",
            }}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrgBranchDetail() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const qc = useQueryClient();

  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["org-branch", orgId, storeId],
    queryFn: () => getOrgBranch(orgId!, storeId!),
    enabled: !!orgId && !!storeId,
  });

  const store = data?.store ?? null;
  const stats = data?.stats ?? null;
  const overriddenProducts = data?.overriddenProducts ?? [];

  // ── Form state ──────────────────────────────────────────────────────────────
  const [isActive, setIsActive] = React.useState(true);
  const [pickupEnabled, setPickupEnabled] = React.useState(false);
  const [whOpen, setWhOpen] = React.useState("09:00");
  const [whClose, setWhClose] = React.useState("22:00");
  const [whDays, setWhDays] = React.useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [deliveryZoneKm, setDeliveryZoneKm] = React.useState("0");
  const [minOrderAmount, setMinOrderAmount] = React.useState("0");
  const [deliveryFee, setDeliveryFee] = React.useState("0");
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = React.useState("");

  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!store || hydratedRef.current) return;
    hydratedRef.current = true;

    setIsActive(store.isActive !== false);
    setPickupEnabled(store.pickupEnabled === true);
    setWhOpen(store.workingHours?.open ?? "09:00");
    setWhClose(store.workingHours?.close ?? "22:00");
    setWhDays(store.workingHours?.days ?? [0, 1, 2, 3, 4, 5, 6]);
    setDeliveryZoneKm(String(store.deliveryZoneKm ?? 0));
    setMinOrderAmount(String(store.minOrderAmount ?? 0));
    setDeliveryFee(String(store.deliveryFee ?? 0));
    setFreeDeliveryThreshold(
      store.freeDeliveryThreshold != null ? String(store.freeDeliveryThreshold) : ""
    );
  }, [store]);

  // ── Save mutation ────────────────────────────────────────────────────────────
  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const fdt =
        freeDeliveryThreshold.trim() === "" ? null : safeNum(freeDeliveryThreshold);

      const body: Record<string, unknown> = {
        isActive,
        pickupEnabled,
        workingHours: {
          open: whOpen.trim(),
          close: whClose.trim(),
          days: whDays,
        },
        deliveryZoneKm: safeNum(deliveryZoneKm),
        minOrderAmount: safeNum(minOrderAmount),
        deliveryFee: safeNum(deliveryFee),
        freeDeliveryThreshold: fdt,
      };

      return updateOrgBranch(orgId!, storeId!, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-branch", orgId, storeId] });
      qc.invalidateQueries({ queryKey: ["org-branches", orgId] });
      showToast(t("Şube güncellendi"), "success");
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message ?? t("Kayıt başarısız"), "error"),
  });

  // ── Focus / blur helpers ─────────────────────────────────────────────────────
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--rezvix-primary)";
    e.currentTarget.style.boxShadow = "0 0 0 3px var(--rezvix-primary-soft)";
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
    e.currentTarget.style.boxShadow = "none";
  };

  // ── Loading / error states ───────────────────────────────────────────────────
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
            animation: "obdspin 0.7s linear infinite",
            marginRight: 12,
          }}
        />
        {t("Yükleniyor…")}
        <style>{`@keyframes obdspin{to{transform:rotate(360deg)}}`}</style>
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
        {t("Şube yüklenemedi.")}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <style>{`@keyframes obdspin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ── */}
      <AdminPageHeader
        title={store.name}
        subtitle={store.city ?? ""}
        actions={
          <button
            onClick={() => navigate("/market-org/branches")}
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
            ← {t("Şubeler")}
          </button>
        }
      />

      {/* ── Stats row ── */}
      {stats && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <StatCard
            icon="🧾"
            label={t("Sipariş")}
            value={String(stats.orders ?? 0)}
            accent="#4f46e5"
          />
          <StatCard
            icon="✅"
            label={t("Teslim Edilen")}
            value={String(stats.delivered ?? 0)}
            accent="var(--rezvix-success)"
          />
          <StatCard
            icon="💰"
            label={t("Ciro")}
            value={money(stats.revenue ?? 0)}
            accent="#0891b2"
          />
          <StatCard
            icon="📦"
            label={t("Ürün")}
            value={String(stats.productCount ?? 0)}
            accent="var(--rezvix-primary)"
          />
          <StatCard
            icon="✏️"
            label={t("Override")}
            value={String(stats.overrideCount ?? 0)}
            accent="#d97706"
          />
        </div>
      )}

      {/* ── Override edilen ürünler ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Override Edilen Ürünler")}</div>

        {overriddenProducts.length === 0 ? (
          <div
            style={{
              fontSize: 13,
              color: "var(--rezvix-text-soft)",
              fontStyle: "italic",
              padding: "8px 0",
            }}
          >
            {t("Bu şube hiçbir üründe override yapmamış")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {overriddenProducts.map((p, idx) => (
              <div
                key={p.orgProductId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom:
                    idx < overriddenProducts.length - 1
                      ? "1px solid var(--rezvix-border-subtle)"
                      : "none",
                  flexWrap: "wrap",
                }}
              >
                {/* Title */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--rezvix-text-main)",
                    minWidth: 120,
                  }}
                >
                  {p.title}
                </span>

                {/* Chain default price */}
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--rezvix-text-soft)",
                    textDecoration: "line-through",
                  }}
                >
                  {money(p.defaultPrice)}
                </span>

                {/* Branch price */}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--rezvix-primary)",
                  }}
                >
                  {money(p.price)}
                </span>

                {/* Discount price if any */}
                {p.discountPrice != null && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--rezvix-success)",
                    }}
                  >
                    {money(p.discountPrice)} {t("indirim")}
                  </span>
                )}

                {/* Badges */}
                <div style={{ display: "flex", gap: 6 }}>
                  {p.isAvailable === false && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "rgba(220,38,38,.10)",
                        color: "var(--rezvix-danger)",
                        border: "1px solid rgba(220,38,38,.20)",
                      }}
                    >
                      {t("Stok yok")}
                    </span>
                  )}
                  {p.hidden && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: 999,
                        background: "rgba(107,114,128,.10)",
                        color: "var(--rezvix-text-muted)",
                        border: "1px solid rgba(107,114,128,.20)",
                      }}
                    >
                      {t("Gizli")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Operasyonel ayarlar ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Operasyonel Ayarlar")}</div>

        {/* Checkboxes */}
        <div style={{ display: "flex", gap: 28, marginBottom: 18 }}>
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
              style={{ fontSize: 13, fontWeight: 600, color: "var(--rezvix-text-muted)" }}
            >
              {t("Aktif")}
            </span>
          </label>

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
              style={{ fontSize: 13, fontWeight: 600, color: "var(--rezvix-text-muted)" }}
            >
              {t("Gel-Al (Pickup)")}
            </span>
          </label>
        </div>

        {/* Working hours */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 20px",
          }}
        >
          <FormField label={t("Açılış Saati (HH:MM)")}>
            <input
              value={whOpen}
              onChange={(e) => setWhOpen(e.target.value)}
              placeholder="09:00"
              style={inputSx}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </FormField>

          <FormField label={t("Kapanış Saati (HH:MM)")}>
            <input
              value={whClose}
              onChange={(e) => setWhClose(e.target.value)}
              placeholder="22:00"
              style={inputSx}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </FormField>
        </div>

        {/* Days */}
        <FormField label={t("Çalışma Günleri")}>
          <DaysToggle value={whDays} onChange={setWhDays} />
        </FormField>

        {/* Delivery */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "0 20px",
          }}
        >
          <FormField label={t("Teslimat Yarıçapı (km)")}>
            <input
              type="number"
              min={0}
              step={0.5}
              value={deliveryZoneKm}
              onChange={(e) => setDeliveryZoneKm(e.target.value)}
              style={inputSx}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </FormField>

          <FormField label={t("Min. Sipariş Tutarı (₺)")}>
            <input
              type="number"
              min={0}
              step={1}
              value={minOrderAmount}
              onChange={(e) => setMinOrderAmount(e.target.value)}
              style={inputSx}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </FormField>

          <FormField label={t("Teslimat Ücreti (₺)")}>
            <input
              type="number"
              min={0}
              step={0.5}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              style={inputSx}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </FormField>

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
              placeholder={t("Yok")}
              style={inputSx}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </FormField>
        </div>
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
          disabled={saving}
          style={{
            padding: "11px 32px",
            borderRadius: 999,
            border: "none",
            background: saving
              ? "var(--rezvix-bg-soft)"
              : "linear-gradient(135deg, var(--rezvix-primary), var(--rezvix-primary-strong))",
            color: saving ? "var(--rezvix-text-soft)" : "#fff",
            fontWeight: 700,
            fontSize: 14,
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: saving ? "none" : "0 4px 14px var(--rezvix-primary-soft)",
            transition: "opacity 0.15s, transform 0.1s",
          }}
          onMouseEnter={(e) => {
            if (!saving) {
              (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
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
