// src/desktop/layouts/RestaurantDesktopLayout.tsx
import React, { PropsWithChildren } from "react";
import "../styles/desktop.css";
import { TopBar } from "../components/TopBar";
import { SideNav, DesktopNavKey } from "../components/SideNav";

export type RestaurantDesktopLayoutProps = PropsWithChildren<{
  /** Aktif sekme, route ile eşleştirebilirsin */
  activeNav: DesktopNavKey;
  /** Başlık ve alt başlık; her sayfa kendi başlığını verebilir */
  title: string;
  subtitle?: string;
}>;

export const RestaurantDesktopLayout: React.FC<RestaurantDesktopLayoutProps> = ({
  activeNav,
  title,
  subtitle,
  children,
}) => {
  return (
    <div className="rezzy-desktop-shell">
      <SideNav active={activeNav} />
      <div className="rezzy-desktop-main">
        <TopBar title={title} subtitle={subtitle} />
        <section className="rezzy-desktop-content">{children}</section>
      </div>
    </div>
  );
};