import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../i18n";
import { AdminPageHeader } from "../../desktop/components/admin/AdminPageHeader";
import { FormField } from "../../desktop/components/admin/FormField";
import {
  AppType,
  DriverDocRequirement,
  DriverDocRequirementInput,
  I18n,
  createDriverDocRequirement,
  deleteDriverDocRequirement,
  listDriverDocRequirements,
  updateDriverDocRequirement,
} from "../../api/driverApplications";

// ─── Style constants ───────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-[var(--rezvix-border-strong)] bg-[var(--rezvix-bg-elevated)] text-[var(--rezvix-text-main)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rezvix-primary)] placeholder:text-[var(--rezvix-text-soft)]";

const APP_TYPE_OPTIONS: Array<{ value: AppType; label: string }> = [
  { value: "driver", label: "Sürücü" },
  { value: "market", label: "Market" },
  { value: "restaurant", label: "Restoran" },
];

const COUNTRY_OPTIONS = [
  { value: "KKTC", label: "KKTC — Kuzey Kıbrıs" },
  { value: "TR", label: "TR — Türkiye" },
  { value: "CY", label: "CY — Kıbrıs" },
];

const LANGS: Array<{ key: keyof I18n; label: string }> = [
  { key: "tr", label: "Türkçe" },
  { key: "en", label: "English" },
  { key: "ru", label: "Русский" },
  { key: "el", label: "Ελληνικά" },
];

type FormState = {
  key: string;
  i18n: I18n;
  numberLabel: I18n;
  file: boolean;
  number: boolean;
  expiry: boolean;
  required: boolean;
  isActive: boolean;
  order: number;
};

const emptyForm = (): FormState => ({
  key: "",
  i18n: {},
  numberLabel: {},
  file: true,
  number: false,
  expiry: false,
  required: true,
  isActive: true,
  order: 0,
});

// ─── Toggle pill ───────────────────────────────────────────────────────────────
function TogglePill({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        fontWeight: 500,
        color: "var(--rezvix-text-main)",
        cursor: "pointer",
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid var(--rezvix-border-subtle)",
        background: checked ? "var(--rezvix-bg-soft)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--rezvix-primary)", width: 15, height: 15 }}
      />
      {label}
    </label>
  );
}

function StatusDot({ active, labels }: { active: boolean; labels: [string, string] }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 11px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        background: active ? "rgba(22,163,74,0.1)" : "rgba(120,120,120,0.1)",
        color: active ? "var(--rezvix-success)" : "var(--rezvix-text-soft)",
      }}
    >
      <span style={{ fontSize: 8 }}>●</span>
      {active ? labels[0] : labels[1]}
    </span>
  );
}

