// desktop/layouts/RestaurantDesktopLayout.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { SideNav, DesktopNavKey } from "../components/SideNav";

type SummaryChipTone = "success" | "danger" | "warning" | "neutral";

type SummaryChip = {
  label: string;
  value: string;
  tone?: SummaryChipTone;
};

type Props = {
  activeNav: DesktopNavKey;
  title: string;
  subtitle?: string;
  summaryChips?: SummaryChip[];
  children: React.ReactNode;
};

export const RestaurantDesktopLayout: React.FC<Props> = ({
  activeNav,
  title,
  subtitle,
  summaryChips,
  children,
}) => {
  const navigate = useNavigate();

  const handleNavigate = (key: DesktopNavKey) => {
    switch (key) {
      case "tables":
        navigate("/restaurant-desktop/tables");
        break;
      case "kitchen":
        navigate("/restaurant-desktop/kitchen");
        break;
      case "rezzy":
        navigate("/restaurant-desktop/rezzy");
        break;
      case "reports":
        navigate("/restaurant-desktop/reports");
        break;
      case "settings":
        navigate("/restaurant-desktop/settings");
        break;
      default:
        navigate("/restaurant-desktop/tables");
    }
  };

  return (
    <div className="rezzy-desktop">
      {/* Sol taraf: SideNav */}
      <SideNav active={activeNav} onNavigate={handleNavigate} />

      {/* Sağ taraf: içerik */}
      <div className="rezzy-desktop__main">
        <header className="rezzy-desktop__header">
          <div>
            <h1 className="rezzy-desktop__title">{title}</h1>
            {subtitle && (
              <p className="rezzy-desktop__subtitle">{subtitle}</p>
            )}
          </div>

          {summaryChips && summaryChips.length > 0 && (
            <div className="rezzy-desktop__summary">
              {summaryChips.map((chip) => (
                <div
                  key={chip.label}
                  className={
                    "rezzy-desktop__summary-chip " +
                    (chip.tone ? `rezzy-desktop__summary-chip--${chip.tone}` : "")
                  }
                >
                  <div className="rezzy-desktop__summary-label">
                    {chip.label}
                  </div>
                  <div className="rezzy-desktop__summary-value">
                    {chip.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </header>

        <main className="rezzy-desktop__content">{children}</main>
      </div>
    </div>
  );
};