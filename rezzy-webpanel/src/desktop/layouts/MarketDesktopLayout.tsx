import React from "react";
import { useNavigate } from "react-router-dom";
import { MarketSideNav, type MarketNavKey } from "../components/MarketSideNav";

const ROUTE_MAP: Record<MarketNavKey, string> = {
  orders:           "/market-desktop/orders",
  products:         "/market-desktop/products",
  "chain-products": "/market-desktop/chain-products",
  campaigns:        "/market-desktop/campaigns",
  "promo-statement": "/market-desktop/promo-statement",
  reports:          "/market-desktop/reports",
  settings:         "/market-desktop/settings",
};

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
  const activeKey = resolveActiveKey(window.location.pathname);

  const handleNav = (key: MarketNavKey) => {
    navigate(ROUTE_MAP[key]);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--rezvix-bg)" }}>
      <MarketSideNav active={activeKey} onNavigate={handleNav} alerts={alerts} />
      <main style={{ flex: 1, overflowY: "auto", padding: "0" }}>
        {children}
      </main>
    </div>
  );
};
