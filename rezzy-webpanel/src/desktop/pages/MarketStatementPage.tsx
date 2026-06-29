import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import { getStatement, type MarketStatement } from "../../api/marketCampaigns";
import { useI18n } from "../../i18n";

// ── Light palette (matches MarketReportsPage / rezvix --rezvix-* light theme) ──
const C = {
  bg: "#f4f4f7", surface: "#ffffff", surfaceAlt: "#f1f3f9",
  border: "#e6e8ef", borderSoft: "#eef0f4",
  indigo: "#4f46e5", indigoSoft: "#6366f1",
  green: "#16a34a", greenSoft: "#22c55e",
  red: "#dc2626", redSoft: "#ef4444",
  amber: "#d97706", amberSoft: "#f59e0b",
  cyan: "#0891b2", text: "#1b1c22", muted: "#5b6172", faint: "#9aa1b1",
};

// ── Helpers ────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const money = (n: number) => "₺" + (n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Preset = "today" | "7d" | "30d" | "custom";

function presetRange(p: Preset): { from: string; to: string } {
  const today = new Date();
  if (p === "today") return { from: fmt(today), to: fmt(today) };
  if (p === "7d") return { from: fmt(addDays(today, -6)), to: fmt(today) };
  return { from: fmt(addDays(today, -29)), to: fmt(today) }; // 30d
}

// ── Breakdown line ───────────────────────────────────────────────────────────
function Line({
  icon, label, value, sign, accent, note, delay,
}: {
  icon: string; label: string; value: string;
  sign: "plus" | "minus" | "info"; accent: string; note?: string; delay: number;
}) {
  const prefix = sign === "minus" ? "−" : sign === "plus" ? "" : "";
  return (
    <div className="st-line" style={{
      display: "flex", alignItems: "center", gap: 14, padding: "16px 18px",
      borderBottom: `1px solid ${C.borderSoft}`, animationDelay: `${delay}ms`,
    }}>
      <div style={{
        width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: `${accent}18`,
        color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 14.5, fontWeight: 600 }}>{label}</div>
        {note && <div style={{ color: C.faint, fontSize: 12, marginTop: 2 }}>{note}</div>}
      </div>
      <div style={{
        flexShrink: 0, fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em",
        color: sign === "minus" ? C.red : sign === "info" ? C.muted : C.text,
        fontVariantNumeric: "tabular-nums",
      }}>{prefix}{value}</div>
    </div>
  );
}

