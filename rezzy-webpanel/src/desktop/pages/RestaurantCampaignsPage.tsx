import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RestaurantDesktopLayout,
  useRestaurantDesktopCurrency,
} from "../layouts/RestaurantDesktopLayout";
import {
  listEligible,
  join,
  leave,
  type Campaign,
  type RestaurantEligibleCampaign,
} from "../../api/restaurantCampaigns";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";
import { useI18n } from "../../i18n";
import { showToast } from "../../ui/Toast";

// ── Light palette (matches rezvix --rezvix-* light theme) ──────────────────
const C = {
  surface: "#ffffff", surfaceAlt: "#f1f3f9",
  border: "#e6e8ef", borderSoft: "#eef0f4",
  indigo: "#4f46e5", indigoSoft: "#6366f1",
  green: "#16a34a", red: "#dc2626", amber: "#d97706", cyan: "#0891b2",
  text: "#1b1c22", muted: "#5b6172", faint: "#9aa1b1",
};

const money = (n: number) =>
  "₺" + (n ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

function discountSummary(c: Campaign, t: (s: string) => string): string {
  const d = c.discount;
  const v = d.value ?? 0;
  switch (d.kind) {
    case "percent":
      return `%${v} ${t("indirim")}`;
    case "fixed":
      return `${money(v)} ${t("indirim")}`;
    case "free_delivery":
      return t("Ücretsiz teslimat");
    case "fixed_price":
      return `${t("Sabit fiyat")} ${money(v)}`;
    default:
      return t("İndirim");
  }
}

function discountAccent(kind: Campaign["discount"]["kind"]): string {
  switch (kind) {
    case "percent": return C.indigo;
    case "fixed": return C.green;
    case "free_delivery": return C.cyan;
    case "fixed_price": return C.amber;
    default: return C.indigo;
  }
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function validityLabel(c: Campaign, t: (s: string) => string): string | null {
  const from = fmtDate(c.validFrom);
  const to = fmtDate(c.validTo);
  if (from && to) return `${from} – ${to}`;
  if (to) return `${t("Son")} ${to}`;
  if (from) return `${from} ${t("itibaren")}`;
  return null;
}

function CampaignCard({
  item,
  busy,
  onToggle,
}: {
  item: RestaurantEligibleCampaign;
  busy: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const c = item.campaign;
  const accent = discountAccent(c.discount.kind);
  const minSubtotal = c.conditions?.minSubtotal ?? 0;
  const validity = validityLabel(c, t);

  return (
    <div
      className="rc-card"
      style={{
        background: C.surface,
        border: `1px solid ${item.joined ? `${accent}66` : C.border}`,
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 1px 2px rgba(17,20,40,.04)",
      }}
    >
      {/* Image / banner */}
      <div
        style={{
          height: 120,
          position: "relative",
          background: c.image
            ? `center/cover no-repeat url(${c.image})`
            : `linear-gradient(135deg, ${accent}, ${C.indigoSoft})`,
        }}
      >
        {item.joined && (
          <span
            style={{
              position: "absolute", top: 12, right: 12,
              background: "rgba(255,255,255,.92)", color: accent,
              fontSize: 11.5, fontWeight: 800, padding: "5px 10px",
              borderRadius: 999, letterSpacing: "0.02em",
              boxShadow: "0 2px 8px rgba(17,20,40,.16)",
            }}
          >
            ✓ {t("Katıldınız")}
          </span>
        )}
        <span
          style={{
            position: "absolute", bottom: 12, left: 12,
            background: "rgba(255,255,255,.92)", color: accent,
            fontSize: 13, fontWeight: 800, padding: "6px 12px",
            borderRadius: 10, boxShadow: "0 2px 8px rgba(17,20,40,.16)",
          }}
        >
          {discountSummary(c, t)}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ color: C.text, fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>
          {c.title}
        </div>
        {c.description && (
          <div
            style={{
              color: C.muted, fontSize: 13, marginTop: 6, lineHeight: 1.5,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {c.description}
          </div>
        )}

        {/* Conditions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {minSubtotal > 0 && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: C.surfaceAlt, color: C.muted, fontSize: 12, fontWeight: 600,
                padding: "5px 10px", borderRadius: 8,
              }}
            >
              🛒 {t("Min")} {money(minSubtotal)}
            </span>
          )}
          {validity && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: C.surfaceAlt, color: C.muted, fontSize: 12, fontWeight: 600,
                padding: "5px 10px", borderRadius: 8,
              }}
            >
              📅 {validity}
            </span>
          )}
        </div>

        {/* Toggle */}
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="rc-toggle"
          style={{
            marginTop: 18,
            padding: "11px 16px",
            borderRadius: 11,
            border: item.joined ? `1px solid ${C.border}` : "none",
            cursor: busy ? "default" : "pointer",
            fontSize: 13.5,
            fontWeight: 700,
            opacity: busy ? 0.6 : 1,
            background: item.joined ? "transparent" : `linear-gradient(135deg, ${accent}, ${C.indigoSoft})`,
            color: item.joined ? C.red : "#fff",
            boxShadow: item.joined ? "none" : `0 6px 16px ${accent}33`,
            transition: "transform .15s ease, box-shadow .15s ease",
          }}
        >
          {busy ? t("...") : item.joined ? t("Ayrıl") : t("Katıl")}
        </button>
      </div>
    </div>
  );
}

export function RestaurantCampaignsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  // ✅ Active restaurant id resolved at layout level, with legacy/membership fallback
  const { restaurantId: layoutRestaurantId } = useRestaurantDesktopCurrency();
  const user = authStore.getUser() as any;
  const firstMembership: any = user?.restaurantMemberships?.[0] ?? null;
  const fallbackMembershipRestaurantId =
    firstMembership?.restaurant ?? firstMembership?.id ?? null;
  const rid =
    layoutRestaurantId ||
    asId(user?.restaurantId || fallbackMembershipRestaurantId) ||
    "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["restaurant-campaigns", rid],
    queryFn: () => listEligible(rid),
    enabled: !!rid,
  });

  const items = data ?? [];

  async function handleToggle(item: RestaurantEligibleCampaign) {
    if (!rid) return;
    const id = item.campaign._id;
    setBusyId(id);
    try {
      if (item.joined) await leave(rid, id);
      else await join(rid, id);
      showToast(item.joined ? t("Kampanyadan ayrıldınız") : t("Kampanyaya katıldınız"), "success");
      await qc.invalidateQueries({ queryKey: ["restaurant-campaigns", rid] });
    } catch {
      showToast(t("İşlem başarısız. Tekrar deneyin."), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <RestaurantDesktopLayout
      activeNav="campaigns"
      title={t("Kampanyalar")}
      subtitle={t("Restoranınız için uygun kampanyalara katılın")}
    >
      <style>{`
        @keyframes rcUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        .rc-card { animation: rcUp .5s cubic-bezier(.16,1,.3,1) both; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease }
        .rc-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(17,20,40,.10) }
        .rc-toggle:hover:not(:disabled) { transform: translateY(-1px) }
        .rc-skel { background: linear-gradient(90deg,#eef0f4 25%,#f7f8fb 50%,#eef0f4 75%); background-size: 200% 100%; animation: rcShimmer 1.3s infinite; border-radius: 16px }
        @keyframes rcShimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
      `}</style>

      <div style={{ padding: 24, minHeight: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <h2 style={{ color: C.text, margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {t("Kampanyalar")}
          </h2>
          <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 13 }}>
            {t("Restoranınız için uygun kampanyalara katılın")}
          </p>
        </div>

        {isError ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "60px 20px", textAlign: "center", color: C.red }}>
            {t("Kampanyalar yüklenemedi.")}
          </div>
        ) : isLoading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {[0, 1, 2].map((i) => <div key={i} className="rc-skel" style={{ height: 290 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div style={{ background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 16, padding: "72px 20px", textAlign: "center", boxShadow: "0 1px 2px rgba(17,20,40,.04)" }}>
            <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.7 }}>🎁</div>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 600 }}>{t("Uygun kampanya yok")}</div>
            <div style={{ color: C.faint, fontSize: 13.5, marginTop: 6 }}>
              {t("Şu an restoranınız için uygun bir kampanya bulunmuyor.")}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
            {items.map((item) => (
              <CampaignCard
                key={item.campaign._id}
                item={item}
                busy={busyId === item.campaign._id}
                onToggle={() => handleToggle(item)}
              />
            ))}
          </div>
        )}
      </div>
    </RestaurantDesktopLayout>
  );
}
