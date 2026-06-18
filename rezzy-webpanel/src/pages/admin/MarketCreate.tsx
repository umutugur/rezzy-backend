// src/pages/admin/MarketCreate.tsx
import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminCreateMarketStore } from "../../api/adminMarketStores";
import { pickOrganizations, pickUsers } from "../../api/adminPickers";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";
import { EntityPicker } from "../../desktop/components/admin/EntityPicker";

// ─── Category enum (mirrors MarketDetail / MarketSettings) ────────────────────

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

// ─── Shared input style (mirrors MarketDetail) ─────────────────────────────────

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

const inputErrorSx: React.CSSProperties = {
  ...inputSx,
  border: "1.5px solid var(--rezvix-danger)",
};

const selectSx: React.CSSProperties = {
  ...inputSx,
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238899aa' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 32,
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
  textTransform: "uppercase" as const,
  marginBottom: 18,
};

const gridSx = (cols: number): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: "0 20px",
});

const radioGroupSx: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginBottom: 16,
};

const radioOptionSx = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 10,
  border: `1.5px solid ${active ? "var(--rezvix-primary)" : "var(--rezvix-border-strong)"}`,
  background: active ? "var(--rezvix-primary-soft)" : "var(--rezvix-bg-elevated)",
  cursor: "pointer",
  userSelect: "none" as const,
  transition: "border-color 0.15s, background 0.15s",
});

const radioLabelSx: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 500,
  color: "var(--rezvix-text-main)",
};

const radioDescSx: React.CSSProperties = {
  fontSize: 12,
  color: "var(--rezvix-text-soft)",
  marginTop: 2,
};

type OwnerMode = "new" | "existing";
type ChainMode = "none" | "existing" | "new";

interface Errors {
  name?: string;
  category?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPassword?: string;
  existingOwnerId?: string;
  existingOrgId?: string;
  newChainName?: string;
}

