import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import { marketGetReports } from "../../api/marketDesktop";
import { useI18n } from "../../i18n";

// ── Light palette (matches rezvix --rezvix-* light theme) ──────────────────
const C = {
  bg: "#f4f4f7", surface: "#ffffff", surfaceAlt: "#f1f3f9",
  border: "#e6e8ef", borderSoft: "#eef0f4",
  indigo: "#4f46e5", indigoSoft: "#6366f1",
  green: "#16a34a", greenSoft: "#22c55e",
  red: "#dc2626", redSoft: "#ef4444",
  amber: "#d97706", amberSoft: "#f59e0b",
  cyan: "#0891b2", text: "#1b1c22", muted: "#5b6172", faint: "#9aa1b1",
};

const STATUS = {
  pending:   { label: "Bekliyor",     color: "#94a3b8" },
  confirmed: { label: "Onaylandı",    color: "#6366f1" },
  preparing: { label: "Hazırlanıyor", color: "#0891b2" },
  ready:     { label: "Hazır",        color: "#d97706" },
  delivered: { label: "Teslim",       color: "#16a34a" },
  cancelled: { label: "İptal",        color: "#dc2626" },
} as Record<string, { label: string; color: string }>;

const PAYMENT = {
  cash:   { label: "Nakit",  color: "#16a34a" },
  card:   { label: "Kart",   color: "#4f46e5" },
  online: { label: "Online", color: "#0891b2" },
} as Record<string, { label: string; color: string }>;

const TYPE = {
  delivery: { label: "Teslimat", color: "#4f46e5" },
  pickup:   { label: "Gel-Al",   color: "#16a34a" },
} as Record<string, { label: string; color: string }>;

// ── Helpers ────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const money = (n: number) => "₺" + (n ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const moneyFull = (n: number) => "₺" + (n ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Preset = "today" | "7d" | "30d" | "custom";

function presetRange(p: Preset): { from: string; to: string } {
  const today = new Date();
  if (p === "today") return { from: fmt(today), to: fmt(today) };
  if (p === "7d") return { from: fmt(addDays(today, -6)), to: fmt(today) };
  return { from: fmt(addDays(today, -29)), to: fmt(today) }; // 30d
}