// ─── Edit / Create drawer ──────────────────────────────────────────────────────
function RequirementDrawer({
  open,
  initial,
  appType,
  countryCode,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  initial: DriverDocRequirement | null;
  appType: AppType;
  countryCode: string;
  onClose: () => void;
  onSave: (body: DriverDocRequirementInput) => void;
  saving: boolean;
}) {
  const { t } = useI18n();
  const [form, setForm] = React.useState<FormState>(emptyForm());
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    if (initial) {
      setForm({
        key: initial.key,
        i18n: { ...initial.i18n },
        numberLabel: { ...initial.numberLabel },
        file: initial.file,
        number: initial.number,
        expiry: initial.expiry,
        required: initial.required,
        isActive: initial.isActive,
        order: initial.order,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, initial]);

  if (!open) return null;

  const setI18n = (field: "i18n" | "numberLabel", lang: keyof I18n, value: string) =>
    setForm((f) => ({ ...f, [field]: { ...f[field], [lang]: value } }));

  const submit = () => {
    setErr(null);
    if (!form.key.trim()) {
      setErr(t("Anahtar (key) zorunlu"));
      return;
    }
    if (!form.i18n.tr?.trim()) {
      setErr(t("Türkçe etiket zorunlu"));
      return;
    }
    const cleanI18n: I18n = {};
    const cleanNumberLabel: I18n = {};
    LANGS.forEach(({ key }) => {
      const v = form.i18n[key]?.trim();
      if (v) cleanI18n[key] = v;
      const n = form.numberLabel[key]?.trim();
      if (n) cleanNumberLabel[key] = n;
    });
    onSave({
      appType,
      countryCode,
      key: form.key.trim(),
      i18n: cleanI18n,
      numberLabel: form.number ? cleanNumberLabel : {},
      file: form.file,
      number: form.number,
      expiry: form.expiry,
      required: form.required,
      isActive: form.isActive,
      order: Number(form.order) || 0,
    });
  };

  return (
    <div
      className="modal-backdrop z-50"
      onClick={onClose}
      style={{ display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "var(--rezvix-bg-elevated)",
          borderLeft: "1px solid var(--rezvix-border-subtle)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: "1px solid var(--rezvix-border-subtle)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--rezvix-text-main)" }}>
              {initial ? t("Belgeyi Düzenle") : t("Yeni Belge Gereksinimi")}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--rezvix-text-soft)" }}>
              {appTypeLabel(appType)} · {countryCode}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: 18,
              color: "var(--rezvix-text-soft)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <FormField label={t("Anahtar (key)")} required hint={t("örn: license, passport — sistem içi benzersiz kimlik")}>
            <input
              className={inputCls}
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="license"
              disabled={!!initial}
            />
          </FormField>

          <div style={{ marginTop: 4 }}>
            <div style={sectionHeading}>{t("Belge Etiketi (Diller)")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {LANGS.map(({ key, label }) => (
                <FormField key={key} label={label} required={key === "tr"}>
                  <input
                    className={inputCls}
                    value={form.i18n[key] ?? ""}
                    onChange={(e) => setI18n("i18n", key, e.target.value)}
                    placeholder={key === "tr" ? t("örn: Sürücü Belgesi") : ""}
                  />
                </FormField>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={sectionHeading}>{t("Alanlar")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <TogglePill label={t("Dosya yükleme")} checked={form.file} onChange={(v) => setForm((f) => ({ ...f, file: v }))} />
              <TogglePill label={t("Numara alanı")} checked={form.number} onChange={(v) => setForm((f) => ({ ...f, number: v }))} />
              <TogglePill label={t("Son geçerlilik tarihi")} checked={form.expiry} onChange={(v) => setForm((f) => ({ ...f, expiry: v }))} />
              <TogglePill label={t("Zorunlu belge")} checked={form.required} onChange={(v) => setForm((f) => ({ ...f, required: v }))} />
              <TogglePill label={t("Aktif")} checked={form.isActive} onChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
            </div>
          </div>

          {form.number && (
            <div style={{ marginTop: 12 }}>
              <div style={sectionHeading}>{t("Numara Etiketi (Diller)")}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {LANGS.map(({ key, label }) => (
                  <FormField key={key} label={label}>
                    <input
                      className={inputCls}
                      value={form.numberLabel[key] ?? ""}
                      onChange={(e) => setI18n("numberLabel", key, e.target.value)}
                      placeholder={key === "tr" ? t("örn: Belge Numarası") : ""}
                    />
                  </FormField>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 8, maxWidth: 160 }}>
            <FormField label={t("Sıra")}>
              <input
                type="number"
                className={inputCls}
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))}
              />
            </FormField>
          </div>

          {err && (
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--rezvix-danger)", fontWeight: 500 }}>
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "14px 24px",
            borderTop: "1px solid var(--rezvix-border-subtle)",
          }}
        >
          <button onClick={onClose} style={btnGhost}>
            {t("Vazgeç")}
          </button>
          <button onClick={submit} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? t("Kaydediliyor...") : t("Kaydet")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function DriverDocRequirementsPage() {
  const qc = useQueryClient();
  const { t } = useI18n();
  const [appType, setAppType] = React.useState<AppType>("driver");
  const [country, setCountry] = React.useState("KKTC");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DriverDocRequirement | null>(null);

  const queryKey = ["driver-doc-requirements", appType, country];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listDriverDocRequirements(appType, country),
  });
  const items = React.useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => a.order - b.order),
    [data?.items]
  );

  const saveMut = useMutation({
    mutationFn: async (body: DriverDocRequirementInput) => {
      if (editing) return updateDriverDocRequirement(editing._id, body);
      return createDriverDocRequirement(body);
    },
    onSuccess: async () => {
      setDrawerOpen(false);
      setEditing(null);
      await qc.invalidateQueries({ queryKey });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteDriverDocRequirement(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (r: DriverDocRequirement) => {
    setEditing(r);
    setDrawerOpen(true);
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1200 }}>
      <AdminPageHeader
        title={t("Belge Gereksinimleri")}
        subtitle={`${t(appTypeLabel(appType))} · ${t(
          "Tip ve ülke bazında başvuruda istenen belgeleri yönetin"
        )}`}
        actions={
          <button onClick={openCreate} style={btnPrimary}>
            + {t("Yeni Belge")}
          </button>
        }
      />

      {/* App type + country selector */}
      <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--rezvix-text-muted)" }}>
            {t("Başvuru Tipi")}
          </span>
          <select
            className={inputCls}
            value={appType}
            onChange={(e) => setAppType(e.target.value as AppType)}
          >
            {APP_TYPE_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {t(a.label)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--rezvix-text-muted)" }}>
            {t("Ülke")}
          </span>
          <select className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>
          {isLoading ? t("Yükleniyor…") : t("{n} belge tanımlı", { n: items.length })}
        </div>
      </div>

      {/* Requirements list */}
      <div
        style={{
          background: "var(--rezvix-bg-elevated)",
          border: "1.5px solid var(--rezvix-border-subtle)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--rezvix-bg-soft)", textAlign: "left" }}>
                {[t("Sıra"), t("Anahtar"), t("Etiket (TR)"), t("Alanlar"), t("Zorunlu"), t("Durum"), t("İşlem")].map((h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} style={emptyCell}>
                    {t("Yükleniyor…")}
                  </td>
                </tr>
              )}
              {!isLoading &&
                items.map((r, idx) => (
                  <tr
                    key={r._id}
                    style={{
                      borderTop: "1px solid var(--rezvix-border-subtle)",
                      background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.012)",
                    }}
                  >
                    <td style={{ padding: "12px 16px", color: "var(--rezvix-text-muted)", fontWeight: 600 }}>
                      {r.order}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <code
                        style={{
                          fontSize: 12.5,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: "var(--rezvix-bg-soft)",
                          border: "1px solid var(--rezvix-border-subtle)",
                          color: "var(--rezvix-text-main)",
                        }}
                      >
                        {r.key}
                      </code>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--rezvix-text-main)", fontWeight: 600 }}>
                      {r.i18n.tr ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {r.file && <FieldTag label={t("Dosya")} />}
                        {r.number && <FieldTag label={t("No")} />}
                        {r.expiry && <FieldTag label={t("Tarih")} />}
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusDot active={r.required} labels={[t("Zorunlu"), t("Opsiyonel")]} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <StatusDot active={r.isActive} labels={[t("Aktif"), t("Pasif")]} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEdit(r)} style={btnSmall}>
                          {t("Düzenle")}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(t("Belge gereksinimi silinsin mi?"))) deleteMut.mutate(r._id);
                          }}
                          style={btnDanger}
                        >
                          {t("Sil")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={7} style={emptyCell}>
                    {t("Bu ülke için tanımlı belge yok")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <RequirementDrawer
        open={drawerOpen}
        initial={editing}
        appType={appType}
        countryCode={country}
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        onSave={(body) => saveMut.mutate(body)}
        saving={saveMut.isPending}
      />
    </div>
  );
}

// ─── Small helpers / shared styles ─────────────────────────────────────────────
function appTypeLabel(appType: AppType): string {
  return (
    APP_TYPE_OPTIONS.find((a) => a.value === appType)?.label ?? appType
  );
}

function FieldTag({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: "var(--rezvix-bg-soft)",
        border: "1px solid var(--rezvix-border-strong)",
        color: "var(--rezvix-text-muted)",
      }}
    >
      {label}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--rezvix-bg-elevated)",
  border: "1.5px solid var(--rezvix-border-subtle)",
  borderRadius: 16,
  padding: "18px 22px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  marginBottom: 20,
};

const sectionHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--rezvix-text-soft)",
  marginBottom: 12,
  marginTop: 6,
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--rezvix-text-soft)",
  whiteSpace: "nowrap",
};

const emptyCell: React.CSSProperties = {
  padding: "32px 16px",
  textAlign: "center",
  color: "var(--rezvix-text-soft)",
  fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 10,
  background: "var(--rezvix-primary)",
  color: "#fff",
  fontSize: 13.5,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 10,
  background: "transparent",
  color: "var(--rezvix-text-muted)",
  fontSize: 13.5,
  fontWeight: 600,
  border: "1px solid var(--rezvix-border-strong)",
  cursor: "pointer",
};

const btnSmall: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  background: "var(--rezvix-bg-soft)",
  border: "1px solid var(--rezvix-border-strong)",
  color: "var(--rezvix-text-main)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  background: "rgba(220,38,38,0.08)",
  border: "1px solid rgba(220,38,38,0.2)",
  color: "var(--rezvix-danger)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
