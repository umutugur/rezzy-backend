import React from "react";

export type DesktopNavKey = "tables" | "kitchen" | "rezzy" | "reports" | "settings";

export type SideNavProps = {
  active: DesktopNavKey;
  onNavigate?: (key: DesktopNavKey) => void; // Router ile bağlarken kullanırsın
};

export const SideNav: React.FC<SideNavProps> = ({ active, onNavigate }) => {
  const handleClick = (key: DesktopNavKey) => {
    if (onNavigate) onNavigate(key);
    // Yoksa router içinde bu componenti wrap ederken kendi navigate'ini vereceksin.
  };

  return (
    <aside className="rezzy-sidenav">
      <div className="rezzy-sidenav__brand">
        <div className="rezzy-sidenav__logo">Rz</div>
        <div className="rezzy-sidenav__title">
          <span className="rezzy-sidenav__title-main">Rezzy</span>
          <span className="rezzy-sidenav__title-sub">Restaurant Desktop</span>
        </div>
      </div>

      <nav className="rezzy-sidenav__nav">
        <div>
          <div className="rezzy-sidenav__group-label">Servis</div>
          <button
            type="button"
            className={
              "rezzy-sidenav__item" + (active === "tables" ? " rezzy-sidenav__item--active" : "")
            }
            onClick={() => handleClick("tables")}
          >
            <div className="rezzy-sidenav__icon">🍽️</div>
            <div className="rezzy-sidenav__label">
              <span>Masalar</span>
              <span className="rezzy-sidenav__badge">Canlı</span>
            </div>
          </button>

          <button
            type="button"
            className={
              "rezzy-sidenav__item" + (active === "kitchen" ? " rezzy-sidenav__item--active" : "")
            }
            onClick={() => handleClick("kitchen")}
          >
            <div className="rezzy-sidenav__icon">👨‍🍳</div>
            <div className="rezzy-sidenav__label">
              <span>Mutfak</span>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="rezzy-sidenav__group-label">Rezzy</div>
          <button
            type="button"
            className={
              "rezzy-sidenav__item" + (active === "rezzy" ? " rezzy-sidenav__item--active" : "")
            }
            onClick={() => handleClick("rezzy")}
          >
            <div className="rezzy-sidenav__icon">📲</div>
            <div className="rezzy-sidenav__label">
              <span>Rezzy &amp; QR</span>
            </div>
          </button>

          <button
            type="button"
            className={
              "rezzy-sidenav__item" + (active === "reports" ? " rezzy-sidenav__item--active" : "")
            }
            onClick={() => handleClick("reports")}
          >
            <div className="rezzy-sidenav__icon">📊</div>
            <div className="rezzy-sidenav__label">
              <span>Raporlar</span>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="rezzy-sidenav__group-label">Sistem</div>
          <button
            type="button"
            className={
              "rezzy-sidenav__item" + (active === "settings" ? " rezzy-sidenav__item--active" : "")
            }
            onClick={() => handleClick("settings")}
          >
            <div className="rezzy-sidenav__icon">⚙️</div>
            <div className="rezzy-sidenav__label">
              <span>Ayarlar</span>
            </div>
          </button>
        </div>
      </nav>

      <div className="rezzy-sidenav__footer">
        <div className="rezzy-sidenav__footer-title">Servis Modu</div>
        <div className="rezzy-sidenav__footer-sub">
          Masa, mutfak ve Rezzy siparişlerini tek ekrandan yönetin.
        </div>
      </div>
    </aside>
  );
};