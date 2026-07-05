import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MarketSideNav, type MarketNavKey } from "../components/MarketSideNav";
import { fetchMyPanelStores, type MyPanelStore } from "../../api/marketDesktop";
import { setPanelStoreId } from "../../api/panelStore";
import { useI18n } from "../../i18n";

const ROUTE_MAP: Record<MarketNavKey, string> = {
  orders:           "/market-desktop/orders",
  products:         "/market-desktop/products",
  "chain-products": "/market-desktop/chain-products",
  campaigns:        "/market-desktop/campaigns",
  "promo-statement": "/market-desktop/promo-statement",
  reports:          "/market-desktop/reports",
  settings:         "/market-desktop/settings",
};

const PANEL_STORE_ID_KEY = "panelStoreId";

function resolveActiveKey(pathname: string): MarketNavKey {
  if (pathname.includes("chain-products")) return "chain-products";
  if (pathname.includes("products")) return "products";
  if (pathname.includes("promo-statement")) return "promo-statement";
  if (pathname.includes("campaigns")) return "campaigns";
  if (pathname.includes("reports")) return "reports";
  if (pathname.includes("settings")) return "settings";
  return "orders";
}

interface Props {
  children: React.ReactNode;
  alerts?: { orders?: boolean };
}

export const MarketDesktopLayout: React.FC<Props> = ({ children, alerts }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useI18n();
  const activeKey = resolveActiveKey(window.location.pathname);

  const { data: stores, isLoading } = useQuery({
    queryKey: ["market-panel", "my-stores"],
    queryFn: fetchMyPanelStores,
    staleTime: 60_000,
  });

  const [selectedStoreId, setSelectedStoreId] = React.useState<string | null>(null);
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (!stores || initializedRef.current) return;
    initializedRef.current = true;

    if (stores.length === 1) {
      const only = stores[0];
      setPanelStoreId(only._id);
      setSelectedStoreId(only._id);
      return;
    }

    if (stores.length > 1) {
      const persisted = localStorage.getItem(PANEL_STORE_ID_KEY);
      const restored = persisted && stores.some((s) => s._id === persisted) ? persisted : stores[0]._id;
      setPanelStoreId(restored);
      setSelectedStoreId(restored);
    }
  }, [stores]);

  const selectedStore: MyPanelStore | null =
    stores?.find((s) => s._id === selectedStoreId) ?? null;
  const isManager = selectedStore?.access === "manager";

  const handleStoreChange = (id: string) => {
    setSelectedStoreId(id);
    setPanelStoreId(id);
    localStorage.setItem(PANEL_STORE_ID_KEY, id);
    qc.invalidateQueries();

    // Manager erişimine geçiliyorsa ve Ayarlar sayfasındaysak sipariş sayfasına yönlendir
    const nextStore = stores?.find((s) => s._id === id);
    if (nextStore?.access === "manager" && window.location.pathname.includes("/market-desktop/settings")) {
      navigate("/market-desktop/orders", { replace: true });
    }
  };

  React.useEffect(() => {
    if (isManager && window.location.pathname.includes("/market-desktop/settings")) {
      navigate("/market-desktop/orders", { replace: true });
    }
  }, [isManager, navigate]);

  const handleNav = (key: MarketNavKey) => {
    if (key === "settings" && isManager) return;
    navigate(ROUTE_MAP[key]);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--rezvix-bg)" }}>
      <MarketSideNav
        active={activeKey}
        onNavigate={handleNav}
        alerts={alerts}
        hideSettings={isManager}
      />
      <main style={{ flex: 1, overflowY: "auto", padding: "0" }}>
        {!isLoading && stores && stores.length > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 24px",
              borderBottom: "1px solid var(--rezvix-border-subtle, #e5e7eb)",
              background: "var(--rezvix-bg-elevated, #fff)",
            }}
          >
            <span style={{ fontSize: 12.5, color: "var(--rezvix-text-muted, #64748b)", fontWeight: 600 }}>
              {t("Şube")}
            </span>
            <select
              value={selectedStoreId ?? ""}
              onChange={(e) => handleStoreChange(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1.5px solid var(--rezvix-border-strong, #cbd5e1)",
                fontSize: 13,
                fontWeight: 600,
                background: "var(--rezvix-bg-elevated, #fff)",
                color: "var(--rezvix-text-main, #0f172a)",
              }}
            >
              {stores.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                  {s.city ? ` (${s.city})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {children}
      </main>
    </div>
  );
};
