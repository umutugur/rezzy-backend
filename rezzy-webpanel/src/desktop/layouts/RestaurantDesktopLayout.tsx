import React, { PropsWithChildren, useEffect, useState } from "react";
import "../styles/desktop.css";
import { TopBar } from "../components/TopBar";
import { SideNav, DesktopNavKey } from "../components/SideNav";
import {
  DesktopThemeKey,
  getInitialDesktopTheme,
} from "../theme";

export type RestaurantDesktopLayoutProps = PropsWithChildren<{
  activeNav: DesktopNavKey;
  title: string;
  subtitle?: string;
}>;

export const RestaurantDesktopLayout: React.FC<RestaurantDesktopLayoutProps> = ({
  activeNav,
  title,
  subtitle,
  children,
}) => {
  const [theme, setTheme] = useState<DesktopThemeKey>(() =>
    getInitialDesktopTheme()
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const anyEvent = e as CustomEvent<{ theme?: DesktopThemeKey }>;
      const next = anyEvent.detail?.theme;
      if (next) setTheme(next);
    };
    window.addEventListener("rezzy-desktop-theme-changed", handler);
    return () => window.removeEventListener("rezzy-desktop-theme-changed", handler);
  }, []);

  return (
    <div className={`rezzy-desktop-shell rezzy-theme-${theme}`}>
      <SideNav active={activeNav} />
      <div className="rezzy-desktop-main">
        <TopBar title={title} subtitle={subtitle} />
        <section className="rezzy-desktop-content">{children}</section>
      </div>
    </div>
  );
};