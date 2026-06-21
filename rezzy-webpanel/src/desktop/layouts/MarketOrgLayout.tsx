import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MarketOrgSideNav, type MarketOrgNavKey } from "../components/MarketOrgSideNav";

const ROUTE_MAP: Record<MarketOrgNavKey, string> = {
  dashboard: "/market-org",
  catalog: "/market-org/catalog",
  branches: "/market-org/branches",
  reports: "/market-org/reports",
  settings: "/market-org/settings",
};

function resolveActiveKey(pathname: string): MarketOrgNavKey {
  // Exact match for dashboard (root)
  if (pathname === "/market-org" || pathname === "/market-org/") return "dashboard";

  // Longest-match wins among the rest
  const candidates: Array<{ key: MarketOrgNavKey; path: string }> = [
    { key: "catalog", path: "/market-org/catalog" },
    { key: "branches", path: "/market-org/branches" },
    { key: "reports", path: "/market-org/reports" },
    { key: "settings", path: "/market-org/settings" },
  ];

  let best: MarketOrgNavKey = "dashboard";
  let bestLen = 0;
  for (const { key, path } of candidates) {
    if (pathname.startsWith(path) && path.length > bestLen) {
      best = key;
      bestLen = path.length;
    }
  }
  return best;
}

interface Props {
  children: React.ReactNode;
}

export const MarketOrgLayout: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = resolveActiveKey(location.pathname);

  const handleNav = (key: MarketOrgNavKey) => {
    navigate(ROUTE_MAP[key]);
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--rezvix-bg)",
      }}
    >
      <MarketOrgSideNav active={activeKey} onNavigate={handleNav} />
      <main style={{ flex: 1, overflowY: "auto", padding: "0" }}>
        {children}
      </main>
    </div>
  );
};
