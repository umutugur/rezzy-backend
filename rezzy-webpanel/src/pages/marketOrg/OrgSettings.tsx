// src/pages/marketOrg/OrgSettings.tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authStore } from "../../store/auth";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";
import { getOrgProfile, updateOrgProfile } from "../../api/marketOrgCatalog";
import { uploadMarketImage } from "../../api/marketDesktop";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

// ─── Shared input style (mirrors OrgBranchDetail) ─────────────────────────────

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

const selectSx: React.CSSProperties = {
  ...inputSx,
  appearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a9bb0' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 34,
  cursor: "pointer",
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

// ─── Focus / blur helpers ─────────────────────────────────────────────────────

function onInputFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--rezvix-primary)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--rezvix-primary-soft)";
}
function onInputBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--rezvix-border-strong)";
  e.currentTarget.style.boxShadow = "none";
}

// ─── No-org state ─────────────────────────────────────────────────────────────

function NoOrgState({ t }: { t: (s: string) => string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        textAlign: "center",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.4 }}>⚙️</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--rezvix-text-main)" }}>
        {t("Bir zincire bağlı değilsiniz")}
      </div>
      <div style={{ fontSize: 13, color: "var(--rezvix-text-muted)", maxWidth: 360 }}>
        {t(
          "Bu paneli kullanabilmek için bir zincir organizasyonuna üye olmanız gerekmektedir.",
        )}
      </div>
    </div>
  );
}

// ─── Logo upload section ──────────────────────────────────────────────────────

function LogoUpload({
  logoUrl,
  onUploaded,
  t,
}: {
  logoUrl: string;
  onUploaded: (url: string) => void;
  t: (s: string) => string;
}) {
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadMarketImage(file);
      onUploaded(url);
      showToast(t("Logo yüklendi"), "success");
    } catch {
      showToast(t("Logo yüklenemedi"), "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {/* Preview */}
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 14,
          border: "1.5px solid var(--rezvix-border-strong)",
          background: "var(--rezvix-bg-soft)",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 28,
          color: "var(--rezvix-text-soft)",
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="logo"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          "🏢"
        )}
      </div>

      {/* Upload button */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          style={{
            padding: "8px 16px",
            borderRadius: 999,
            border: "1.5px solid var(--rezvix-border-strong)",
            background: uploading ? "var(--rezvix-bg-soft)" : "var(--rezvix-bg-elevated)",
            color: uploading ? "var(--rezvix-text-soft)" : "var(--rezvix-text-muted)",
            fontSize: 13,
            fontWeight: 600,
            cursor: uploading ? "not-allowed" : "pointer",
            transition: "all 0.13s",
          }}
          onMouseEnter={(e) => {
            if (!uploading) {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--rezvix-primary)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--rezvix-primary)";
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--rezvix-border-strong)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--rezvix-text-muted)";
          }}
        >
          {uploading ? t("Yükleniyor…") : (logoUrl ? t("Logoyu Değiştir") : t("Logo Yükle"))}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--rezvix-text-soft)" }}>
          {t("PNG, JPG, WebP — maks. 5 MB")}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OrgSettings() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const orgId = authStore.getUser()?.organizations?.[0]?.id ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["org-profile", orgId],
    queryFn: () => getOrgProfile(orgId!),
    enabled: !!orgId,
  });

  // ── Form state ─────────────────────────────────────────────────────────────
  const [name, setName] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [defaultLanguage, setDefaultLanguage] = React.useState("tr");
  const [description, setDescription] = React.useState("");

  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydratedRef.current) return;
    hydratedRef.current = true;
    setName(data.name ?? "");
    setLogoUrl(data.logoUrl ?? "");
    setRegion(data.region ?? "");
    setDefaultLanguage(data.defaultLanguage ?? "tr");
    setDescription(data.description ?? "");
  }, [data]);

  // ── Save mutation ──────────────────────────────────────────────────────────
  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () =>
      updateOrgProfile(orgId!, {
        name: name.trim() || undefined,
        logoUrl: logoUrl || undefined,
        region: region || undefined,
        defaultLanguage: defaultLanguage || undefined,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-profile", orgId] });
      showToast(t("Zincir profili güncellendi"), "success");
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message ?? t("Kayıt başarısız"), "error"),
  });

  // ── No-org guard ───────────────────────────────────────────────────────────
  if (!orgId) {
    return (
      <div style={{ padding: 32 }}>
        <AdminPageHeader
          title={t("Zincir Ayarları")}
          subtitle={t("Organizasyon profili")}
        />
        <NoOrgState t={t} />
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
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
            animation: "osspin 0.7s linear infinite",
            marginRight: 12,
          }}
        />
        {t("Yükleniyor…")}
        <style>{`@keyframes osspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--rezvix-danger)", fontSize: 14 }}>
        {t("Profil yüklenemedi.")}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <style>{`@keyframes osspin{to{transform:rotate(360deg)}}`}</style>

      <AdminPageHeader
        title={t("Zincir Ayarları")}
        subtitle={t("Organizasyon profili")}
      />

      {/* ── Logo ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Marka")}</div>
        <FormField label={t("Logo")}>
          <LogoUpload
            logoUrl={logoUrl}
            onUploaded={(url) => setLogoUrl(url)}
            t={t}
          />
        </FormField>
      </div>

      {/* ── Genel bilgiler ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Genel Bilgiler")}</div>

        <FormField label={t("Ad")} required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Zincir adı")}
            style={inputSx}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </FormField>

        <FormField label={t("Açıklama")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Kısa açıklama (opsiyonel)")}
            rows={3}
            style={{
              ...inputSx,
              resize: "vertical",
              minHeight: 80,
              lineHeight: 1.5,
            } as React.CSSProperties}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </FormField>
      </div>

      {/* ── Bölge & Dil ── */}
      <div style={sectionCardSx}>
        <div style={sectionTitleSx}>{t("Bölge & Dil")}</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 20px",
          }}
        >
          <FormField label={t("Bölge")}>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={selectSx}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            >
              <option value="">{t("Seçiniz")}</option>
              <option value="TR">🇹🇷 {t("Türkiye")}</option>
              <option value="CY">🇨🇾 {t("Kıbrıs")}</option>
            </select>
          </FormField>

          <FormField label={t("Varsayılan Dil")}>
            <select
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
              style={selectSx}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
            >
              <option value="tr">🇹🇷 Türkçe</option>
              <option value="en">🇬🇧 English</option>
              <option value="ru">🇷🇺 Русский</option>
              <option value="el">🇬🇷 Ελληνικά</option>
            </select>
          </FormField>
        </div>
      </div>

      {/* ── Save ── */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 40 }}>
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
