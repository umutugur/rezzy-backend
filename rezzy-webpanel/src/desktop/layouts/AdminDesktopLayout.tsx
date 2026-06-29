import React from "react";
import { useNavigate } from "react-router-dom";
import { AdminSideNav, type AdminNavKey } from "../components/AdminSideNav";

const ROUTE_MAP: Record<AdminNavKey, string> = {
  dashboard:            "/admin",
  organizations:        "/admin/organizations",
  "branch-requests":    "/admin/branch-requests",
  restaurants:          "/admin/restaurants",
  markets:              "/admin/market/stores",
  "market-orders":      "/admin/market/orders",
  "market-collections": "/admin/market/collections",
  "taxi-drivers":       "/admin/taxi/drivers",
  "taxi-rides":         "/admin/taxi/rides",
  "taxi-config":        "/admin/taxi/config",
  "driver-applications":     "/admin/driver-applications",
  "driver-doc-requirements": "/admin/driver-doc-requirements",
  "vehicle-catalog":    "/admin/vehicle-catalog",
  "delivery-orders":    "/admin/delivery/orders",
  banners:              "/admin/banners",
  campaigns:            "/admin/campaigns",
  notifications:        "/admin/notifications",
  commissions:          "/admin/commissions",
  "promo-reports":      "/admin/promotions/report",
  users:                "/admin/users",
  reservations:         "/admin/reservations",
  moderation:           "/admin/moderation",
};

function resolveActiveKey(pathname: string): AdminNavKey {
  // Most-specific segments first to prevent prefix collisions

  // Market sub-routes (must come before generic /admin/market check)
  if (pathname.startsWith("/admin/market/orders"))      return "market-orders";
  if (pathname.startsWith("/admin/market/collections")) return "market-collections";
  if (pathname.startsWith("/admin/market/stores"))      return "markets";
  // Fallback for bare /admin/market
  if (pathname.startsWith("/admin/market"))             return "markets";

  // Taxi sub-routes
  if (pathname.startsWith("/admin/taxi/drivers"))       return "taxi-drivers";
  if (pathname.startsWith("/admin/taxi/rides"))         return "taxi-rides";
  if (pathname.startsWith("/admin/taxi/config"))        return "taxi-config";
  // Fallback for bare /admin/taxi
  if (pathname.startsWith("/admin/taxi"))               return "taxi-drivers";

  // Delivery
  if (pathname.startsWith("/admin/delivery/orders"))    return "delivery-orders";
  if (pathname.startsWith("/admin/delivery"))           return "delivery-orders";

  // Sürücü başvuru sistemi
  if (pathname.startsWith("/admin/driver-doc-requirements")) return "driver-doc-requirements";
  if (pathname.startsWith("/admin/driver-applications"))     return "driver-applications";
  if (pathname.startsWith("/admin/vehicle-catalog"))         return "vehicle-catalog";

  // Top-level admin routes
  if (pathname.startsWith("/admin/branch-requests"))    return "branch-requests";
  if (pathname.startsWith("/admin/organizations"))      return "organizations";
  if (pathname.startsWith("/admin/restaurants"))        return "restaurants";
  if (pathname.startsWith("/admin/banners"))            return "banners";
  if (pathname.startsWith("/admin/campaigns"))          return "campaigns";
  if (pathname.startsWith("/admin/notifications"))      return "notifications";
  if (pathname.startsWith("/admin/promotions/report"))  return "promo-reports";
  if (pathname.startsWith("/admin/commissions"))        return "commissions";
  if (pathname.startsWith("/admin/users"))              return "users";
  if (pathname.startsWith("/admin/reservations"))       return "reservations";
  if (pathname.startsWith("/admin/moderation"))         return "moderation";

  // Exact dashboard match
  return "dashboard";
}

interface Props {
  children: React.ReactNode;
}

export const AdminDesktopLayout: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const activeKey = resolveActiveKey(window.location.pathname);

  const handleNav = (key: AdminNavKey) => {
    navigate(ROUTE_MAP[key]);
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--rezvix-bg)" }}>
      <AdminSideNav active={activeKey} onNavigate={handleNav} />
      <main style={{ flex: 1, overflowY: "auto" }}>
        {children}
      </main>
    </div>
  );
};
