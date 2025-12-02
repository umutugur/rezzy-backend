import React, { PropsWithChildren, useEffect, useState } from "react";
import "../styles/desktop.css";
import { TopBar, SummaryChip } from "../components/TopBar";
import { SideNav, DesktopNavKey } from "../components/SideNav";
import {
  DesktopThemeKey,
  getInitialDesktopTheme,
} from "../theme";
import { useNavigate } from "react-router-dom";

export type RestaurantDesktopLayoutProps = PropsWithChildren<{
  activeNav: DesktopNavKey;
  title: string;
  summaryChips?: SummaryChip[];
  subtitle?: string;
}>;

export const RestaurantDesktopLayout: React.FC<RestaurantDesktopLayoutProps> = ({
  activeNav,
  title,
  subtitle,
  summaryChips,
  children,
}) => {
  const [theme, setTheme] = useState<DesktopThemeKey>(() =>
    getInitialDesktopTheme()
  );

  const navigate = useNavigate();

  // SideNav tıklamaları → router navigation
  const handleNavigate = (key: DesktopNavKey) => {
    switch (key) {
      case "tables":
        navigate("/restaurant-desktop/tables");
        break;
      case "kitchen":
        navigate("/restaurant-desktop/kitchen");
        break;
      case "rezvix":
        navigate("/restaurant-desktop/rezvix");
        break;
      case "reports":
        navigate("/restaurant-desktop/reports");
        break;
      case "settings":
        navigate("/restaurant-desktop/settings");
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const anyEvent = e as CustomEvent<{ theme?: DesktopThemeKey }>;
      const next = anyEvent.detail?.theme;
      if (next) setTheme(next);
    };
    window.addEventListener("rezvix-desktop-theme-changed", handler);
    return () =>
      window.removeEventListener("rezvix-desktop-theme-changed", handler);
  }, []);

  return (
    <div className={`rezvix-desktop-shell rezvix-theme-${theme}`}>
      <SideNav active={activeNav} onNavigate={handleNavigate} />
      <div className="rezvix-desktop-main">
        <TopBar
          title={title}
          subtitle={subtitle}
          summaryChips={summaryChips}
        />
        <section className="rezvix-desktop-content">{children}</section>
      </div>
    </div>
  );
};