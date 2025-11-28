import React from "react";
import { RestaurantDesktopLayout } from "../layouts/RestaurantDesktopLayout";
import {
  DesktopThemeKey,
  getInitialDesktopTheme,
  setDesktopTheme,
} from "../theme";

type ThemeOption = {
  key: DesktopThemeKey;
  label: string;
  description: string;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    key: "rezzy-classic",
    label: "Rezzy Classic",
    description: "Rezzy’nin bordo kimliğiyle uyumlu, dengeli koyu tema.",
  },
  {
    key: "crystal-dark",
    label: "Crystal Dark",
    description: "Premium, hafif koyu ve cam efekti ağırlıklı görünüm.",
  },
  {
    key: "dark-latte",
    label: "Dark Latte",
    description: "Orta koyu, daha ferah ve uzun kullanımda daha rahat.",
  },
  {
    key: "deep-bronze",
    label: "Deep Bronze",
    description: "Sıcak altın tonlarıyla restoran ambiyansına uygun.",
  },
  {
    key: "light-pos",
    label: "Light POS",
    description: "iPad POS tarzı, açık ve yüksek kontrastlı görünüm.",
  },
];

export const SettingsPage: React.FC = () => {
  const [selected, setSelected] = React.useState<DesktopThemeKey>(() =>
    getInitialDesktopTheme()
  );

  const handleSelect = (key: DesktopThemeKey) => {
    setSelected(key);
    setDesktopTheme(key);
  };

  return (
    <RestaurantDesktopLayout
      activeNav="settings"
      title="Ayarlar"
      subtitle="Tema ve görünüm tercihlerinizi yönetin."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            Masaüstü Tema
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--rezzy-text-soft)",
            }}
          >
            Restoran personelinin kullandığı ekranın renk düzenini seçin. Seçiminiz
            sadece bu bilgisayarda geçerli olacaktır.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {THEME_OPTIONS.map((opt) => {
            const isActive = opt.key === selected;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSelect(opt.key)}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  padding: 12,
                  border: isActive
                    ? "1px solid var(--rezzy-primary-strong)"
                    : "1px solid var(--rezzy-border-subtle)",
                  background: isActive
                    ? "radial-gradient(circle at top left, var(--rezzy-primary-soft), transparent 60%), rgba(0,0,0,0.55)"
                    : "rgba(0,0,0,0.45)",
                  boxShadow: isActive
                    ? "0 14px 32px rgba(0,0,0,0.7)"
                    : "0 8px 20px rgba(0,0,0,0.45)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {opt.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--rezzy-text-soft)",
                    marginBottom: 8,
                  }}
                >
                  {opt.description}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: isActive
                      ? "var(--rezzy-accent)"
                      : "var(--rezzy-text-muted)",
                  }}
                >
                  {isActive ? "Seçili tema" : "Temayı uygula"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </RestaurantDesktopLayout>
  );
};