export function MarketStatementPage() {
  const { t } = useI18n();
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState(presetRange("30d"));

  const range = preset === "custom" ? custom : presetRange(preset);

  const { data, isLoading, isError } = useQuery<MarketStatement>({
    queryKey: ["market-statement", range.from, range.to],
    queryFn: () => getStatement({ from: range.from, to: range.to }),
  });

  const presetBtns: { key: Preset; label: string }[] = [
    { key: "today", label: t("Bugün") },
    { key: "7d", label: t("Son 7 gün") },
    { key: "30d", label: t("Son 30 gün") },
    { key: "custom", label: t("Özel") },
  ];

  const isEmpty = data && data.count === 0 && data.gross === 0;

  return (
    <MarketDesktopLayout>
      <style>{`
        @keyframes stUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        .st-card { animation: stUp .5s cubic-bezier(.16,1,.3,1) both }
        .st-line { animation: stUp .5s cubic-bezier(.16,1,.3,1) both }
        .st-seg { transition: background .15s ease, color .15s ease }
        .st-date { background: #ffffff; border: 1px solid #e6e8ef; color: #1b1c22; border-radius: 9px; padding: 8px 10px; font-size: 13px; outline: none; color-scheme: light }
        .st-skel { background: linear-gradient(90deg,#eef0f4 25%,#f7f8fb 50%,#eef0f4 75%); background-size: 200% 100%; animation: stShimmer 1.3s infinite }
        @keyframes stShimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
      `}</style>

      <div style={{ padding: 24, minHeight: "100%" }}>
        {/* Header + date range */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: C.text, margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{t("Kampanya Ekstresi")}</h2>
            <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 13 }}>{t("Kampanyalı satışlarınızdan net hak edişiniz")}</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: 3, boxShadow: "0 1px 2px rgba(17,20,40,.04)" }}>
              {presetBtns.map(b => {
                const on = preset === b.key;
                return (
                  <button key={b.key} className="st-seg" onClick={() => setPreset(b.key)} style={{
                    padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                    background: on ? "linear-gradient(135deg,#4f46e5,#6366f1)" : "transparent",
                    color: on ? "#fff" : C.muted, boxShadow: on ? "0 4px 12px rgba(79,70,229,.28)" : "none",
                  }}>{b.label}</button>
                );
              })}
            </div>
            {preset === "custom" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="st-date" type="date" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
                <span style={{ color: C.faint }}>—</span>
                <input className="st-date" type="date" value={custom.to} min={custom.from} max={fmt(new Date())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
              </div>
            )}
          </div>
        </div>

        {isError ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "60px 20px", textAlign: "center", color: C.red }}>
            {t("Ekstre yüklenemedi.")}
          </div>
        ) : isLoading ? (
          <div style={{ maxWidth: 720 }}>
            <div className="st-skel" style={{ height: 320, borderRadius: 16, marginBottom: 14 }} />
            <div className="st-skel" style={{ height: 120, borderRadius: 16 }} />
          </div>
        ) : isEmpty ? (
          <div style={{ background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 16, padding: "72px 20px", textAlign: "center", boxShadow: "0 1px 2px rgba(17,20,40,.04)", maxWidth: 720 }}>
            <div style={{ fontSize: 44, marginBottom: 12, opacity: .7 }}>🧾</div>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 600 }}>{t("Bu aralıkta kampanyalı satış yok")}</div>
            <div style={{ color: C.faint, fontSize: 13.5, marginTop: 6 }}>{t("Farklı bir tarih aralığı deneyin.")}</div>
          </div>
        ) : data ? (
          <div style={{ maxWidth: 720 }}>
            {/* Breakdown card */}
            <div className="st-card" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(17,20,40,.04)", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ color: C.faint, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("Hak Ediş Dökümü")}</div>
                <div style={{ color: C.muted, fontSize: 12.5, fontWeight: 600 }}>{data.count} {t("sipariş")}</div>
              </div>

              <Line icon="💰" label={t("Brüt Satış")} value={money(data.gross)} sign="plus" accent={C.green}
                note={t("Kampanyalı siparişlerin toplam tutarı")} delay={0} />
              <Line icon="🧾" label={t("Komisyon")} value={money(data.commission)} sign="minus" accent={C.red}
                note={t("Platform hizmet komisyonu")} delay={60} />
              <Line icon="🎁" label={t("Kendi Kampanya Katkım")} value={money(data.businessContribution)} sign="minus" accent={C.amber}
                note={t("İndirimden sizin karşıladığınız pay")} delay={120} />
              <Line icon="🤝" label={t("Platformun Karşıladığı")} value={money(data.platformContribution)} sign="info" accent={C.cyan}
                note={t("Bilgi amaçlı — hak edişinizden düşülmez")} delay={180} />

              {/* Net entitlement — prominent */}
              <div className="st-card" style={{ animationDelay: "240ms", display: "flex", alignItems: "center", gap: 16, padding: "20px 18px", background: "linear-gradient(135deg,rgba(22,163,74,.07),rgba(34,197,94,.04))" }}>
                <div style={{
                  width: 44, height: 44, flexShrink: 0, borderRadius: 13, background: `${C.green}22`,
                  color: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>✅</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>{t("Net Hak Ediş")}</div>
                  <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{t("Brüt − Komisyon − Kendi Katkınız")}</div>
                </div>
                <div style={{ flexShrink: 0, color: C.green, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {money(data.netEntitlement)}
                </div>
              </div>
            </div>

            {/* Manual transfer note */}
            <div className="st-card" style={{ animationDelay: "300ms", display: "flex", gap: 12, alignItems: "flex-start", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 17, lineHeight: "20px" }}>ℹ️</div>
              <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
                {t("Net hak edişiniz platform tarafından manuel olarak hesabınıza aktarılır. Ödemeler bu ekranda gösterilen tutarlar üzerinden yapılır.")}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </MarketDesktopLayout>
  );
}