export default function AdminMarketCreatePage() {
  const nav = useNavigate();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  // ── Store fields ──────────────────────────────────────────────────────────────
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [commissionRate, setCommissionRate] = React.useState("");
  const [deliveryZoneKm, setDeliveryZoneKm] = React.useState("");
  const [minOrderAmount, setMinOrderAmount] = React.useState("");
  const [deliveryFee, setDeliveryFee] = React.useState("");
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = React.useState("");
  const [pickupEnabled, setPickupEnabled] = React.useState(true);

  // ── Owner mode ────────────────────────────────────────────────────────────────
  const [ownerMode, setOwnerMode] = React.useState<OwnerMode>("new");
  // new owner
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");
  // existing owner
  const [existingOwnerId, setExistingOwnerId] = React.useState<string | null>(null);

  // ── Chain mode ────────────────────────────────────────────────────────────────
  const [chainMode, setChainMode] = React.useState<ChainMode>("none");
  const [existingOrgId, setExistingOrgId] = React.useState<string | null>(null);
  const [newChainName, setNewChainName] = React.useState("");

  // ── Validation errors ─────────────────────────────────────────────────────────
  const [errors, setErrors] = React.useState<Errors>({});

  // ─── Mutation ─────────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: () => {
      const store: Record<string, any> = {
        name: name.trim(),
        category,
      };

      if (description.trim()) store.description = description.trim();
      if (address.trim()) store.address = address.trim();
      if (city.trim()) store.city = city.trim();
      if (commissionRate !== "") store.commissionRate = Number(commissionRate);
      if (deliveryZoneKm !== "") store.deliveryZoneKm = Number(deliveryZoneKm);
      if (minOrderAmount !== "") store.minOrderAmount = Number(minOrderAmount);
      if (deliveryFee !== "") store.deliveryFee = Number(deliveryFee);
      if (freeDeliveryThreshold !== "")
        store.freeDeliveryThreshold = Number(freeDeliveryThreshold);
      store.pickupEnabled = pickupEnabled;

      const owner: Record<string, any> =
        ownerMode === "new"
          ? { name: ownerName.trim(), email: ownerEmail.trim(), password: ownerPassword }
          : { existingOwnerId: existingOwnerId as string };

      const body: Record<string, any> = { store, owner };

      if (chainMode === "existing" && existingOrgId) {
        body.organization = existingOrgId;
      } else if (chainMode === "new" && newChainName.trim()) {
        body.organizationName = newChainName.trim();
      }

      return adminCreateMarketStore(body);
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-market-stores"] });
      showToast(t("Market oluşturuldu"), "success");
      const storeId = res?.store?._id ?? res?._id;
      if (storeId) nav(`/admin/market/stores/${storeId}`, { replace: true });
      else nav("/admin/market/stores", { replace: true });
    },
    onError: (e: any) => {
      showToast(
        e?.response?.data?.message ?? t("Market oluşturulamadı"),
        "error"
      );
    },
  });

  // ─── Validation ───────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Errors = {};

    if (!name.trim()) errs.name = t("Market adı zorunlu");
    if (!category) errs.category = t("Kategori seçimi zorunlu");

    if (ownerMode === "new") {
      if (!ownerName.trim()) errs.ownerName = t("Sahip adı zorunlu");
      if (!ownerEmail.trim()) errs.ownerEmail = t("E-posta zorunlu");
      if (!ownerPassword) errs.ownerPassword = t("Şifre zorunlu");
    } else {
      if (!existingOwnerId) errs.existingOwnerId = t("Bir kullanıcı seçin");
    }

    if (chainMode === "existing" && !existingOrgId) {
      errs.existingOrgId = t("Bir zincir seçin");
    }
    if (chainMode === "new" && !newChainName.trim()) {
      errs.newChainName = t("Zincir adı zorunlu");
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) {
      showToast(t("Lütfen zorunlu alanları doldurun"), "error");
      return;
    }
    createMut.mutate();
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 24px" }}>
      <AdminPageHeader
        title={t("Market Ekle")}
        actions={
          <button
            type="button"
            onClick={() => nav("/admin/market/stores")}
            style={{
              padding: "7px 16px",
              borderRadius: 9,
              border: "1.5px solid var(--rezvix-border-strong)",
              background: "transparent",
              color: "var(--rezvix-text-muted)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ← {t("Geri")}
          </button>
        }
      />

      {/* ── Section 1: Market bilgileri ──────────────────────────────────────── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Market Bilgileri")}</div>

        <div style={gridSx(2)}>
          <FormField label={t("Market Adı")} required error={errors.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={errors.name ? inputErrorSx : inputSx}
              placeholder={t("ör. Akıncı Market")}
            />
          </FormField>

          <FormField label={t("Kategori")} required error={errors.category}>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={errors.category ? { ...selectSx, border: "1.5px solid var(--rezvix-danger)" } : selectSx}
            >
              <option value="">{t("Seçin…")}</option>
              {MARKET_STORE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(CATEGORY_LABELS[c] ?? c)}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField label={t("Açıklama")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputSx, resize: "vertical", lineHeight: 1.5 }}
            placeholder={t("Kısa tanıtım metni (opsiyonel)")}
          />
        </FormField>

        <div style={gridSx(2)}>
          <FormField label={t("Şehir")}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={inputSx}
              placeholder={t("ör. İstanbul")}
            />
          </FormField>

          <FormField label={t("Adres")}>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={inputSx}
              placeholder={t("Cadde / sokak bilgisi")}
            />
          </FormField>
        </div>

        <div style={gridSx(3)}>
          <FormField label={t("Komisyon (%)")} hint={t("Örn: 10 → %10")}>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              style={inputSx}
              placeholder="10"
            />
          </FormField>

          <FormField label={t("Teslimat Bölgesi (km)")}>
            <input
              type="number"
              min={0}
              step={0.1}
              value={deliveryZoneKm}
              onChange={(e) => setDeliveryZoneKm(e.target.value)}
              style={inputSx}
              placeholder="5"
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
              placeholder="0"
            />
          </FormField>

          <FormField label={t("Teslimat Ücreti (₺)")}>
            <input
              type="number"
              min={0}
              step={1}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              style={inputSx}
              placeholder="0"
            />
          </FormField>

          <FormField
            label={t("Ücretsiz Teslimat Eşiği (₺)")}
            hint={t("Bu tutarı geçen siparişlerde teslimat ücretsiz")}
          >
            <input
              type="number"
              min={0}
              step={1}
              value={freeDeliveryThreshold}
              onChange={(e) => setFreeDeliveryThreshold(e.target.value)}
              style={inputSx}
              placeholder={t("Opsiyonel")}
            />
          </FormField>

          <FormField label={t("Gel-Al (Pickup)")}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                paddingTop: 8,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={pickupEnabled}
                onChange={(e) => setPickupEnabled(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--rezvix-primary)" }}
              />
              <span style={{ fontSize: 13.5, color: "var(--rezvix-text-main)", fontWeight: 500 }}>
                {t("Aktif")}
              </span>
            </label>
          </FormField>
        </div>
      </div>

      {/* ── Section 2: Sahip ──────────────────────────────────────────────────── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Sahip")}</div>

        <div style={radioGroupSx}>
          {(["new", "existing"] as OwnerMode[]).map((mode) => (
            <label
              key={mode}
              style={radioOptionSx(ownerMode === mode)}
              onClick={() => setOwnerMode(mode)}
            >
              <input
                type="radio"
                checked={ownerMode === mode}
                onChange={() => setOwnerMode(mode)}
                style={{ accentColor: "var(--rezvix-primary)", flexShrink: 0 }}
              />
              <div>
                <div style={radioLabelSx}>
                  {mode === "new" ? t("Yeni sahip oluştur") : t("Mevcut kullanıcı")}
                </div>
                <div style={radioDescSx}>
                  {mode === "new"
                    ? t("İsim, e-posta ve şifre girerek yeni bir sahip hesabı oluşturulur")
                    : t("Sistemde kayıtlı bir kullanıcıyı sahip olarak ata")}
                </div>
              </div>
            </label>
          ))}
        </div>

        {ownerMode === "new" && (
          <div style={gridSx(3)}>
            <FormField label={t("Ad Soyad")} required error={errors.ownerName}>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                style={errors.ownerName ? inputErrorSx : inputSx}
                placeholder={t("ör. Ahmet Yılmaz")}
              />
            </FormField>

            <FormField label={t("E-posta")} required error={errors.ownerEmail}>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                style={errors.ownerEmail ? inputErrorSx : inputSx}
                placeholder="sahip@email.com"
              />
            </FormField>

            <FormField label={t("Şifre")} required error={errors.ownerPassword}>
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                style={errors.ownerPassword ? inputErrorSx : inputSx}
                placeholder="••••••••"
              />
            </FormField>
          </div>
        )}

        {ownerMode === "existing" && (
          <FormField
            label={t("Kullanıcı Seç")}
            required
            error={errors.existingOwnerId}
          >
            <EntityPicker
              fetcher={pickUsers}
              value={existingOwnerId}
              onChange={(id: string | null) => setExistingOwnerId(id)}
              placeholder={t("İsim veya e-posta ile ara…")}
            />
          </FormField>
        )}
      </div>

      {/* ── Section 3: Zincir ─────────────────────────────────────────────────── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Zincir (Organizasyon)")}</div>

        <div style={radioGroupSx}>
          {(["none", "existing", "new"] as ChainMode[]).map((mode) => (
            <label
              key={mode}
              style={radioOptionSx(chainMode === mode)}
              onClick={() => setChainMode(mode)}
            >
              <input
                type="radio"
                checked={chainMode === mode}
                onChange={() => setChainMode(mode)}
                style={{ accentColor: "var(--rezvix-primary)", flexShrink: 0 }}
              />
              <div>
                <div style={radioLabelSx}>
                  {mode === "none" && t("Tekil market (zincir yok)")}
                  {mode === "existing" && t("Mevcut zincire bağla")}
                  {mode === "new" && t("Yeni zincir oluştur")}
                </div>
                <div style={radioDescSx}>
                  {mode === "none" && t("Market herhangi bir organizasyona bağlı olmayacak")}
                  {mode === "existing" && t("Sistemde kayıtlı bir organizasyona ata")}
                  {mode === "new" && t("Bu market için yeni bir zincir / organizasyon oluştur")}
                </div>
              </div>
            </label>
          ))}
        </div>

        {chainMode === "existing" && (
          <FormField
            label={t("Organizasyon Seç")}
            required
            error={errors.existingOrgId}
          >
            <EntityPicker
              fetcher={pickOrganizations}
              value={existingOrgId}
              onChange={(id: string | null) => setExistingOrgId(id)}
              placeholder={t("Organizasyon adı ile ara…")}
            />
          </FormField>
        )}

        {chainMode === "new" && (
          <FormField
            label={t("Yeni Zincir Adı")}
            required
            error={errors.newChainName}
          >
            <input
              value={newChainName}
              onChange={(e) => setNewChainName(e.target.value)}
              style={errors.newChainName ? inputErrorSx : inputSx}
              placeholder={t("ör. ABC Marketler Zinciri")}
            />
          </FormField>
        )}
      </div>

      {/* ── Submit row ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createMut.isPending}
          style={{
            padding: "10px 28px",
            borderRadius: 10,
            border: "none",
            background: createMut.isPending
              ? "var(--rezvix-border-strong)"
              : "var(--rezvix-primary)",
            color: createMut.isPending ? "var(--rezvix-text-soft)" : "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: createMut.isPending ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s, opacity 0.15s",
            letterSpacing: "0.01em",
          }}
        >
          {createMut.isPending ? t("Kaydediliyor…") : t("Market Oluştur")}
        </button>

        <span
          style={{
            fontSize: 12.5,
            color: "var(--rezvix-text-soft)",
          }}
        >
          * {t("zorunlu alan")}
        </span>
      </div>
    </div>
  );
}
