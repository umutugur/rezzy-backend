import React, { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MarketDesktopLayout } from "../layouts/MarketDesktopLayout";
import {
  marketGetOrders,
  marketUpdateOrderStatus,
  type MarketOrder,
  type MarketOrderStatus,
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

const STATUS_COLOR: Record<MarketOrderStatus, string> = {
  pending:   "#f59e0b",
  confirmed: "#3b82f6",
  preparing: "#8b5cf6",
  ready:     "#10b981",
  delivered: "#6b7280",
  cancelled: "#ef4444",
};

const STATUS_LABEL: Record<MarketOrderStatus, string> = {
  pending:   "Beklemede",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  ready:     "Hazır",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
};

export function MarketOrdersPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("active");
  const [ordersAlert, setOrdersAlert] = useState(false);
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    soundRef.current = new Audio("/sounds/notify.mp3");
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["market-orders"],
    queryFn: () => marketGetOrders({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const orders: MarketOrder[] = data?.items ?? [];

  // Detect new pending orders for alert
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

  const { mutate: updateStatus } = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MarketOrderStatus }) =>
      marketUpdateOrderStatus(id, status),
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
        <h2 style={{ color: "#fff", margin: "0 0 20px", fontSize: 22, fontWeight: 700 }}>
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
                  padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: isActive ? "#4f46e5" : "#1e2330",
                  color: isActive ? "#fff" : "#9ca3af",
                  fontWeight: isActive ? 700 : 400,
                  fontSize: 14,
                  position: "relative",
                }}
              >
                {labels[key]}
                {cnt > 0 && (
                  <span style={{
                    marginLeft: 6,
                    background: key === "active" && cnt > 0 ? "#ef4444" : "#374151",
                    color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 11,
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
          <div style={{ color: "#9ca3af" }}>{t("Yükleniyor…")}</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#6b7280", textAlign: "center", marginTop: 60, fontSize: 16 }}>
            {t("Bu kategoride sipariş yok.")}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {filtered.map(order => {
              const nextSt = NEXT_STATUS[order.status];
              const timeStr = new Date(order.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
              const dayStr = new Date(order.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
              return (
                <div key={order._id} style={{
                  background: "#1e2330", borderRadius: 12, overflow: "hidden",
                  border: order.status === "pending" ? "1.5px solid #f59e0b" : "1px solid #2d3348",
                }}>
                  {/* Card header */}
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #2d3348", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                        #{order._id.slice(-6).toUpperCase()}
                      </span>
                      <span style={{ color: "#6b7280", fontSize: 12, marginLeft: 8 }}>{dayStr} {timeStr}</span>
                    </div>
                    <span style={{
                      background: STATUS_COLOR[order.status] + "22",
                      color: STATUS_COLOR[order.status],
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>

                  {/* Items */}
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #2d3348" }}>
                    {order.items.slice(0, 3).map((item, i) => (
                      <div key={i} style={{ color: "#d1d5db", fontSize: 13, padding: "2px 0" }}>
                        {item.qty}x {item.title}
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        +{order.items.length - 3} {t("ürün daha")}
                      </div>
                    )}
                    {order.note && (
                      <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                        📝 {order.note}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: "#2d3348", color: "#9ca3af", borderRadius: 6, padding: "2px 8px", fontSize: 12 }}>
                        {order.type === "pickup" ? t("Gel-Al") : t("Teslimat")}
                      </span>
                      <span style={{ color: "#10b981", fontWeight: 700, fontSize: 15 }}>
                        ₺{order.total.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {order.status !== "delivered" && order.status !== "cancelled" && (
                        <button
                          onClick={() => updateStatus({ id: order._id, status: "cancelled" })}
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
                          {t(NEXT_LABEL[order.status] ?? "")}
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
    </MarketDesktopLayout>
  );
}
