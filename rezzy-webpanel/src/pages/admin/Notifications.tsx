import React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  adminSendNotification,
  AdminSendTargets,
  AdminSendResponse
} from "../../api/client";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";
import { EntityPicker } from "../../desktop/components/admin/EntityPicker";
import { pickMarketStores } from "../../api/adminPickers";
import { FormField } from "../../desktop/components/admin/FormField";

// ─── Known deep-link routes ───────────────────────────────────────────────────
const KNOWN_ROUTES = [
  { value: "ReservationDetail",  label: "ReservationDetail" },
  { value: "MarketOrderDetail",  label: "MarketOrderDetail" },
  { value: "MarketStore",        label: "MarketStore" },
  { value: "TaxiRideDetail",     label: "TaxiRideDetail" },
] as const;

type KnownRoute = typeof KNOWN_ROUTES[number]["value"] | "";

// ─── Target groups ────────────────────────────────────────────────────────────
type TargetOption = { k: AdminSendTargets; label: string };

const TARGET_GROUPS: Array<{ heading: string; options: TargetOption[] }> = [
  {
    heading: "Genel",
    options: [
      { k: "all",         label: "Tümü" },
      { k: "customers",   label: "Müşteriler" },
      { k: "restaurants", label: "Restoranlar" },
      { k: "email",       label: "Tek E-posta" },
    ],
  },
  {
    heading: "Market",
    options: [
      { k: "market_customers", label: "Market Müşterileri" },
      { k: "market_owners",    label: "Market Sahipleri" },
    ],
  },
  {
    heading: "Taksi",
    options: [
      { k: "taxi_drivers",    label: "Taksi Sürücüleri" },
      { k: "taxi_passengers", label: "Taksi Yolcuları" },
    ],
  },
];

// ─── Shared input style ───────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-lg border border-[var(--rezvix-border-strong)] bg-[var(--rezvix-bg-elevated)] text-[var(--rezvix-text-main)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--rezvix-primary)] placeholder:text-[var(--rezvix-text-soft)]";

