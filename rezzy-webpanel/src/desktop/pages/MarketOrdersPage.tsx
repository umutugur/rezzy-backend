import React, { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import {
  marketGetOrders,
  marketUpdateOrderStatus,
  type MarketOrder,
  type MarketOrderStatus,
  type OutOfStockPreference,
} from "../../api/marketDesktop";
import { useI18n } from "../../i18n";
import { showToast } from "../../ui/Toast";

type TabKey = "active" | "ready" | "delivered" | "cancelled";

const TAB_STATUSES: Record<TabKey, MarketOrderStatus[]> = {
  active:    ["pending", "confirmed", "preparing"],
  ready:     ["ready"],
  delivered: ["delivered"],
  cancelled: ["cancelled"],
};

const NEXT_STATUS: Partial<Record<MarketOrderStatus, MarketOrderStatus>> = {
  pending:   "confirmed",
  confirmed: "preparing",
  preparing: "ready",
  ready:     "delivered",
};

const NEXT_LABEL: Partial<Record<MarketOrderStatus, string>> = {
  pending:   "Onayla",
  confirmed: "Hazırlamaya Başla",
  preparing: "Hazır",
  ready:     "Teslim Edildi",
};

const STATUS_COLOR: Record<MarketOrderStatus, { bg: string; text: string }> = {
  pending:   { bg: "rgba(217,154,61,0.14)",  text: "#e8b56a" },
  confirmed: { bg: "rgba(107,155,195,0.14)", text: "#9cc0de" },
  preparing: { bg: "rgba(150,120,200,0.14)", text: "#c4a8e8" },
  ready:     { bg: "rgba(111,174,106,0.14)", text: "#9fd49a" },
  delivered: { bg: "rgba(181,168,150,0.12)", text: "var(--rezvix-text-muted)" },
  cancelled: { bg: "rgba(212,91,91,0.14)",   text: "#e89a9a" },
};

const STATUS_LABEL: Record<MarketOrderStatus, string> = {
  pending:   "Beklemede",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  ready:     "Hazır",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
};

const OUT_OF_STOCK_LABEL: Record<OutOfStockPreference, string> = {
  substitute: "Benzer ürün gönder",
  remove:     "O ürünü gönderme",
  call:       "Beni arayın",
};

const OUT_OF_STOCK_COLOR: Record<OutOfStockPreference, { bg: string; text: string; border: string }> = {
  substitute: { bg: "rgba(107,155,195,0.14)", text: "#9cc0de", border: "rgba(107,155,195,0.32)" },
  remove:     { bg: "rgba(212,91,91,0.14)",   text: "#e89a9a", border: "rgba(212,91,91,0.32)" },
  call:       { bg: "rgba(217,154,61,0.14)",  text: "#e8b56a", border: "rgba(217,154,61,0.32)" },
};

const CANCEL_REASONS = [
  { value: "out_of_stock",    label: "Ürün stokta yok" },
  { value: "closed",          label: "İşletme şu an kapalı" },
  { value: "out_of_zone",     label: "Adres teslimat bölgesi dışında" },
  { value: "cannot_fulfill",  label: "Sipariş karşılanamıyor" },
  { value: "other",           label: "Diğer" },
];

function cancelReasonLabel(value: string | null | undefined, t: (s: string) => string): string {
  if (!value) return "";
  if (value === "customer_request") return t("Müşteri iptali");
  const found = CANCEL_REASONS.find(r => r.value === value);
  return found ? t(found.label) : value;
}

export function MarketOrdersPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("active");
  const [ordersAlert, setOrdersAlert] = useState(false);
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = React.useState<string | null>(null);
  const [cancelReason, setCancelReason] = React.useState<string>("out_of_stock");

  useEffect(() => {
    soundRef.current = new Audio("/sounds/notify.mp3");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["market-orders"],
    queryFn: () => marketGetOrders({ limit: 100 }),
    refetchInterval: 10_000,
  });

  const orders: MarketOrder[] = data?.items ?? [];

  // Detect new pending orders for alert (legacy sound via notify.mp3)
  useEffect(() => {
    const pendingIds = new Set(
      orders.filter(o => o.status === "pending").map(o => o._id)
    );
    const hasNew = [...pendingIds].some(id => !prevIdsRef.current.has(id));
    if (hasNew && prevIdsRef.current.size > 0) {
      setOrdersAlert(true);
      soundRef.current?.play().catch(() => {});
    }
    prevIdsRef.current = pendingIds;
  }, [orders]);

  // New-order sound via order-come.mp3
  const knownPendingIds = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    const pending = orders.filter((o) => o.status === "pending").map((o) => String(o._id));
    if (knownPendingIds.current === null) {
      knownPendingIds.current = new Set(pending);
      return;
    }
    const hasNew = pending.some((id) => !knownPendingIds.current!.has(id));
    if (hasNew) {
      try {
        const audio = new Audio("/sounds/order-come.mp3");
        audio.volume = 0.9;
        audio.play().catch(() => {});
      } catch {}
    }
    knownPendingIds.current = new Set(pending);
  }, [orders]);

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: MarketOrderStatus; reason?: string }) =>
      marketUpdateOrderStatus(id, status, reason),
    onSuccess: (updated) => {
      qc.setQueryData(["market-orders"], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o: MarketOrder) =>
            o._id === updated._id ? updated : o
          ),
        };
      });
      showToast(t("Durum güncellendi"), "success");
      // Close modal if it was a cancel action
      setCancelTarget(null);
    },
    onError: () => showToast(t("Güncelleme başarısız"), "error"),
  });

  const filtered = orders.filter(o => TAB_STATUSES[tab].includes(o.status));

  const tabCounts: Record<TabKey, number> = {
    active:    orders.filter(o => TAB_STATUSES.active.includes(o.status)).length,
    ready:     orders.filter(o => o.status === "ready").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    cancelled: orders.filter(o => o.status === "cancelled").length,
  };

  return (
    <MarketDesktopLayout alerts={{ orders: ordersAlert }}>
      <div style={{ padding: "24px" }}>
        {/* Page title */}
        <h2 style={{ color: "var(--rezvix-text-main)", margin: "0 0 20px", fontSize: 22, fontWeight: 700, fontFamily: "var(--rezvix-font-display)" }}>
          {t("Siparişler")}
        </h2>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["active", "ready", "delivered", "cancelled"] as TabKey[]).map(key => {
            const labels: Record<TabKey, string> = {
              active: t("Aktif"),
              ready: t("Hazır"),
              delivered: t("Teslim"),
              cancelled: t("İptal"),
            };
            const isActive = tab === key;
            const cnt = tabCounts[key];
            return (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  if (key === "active") setOrdersAlert(false);
                }}
                style={{
                  padding: "8px 18px", borderRadius: 8, cursor: "pointer",
                  background: isActive ? "linear-gradient(180deg, var(--rezvix-primary-strong), var(--rezvix-primary))" : "var(--rezvix-bg-soft)",
                  color: isActive ? "#f7ecdd" : "var(--rezvix-text-muted)",
                  border: isActive ? "none" : "1px solid var(--rezvix-border-subtle)",
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 14,
                  position: "relative",
                }}
              >
                {labels[key]}
                {cnt > 0 && (
                  <span style={{
                    marginLeft: 6,
                    background: key === "active" && cnt > 0 ? "rgba(212,91,91,0.85)" : "var(--rezvix-bg-elevated)",
                    color: key === "active" && cnt > 0 ? "#fff" : "var(--rezvix-text-muted)", borderRadius: 999, padding: "1px 6px", fontSize: 11,
                  }}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Order list */}
        {isLoading ? (
          <div style={{ color: "var(--rezvix-text-muted)" }}>{t("Yükleniyor…")}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--rezvix-text-soft)", textAlign: "center", marginTop: 60, fontSize: 16 }}>
            {t("Bu kategoride sipariş yok.")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {filtered.map(order => {
              const nextSt = NEXT_STATUS[order.status];
              const timeStr = new Date(order.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
              const dayStr = new Date(order.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
              const isDelivery = order.type === "delivery";

              // Determine next-action button label
              let nextLabel = NEXT_LABEL[order.status] ?? "";
              if (order.status === "preparing" && isDelivery) {
                nextLabel = "Yola Çıktı";
              }

              // Determine status badge label
              let statusBadgeLabel = STATUS_LABEL[order.status];
              if (order.status === "ready" && isDelivery) {
                statusBadgeLabel = t("Yolda");
              } else {
                statusBadgeLabel = t(STATUS_LABEL[order.status]);
              }

              return (
                <div key={order._id} style={{
                  background: "var(--rezvix-bg-elevated)", borderRadius: 14, overflow: "hidden",
                  border: order.status === "pending" ? "1.5px solid var(--rezvix-accent)" : "1px solid var(--rezvix-border-subtle)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
                }}>
                  {/* Card header */}
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--rezvix-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: "var(--rezvix-text-main)", fontWeight: 700, fontSize: 15, fontFamily: "var(--rezvix-font-mono)" }}>
                        #{order._id.slice(-6).toUpperCase()}
                      </span>
                      <span style={{ color: "var(--rezvix-text-soft)", fontSize: 12, marginLeft: 8 }}>{dayStr} {timeStr}</span>
                    </div>
                    <span style={{
                      background: STATUS_COLOR[order.status].bg,
                      color: STATUS_COLOR[order.status].text,
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {statusBadgeLabel}
                    </span>
                  </div>

                  {/* Customer */}
                  {(order.customer?.name || order.customer?.phone) && (
                    <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--rezvix-border-subtle)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {order.customer?.name && (
                        <span style={{ color: "var(--rezvix-text-main)", fontSize: 13, fontWeight: 600 }}>
                          👤 {order.customer.name}
                        </span>
                      )}
                      {order.customer?.phone && (
                        <a href={`tel:${order.customer.phone}`} style={{ color: "var(--rezvix-primary)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                          📞 {order.customer.phone}
                        </a>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--rezvix-border-subtle)" }}>
                    {order.items.slice(0, 3).map((item, i) => (
                      <div key={i} style={{ color: "var(--rezvix-text-main)", fontSize: 13, padding: "2px 0" }}>
                        {item.qty}x {item.title}
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div style={{ color: "var(--rezvix-text-soft)", fontSize: 12 }}>
                        +{order.items.length - 3} {t("ürün daha")}
                      </div>
                    )}
                    {order.note && (
                      <div style={{ color: "var(--rezvix-text-muted)", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                        📝 {order.note}
                      </div>
                    )}
                    {order.outOfStockPreference && (
                      <div style={{ marginTop: 6 }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 700,
                            background: OUT_OF_STOCK_COLOR[order.outOfStockPreference].bg,
                            color: OUT_OF_STOCK_COLOR[order.outOfStockPreference].text,
                            border: `1px solid ${OUT_OF_STOCK_COLOR[order.outOfStockPreference].border}`,
                          }}
                        >
                          ⚠️ {t("Stokta yoksa")}: {t(OUT_OF_STOCK_LABEL[order.outOfStockPreference])}
                        </span>
                      </div>
                    )}
                    {order.status === "cancelled" && order.cancelReason && (
                      <div style={{ color: "var(--rezvix-danger)", fontSize: 12, marginTop: 6 }}>
                        <span style={{ fontWeight: 600 }}>{t("İptal nedeni")}: </span>
                        {cancelReasonLabel(order.cancelReason, t)}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: "var(--rezvix-bg-soft)", color: "var(--rezvix-text-muted)", border: "1px solid var(--rezvix-border-subtle)", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>
                        {order.type === "pickup" ? t("Gel-Al") : t("Teslimat")}
                      </span>
                      <span style={{ color: "#10b981", fontWeight: 700, fontSize: 15 }}>
                        ₺{order.total.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {order.status !== "delivered" && order.status !== "cancelled" && (
                        <button
                          onClick={() => setCancelTarget(order._id)}
                          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}
                        >
                          {t("İptal")}
                        </button>
                      )}
                      {nextSt && (
                        <button
                          onClick={() => updateStatus({ id: order._id, status: nextSt })}
                          style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#4f46e5", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                        >
                          {t(nextLabel)}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel reason modal */}
      {cancelTarget !== null && (
        <div
          className="modal-backdrop"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}
          onClick={() => setCancelTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--rezvix-bg-elevated)",
              borderRadius: 16,
              padding: "28px 28px 20px",
              width: 420,
              maxWidth: "90vw",
              boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
              border: "1px solid var(--rezvix-border-subtle)",
            }}
          >
            <h3 style={{ color: "var(--rezvix-text-main)", margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>
              {t("Siparişi İptal Et")}
            </h3>
            <p style={{ color: "var(--rezvix-text-muted)", margin: "0 0 18px", fontSize: 13 }}>
              {t("Müşteriye bildirilecek iptal nedenini seçin")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {CANCEL_REASONS.map(reason => {
                const selected = cancelReason === reason.value;
                return (
                  <div
                    key={reason.value}
                    onClick={() => setCancelReason(reason.value)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: selected ? "1.5px solid #ef4444" : "1px solid var(--rezvix-border-subtle)",
                      background: selected ? "rgba(239,68,68,0.08)" : "var(--rezvix-bg-soft)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "border-color 0.15s",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%",
                      border: selected ? "2px solid #ef4444" : "2px solid var(--rezvix-border-subtle)",
                      background: selected ? "#ef4444" : "transparent",
                      flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                    </div>
                    <span style={{ color: selected ? "#f87171" : "var(--rezvix-text-main)", fontSize: 14 }}>
                      {t(reason.label)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setCancelTarget(null)}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  border: "1px solid var(--rezvix-border-subtle)",
                  background: "transparent",
                  color: "var(--rezvix-text-muted)",
                  cursor: "pointer", fontSize: 14,
                }}
              >
                {t("Vazgeç")}
              </button>
              <button
                onClick={() => updateStatus({ id: cancelTarget, status: "cancelled", reason: cancelReason })}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}
              >
                {t("İptal Et")}
              </button>
            </div>
          </div>
        </div>
      )}
    </MarketDesktopLayout>
  );
}