// ── Light tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, money: asMoney }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#ffffff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 12px 28px rgba(17,20,40,.12)" }}>
      {label != null && <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text, marginTop: i ? 3 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color ?? p.fill }} />
          <span style={{ color: C.muted }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>
            {asMoney && (p.dataKey === "revenue") ? moneyFull(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function Kpi({ icon, label, value, accent, sub, delay }: {
  icon: string; label: string; value: string; accent: string; sub?: string; delay: number;
}) {
  return (
    <div className="rp-kpi" style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px",
      position: "relative", overflow: "hidden", animationDelay: `${delay}ms`, boxShadow: "0 1px 2px rgba(17,20,40,.04)",
    }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 90, height: 90, borderRadius: "50%", background: accent, opacity: 0.08 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${accent}1f`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{icon}</div>
        <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ color: C.text, fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: accent, fontSize: 12, fontWeight: 600, marginTop: 7 }}>{sub}</div>}
    </div>
  );
}

// ── Section card ─────────────────────────────────────────────────────────────
function Card({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, boxShadow: "0 1px 2px rgba(17,20,40,.04)", ...style }}>
      <div style={{ color: C.faint, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

export function MarketReportsPage() {
  const { t } = useI18n();
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState(presetRange("7d"));

  const range = preset === "custom" ? custom : presetRange(preset);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["market-reports", range.from, range.to],
    queryFn: () => marketGetReports(range.from, range.to),
  });

  // Gap-filled daily series for a continuous chart
  const series = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.timeseries.map(d => [d.date, d]));
    const out: { date: string; label: string; revenue: number; orders: number }[] = [];
    let cur = new Date(range.from + "T00:00:00");
    const end = new Date(range.to + "T00:00:00");
    let guard = 0;
    while (cur <= end && guard < 400) {
      const key = fmt(cur);
      const hit = map.get(key);
      out.push({ date: key, label: `${pad(cur.getDate())}.${pad(cur.getMonth() + 1)}`, revenue: hit?.revenue ?? 0, orders: hit?.orders ?? 0 });
      cur = addDays(cur, 1); guard++;
    }
    return out;
  }, [data, range.from, range.to]);

  const k = data?.kpis;
  const isEmpty = data && k && k.totalOrders === 0;

  const statusData = (data?.byStatus ?? []).map(s => ({ name: STATUS[s.status]?.label ?? s.status, value: s.count, color: STATUS[s.status]?.color ?? C.faint }));
  const paymentData = (data?.byPayment ?? []).map(p => ({ name: PAYMENT[p.method]?.label ?? p.method, value: p.count, revenue: p.revenue, color: PAYMENT[p.method]?.color ?? C.indigo }));
  const typeData = (data?.byType ?? []).map(ty => ({ name: TYPE[ty.type]?.label ?? ty.type, value: ty.count, revenue: ty.revenue, color: TYPE[ty.type]?.color ?? C.indigo }));

  const presetBtns: { key: Preset; label: string }[] = [
    { key: "today", label: t("Bugün") },
    { key: "7d", label: t("Son 7 gün") },
    { key: "30d", label: t("Son 30 gün") },
    { key: "custom", label: t("Özel") },
  ];

  return (
    <MarketDesktopLayout>
      <style>{`
        @keyframes rpUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        .rp-kpi { animation: rpUp .5s cubic-bezier(.16,1,.3,1) both; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease }
        .rp-sec { animation: rpUp .55s cubic-bezier(.16,1,.3,1) both }
        .rp-kpi:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(17,20,40,.10); border-color: #d7dbe6 }
        .rp-seg { transition: background .15s ease, color .15s ease }
        .rp-date { background: #ffffff; border: 1px solid #e6e8ef; color: #1b1c22; border-radius: 9px; padding: 8px 10px; font-size: 13px; outline: none; color-scheme: light }
        .rp-row:hover { background: #f5f6fa }
        .rp-skel { background: linear-gradient(90deg,#eef0f4 25%,#f7f8fb 50%,#eef0f4 75%); background-size: 200% 100%; animation: rpShimmer 1.3s infinite }
        @keyframes rpShimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
      `}</style>

      <div style={{ padding: 24, minHeight: "100%" }}>
        {/* Header + date range */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <h2 style={{ color: C.text, margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{t("Raporlar")}</h2>
            <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 13 }}>{t("Satış ve sipariş performansınız")}</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 11, padding: 3, boxShadow: "0 1px 2px rgba(17,20,40,.04)" }}>
              {presetBtns.map(b => {
                const on = preset === b.key;
                return (
                  <button key={b.key} className="rp-seg" onClick={() => setPreset(b.key)} style={{
                    padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                    background: on ? "linear-gradient(135deg,#4f46e5,#6366f1)" : "transparent",
                    color: on ? "#fff" : C.muted, boxShadow: on ? "0 4px 12px rgba(79,70,229,.28)" : "none",
                  }}>{b.label}</button>
                );
              })}
            </div>
            {preset === "custom" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="rp-date" type="date" value={custom.from} max={custom.to} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} />
                <span style={{ color: C.faint }}>—</span>
                <input className="rp-date" type="date" value={custom.to} min={custom.from} max={fmt(new Date())} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} />
              </div>
            )}
          </div>
        </div>

        {isError ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "60px 20px", textAlign: "center", color: C.red }}>
            {t("Rapor yüklenemedi.")}
          </div>
        ) : isLoading ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 18 }}>
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="rp-skel" style={{ height: 108, borderRadius: 16 }} />)}
            </div>
            <div className="rp-skel" style={{ height: 320, borderRadius: 16 }} />
          </div>
        ) : isEmpty ? (
          <div style={{ background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 16, padding: "72px 20px", textAlign: "center", boxShadow: "0 1px 2px rgba(17,20,40,.04)" }}>
            <div style={{ fontSize: 44, marginBottom: 12, opacity: .7 }}>📊</div>
            <div style={{ color: C.text, fontSize: 17, fontWeight: 600 }}>{t("Bu aralıkta veri yok")}</div>
            <div style={{ color: C.faint, fontSize: 13.5, marginTop: 6 }}>{t("Farklı bir tarih aralığı deneyin.")}</div>
          </div>
        ) : data && k ? (
          <>
            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
              <Kpi icon="💰" label={t("Gelir")} value={money(k.revenue)} accent={C.green} sub={`${k.itemsSold} ${t("ürün satıldı")}`} delay={0} />
              <Kpi icon="🧾" label={t("Sipariş")} value={String(k.deliveredOrders)} accent={C.indigo} sub={`${k.totalOrders} ${t("toplam")}`} delay={60} />
              <Kpi icon="🛒" label={t("Ortalama Sepet")} value={money(k.avgOrderValue)} accent={C.cyan} delay={120} />
              <Kpi icon="⏳" label={t("Bekleyen")} value={String(k.pendingOrders)} accent={C.amber} sub={t("devam eden")} delay={180} />
              <Kpi icon="✖️" label={t("İptal Oranı")} value={`%${(k.cancelRate * 100).toFixed(1)}`} accent={C.red} sub={`${k.cancelledOrders} ${t("iptal")}`} delay={240} />
            </div>

            {/* Revenue / orders area chart */}
            <div className="rp-sec" style={{ animationDelay: "120ms", marginBottom: 18 }}>
              <Card title={t("Gelir & Sipariş")}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rpRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.green} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={C.green} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="rpOrd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.indigo} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={C.indigo} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.faint }} axisLine={{ stroke: C.border }} tickLine={false} minTickGap={16} />
                    <YAxis yAxisId="rev" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => money(v)} />
                    <YAxis yAxisId="ord" orientation="right" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<ChartTooltip money />} />
                    <Area yAxisId="rev" type="monotone" dataKey="revenue" name={t("Gelir")} stroke={C.green} strokeWidth={2.5} fill="url(#rpRev)" />
                    <Area yAxisId="ord" type="monotone" dataKey="orders" name={t("Sipariş")} stroke={C.indigo} strokeWidth={2} fill="url(#rpOrd)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Breakdowns */}
            <div className="rp-sec" style={{ animationDelay: "200ms", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 18 }}>
              {/* Status donut */}
              <Card title={t("Durum Dağılımı")}>
                {statusData.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} stroke="none">
                          {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 6 }}>
                      {statusData.map((d, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />{d.name} <b style={{ color: C.text }}>{d.value}</b>
                        </span>
                      ))}
                    </div>
                  </>
                ) : <div style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: 30 }}>{t("Veri yok")}</div>}
              </Card>

              {/* Payment bars */}
              <Card title={t("Ödeme Yöntemi")}>
                {paymentData.length ? (
                  <ResponsiveContainer width="100%" height={232}>
                    <BarChart data={paymentData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.faint }} axisLine={{ stroke: C.border }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(79,70,229,.06)" }} />
                      <Bar dataKey="value" name={t("Sipariş")} radius={[6, 6, 0, 0]} maxBarSize={56}>
                        {paymentData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: 30 }}>{t("Veri yok")}</div>}
              </Card>

              {/* Type donut */}
              <Card title={t("Teslimat / Gel-Al")}>
                {typeData.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} stroke="none">
                          {typeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "6px 18px", marginTop: 6 }}>
                      {typeData.map((d, i) => (
                        <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.muted }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />{d.name} <b style={{ color: C.text }}>{d.value}</b>
                        </span>
                      ))}
                    </div>
                  </>
                ) : <div style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: 30 }}>{t("Veri yok")}</div>}
              </Card>
            </div>

            {/* Top products */}
            <div className="rp-sec" style={{ animationDelay: "280ms" }}>
              <Card title={t("En Çok Satan Ürünler")}>
                {data.topProducts.length ? (
                  <div>
                    {data.topProducts.map((p, i) => {
                      const max = data.topProducts[0].revenue || 1;
                      return (
                        <div key={i} className="rp-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 8px", borderRadius: 10, borderBottom: i < data.topProducts.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
                          <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, background: i < 3 ? `${C.indigo}18` : C.surfaceAlt, color: i < 3 ? C.indigo : C.faint, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: C.text, fontSize: 14, fontWeight: 600, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                            <div style={{ height: 5, borderRadius: 3, background: C.surfaceAlt, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.max(4, (p.revenue / max) * 100)}%`, background: "linear-gradient(90deg,#4f46e5,#16a34a)", borderRadius: 3 }} />
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ color: C.green, fontWeight: 700, fontSize: 14 }}>{money(p.revenue)}</div>
                            <div style={{ color: C.faint, fontSize: 11.5 }}>{p.qty} {t("adet")}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <div style={{ color: C.faint, fontSize: 13, textAlign: "center", padding: 30 }}>{t("Veri yok")}</div>}
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </MarketDesktopLayout>
  );
}