// ─── Section heading ─────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--rezvix-text-soft)",
        marginBottom: 6,
        marginTop: 2,
      }}
    >
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminNotificationsPage() {
  const { t } = useI18n();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [targets, setTargets] = React.useState<AdminSendTargets>("all");
  const [email, setEmail]     = React.useState("");
  const [title, setTitle]     = React.useState("");
  const [body, setBody]       = React.useState("");

  // ── Structured deep-link builder ────────────────────────────────────────────
  const [route, setRoute]     = React.useState<KnownRoute>("");
  const [routeId, setRouteId] = React.useState("");
  const [storeId, setStoreId] = React.useState<string | null>(null);

  // ── Advanced JSON escape hatch ──────────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [advancedJson, setAdvancedJson] = React.useState("");

  // ── Mutation ────────────────────────────────────────────────────────────────
  const m = useMutation<AdminSendResponse, any, {
    targets: AdminSendTargets;
    email?: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }>({
    mutationFn: (vars) => adminSendNotification(vars),
    onSuccess: (res) => {
      showToast(
        t("Gönderildi • kullanıcı: {users}, token: {tokens}", {
          users: res.targetedUsers,
          tokens: res.targetedTokens,
        }),
        "success"
      );
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || e?.message || t("Gönderim hatası");
      showToast(msg, "error");
    },
  });

  // ── Submit handler ──────────────────────────────────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !body.trim()) {
      return showToast(t("Başlık ve içerik gerekli"), "error");
    }
    if (targets === "email" && !email.trim()) {
      return showToast(t("E-posta gerekli"), "error");
    }

    let data: Record<string, string> | undefined = undefined;

    // Advanced JSON overrides structured builder
    if (advancedJson.trim()) {
      try {
        data = JSON.parse(advancedJson);
      } catch {
        return showToast(t("Data JSON geçersiz"), "error");
      }
    } else if (route) {
      // Build from structured fields
      const id = route === "MarketStore" ? (storeId ?? "") : routeId;
      data = id.trim() ? { route, id: id.trim() } : { route };
    }

    m.mutate({
      targets,
      email: email.trim() || undefined,
      title: title.trim(),
      body: body.trim(),
      data,
    });
  }

  // ── Card style shared across the form ─────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: "var(--rezvix-bg-elevated)",
    border: "1.5px solid var(--rezvix-border-subtle)",
    borderRadius: 14,
    padding: "22px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--rezvix-text-muted)",
    letterSpacing: "0.02em",
    marginBottom: 6,
    display: "block",
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      {/* Page title */}
      <div style={{ marginBottom: 22 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--rezvix-text-main)",
            margin: 0,
          }}
        >
          {t("Manuel Bildirim Gönder")}
        </h2>
        <p style={{ fontSize: 13, color: "var(--rezvix-text-soft)", marginTop: 4 }}>
          {t("Seçili hedef kitleye anlık push bildirimi gönder")}
        </p>
      </div>

      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Target selector ─────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div>
            <span style={labelStyle}>{t("Hedef Kitle")}</span>
            {TARGET_GROUPS.map((group) => (
              <div key={group.heading} style={{ marginBottom: 12 }}>
                <SectionHeading>{t(group.heading)}</SectionHeading>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                    gap: 8,
                  }}
                >
                  {group.options.map((opt) => {
                    const active = targets === opt.k;
                    return (
                      <label
                        key={opt.k}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 12px",
                          borderRadius: 9,
                          border: `1.5px solid ${
                            active ? "var(--rezvix-primary)" : "var(--rezvix-border-strong)"
                          }`,
                          background: active
                            ? "var(--rezvix-primary-soft)"
                            : "var(--rezvix-bg-soft)",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          color: active
                            ? "var(--rezvix-primary)"
                            : "var(--rezvix-text-main)",
                          transition: "all 0.12s",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="radio"
                          name="targets"
                          value={opt.k}
                          checked={active}
                          onChange={() => setTargets(opt.k)}
                          style={{ accentColor: "var(--rezvix-primary)", margin: 0 }}
                        />
                        {t(opt.label)}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Email input — shown only when target=email */}
          {targets === "email" && (
            <div>
              <span style={labelStyle}>{t("E-posta")}</span>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("kullanici@ornek.com")}
                required
              />
            </div>
          )}
        </div>

        {/* ── Message content ──────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div>
            <span style={labelStyle}>{t("Başlık")}</span>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("Örn: Rezervasyonun Onaylandı!")}
              required
            />
          </div>

          <div>
            <span style={labelStyle}>{t("İçerik")}</span>
            <textarea
              className={inputCls}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t(
                "Örn: Bugünkü rezervasyonunuz saat 19:00'da. QR ile hızlı check-in yapabilirsiniz."
              )}
              rows={4}
              required
              style={{ resize: "vertical" }}
            />
          </div>
        </div>

        {/* ── Deep-link builder ────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div>
            <span style={labelStyle}>{t("Yönlendirme (opsiyonel)")}</span>
            <p style={{ fontSize: 12, color: "var(--rezvix-text-soft)", marginBottom: 12, marginTop: -2 }}>
              {t("Bildirime tıklanınca uygulamada hangi ekrana gidileceğini belirle.")}
            </p>

            {/* Route select */}
            <FormField label={t("Ekran (route)")}>
              <select
                value={route}
                onChange={(e) => {
                  setRoute(e.target.value as KnownRoute);
                  setRouteId("");
                  setStoreId(null);
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 9,
                  border: "1.5px solid var(--rezvix-border-strong)",
                  background: "var(--rezvix-bg-elevated)",
                  color: "var(--rezvix-text-main)",
                  fontSize: 13.5,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="">{t("Yok")}</option>
                {KNOWN_ROUTES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </FormField>

            {/* ID input — varies by route */}
            {!!route && (
              <div style={{ marginTop: 12 }}>
                {route === "MarketStore" ? (
                  <FormField
                    label={t("Market (ID)")}
                    hint={t("Market adıyla arama yapabilirsiniz")}
                  >
                    <EntityPicker
                      fetcher={pickMarketStores}
                      value={storeId}
                      onChange={(val: string | null) => setStoreId(val)}
                      placeholder={t("Market ara…")}
                    />
                  </FormField>
                ) : (
                  <FormField label={t("Kayıt ID")}>
                    <input
                      className={inputCls}
                      value={routeId}
                      onChange={(e) => setRouteId(e.target.value)}
                      placeholder={t("Örn: 664abc123def…")}
                    />
                  </FormField>
                )}
              </div>
            )}

            {/* Preview */}
            {route && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--rezvix-bg-soft)",
                  border: "1px solid var(--rezvix-border-subtle)",
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "var(--rezvix-text-soft)",
                }}
              >
                {JSON.stringify(
                  route === "MarketStore"
                    ? storeId ? { route, id: storeId } : { route }
                    : routeId.trim() ? { route, id: routeId.trim() } : { route },
                  null,
                  2
                )}
              </div>
            )}
          </div>

          {/* Advanced JSON escape hatch */}
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--rezvix-text-soft)",
                letterSpacing: "0.02em",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  transition: "transform 0.15s",
                  transform: advancedOpen ? "rotate(90deg)" : "rotate(0deg)",
                  fontSize: 10,
                }}
              >
                ▶
              </span>
              {t("Gelişmiş (JSON)")}
              {advancedJson.trim() && (
                <span
                  style={{
                    background: "var(--rezvix-primary)",
                    color: "#fff",
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                    marginLeft: 4,
                  }}
                >
                  {t("aktif")}
                </span>
              )}
            </button>

            {advancedOpen && (
              <div style={{ marginTop: 10 }}>
                <textarea
                  className={inputCls}
                  value={advancedJson}
                  onChange={(e) => setAdvancedJson(e.target.value)}
                  placeholder={'{"route":"ReservationDetail","id":"..."}'}
                  rows={4}
                  style={{
                    fontFamily: "monospace",
                    fontSize: 12,
                    resize: "vertical",
                  }}
                />
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--rezvix-text-soft)",
                    marginTop: 5,
                  }}
                >
                  {t(
                    "Buraya geçerli JSON girilirse yukarıdaki builder'ı geçersiz kılar ve doğrudan data olarak gönderilir."
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="submit"
            disabled={m.isPending}
            style={{
              background: m.isPending ? "var(--rezvix-text-soft)" : "var(--rezvix-primary)",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: m.isPending ? "not-allowed" : "pointer",
              opacity: m.isPending ? 0.7 : 1,
              transition: "opacity 0.15s, background 0.15s",
            }}
          >
            {m.isPending ? t("Gönderiliyor...") : t("Gönder")}
          </button>
          {m.isSuccess && (
            <span style={{ fontSize: 13, color: "var(--rezvix-text-soft)" }}>
              {t("Gönderildi.")}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
