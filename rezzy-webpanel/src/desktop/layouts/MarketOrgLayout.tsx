import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MarketOrgSideNav, type MarketOrgNavKey } from "../components/MarketOrgSideNav";

const ROUTE_MAP: Record<MarketOrgNavKey, string> = {
  catalog: "/market-org/catalog",
  branches: "/market-org/branches",
};

function resolveActiveKey(pathname: string): MarketOrgNavKey {
  if (pathname.includes("branches")) return "branches";
  return "catalog";
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
