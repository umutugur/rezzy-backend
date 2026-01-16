import React from "react";

export type DesktopNavKey =
  | "tables"
  | "kitchen"
  | "rezvix"
  | "menu"
  | "reports"
  | "delivery"
  | "settings";

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
    <aside className="rezvix-sidenav">
      <div className="rezvix-sidenav__brand">
        <div className="rezvix-sidenav__logo">Rz</div>
        <div className="rezvix-sidenav__title">
          <span className="rezvix-sidenav__title-main">Rezvix</span>
          <span className="rezvix-sidenav__title-sub">Restaurant Desktop</span>
        </div>
      </div>

      <nav className="rezvix-sidenav__nav">
        <div>
          <div className="rezvix-sidenav__group-label">Servis</div>

          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "tables" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("tables")}
          >
            <div className="rezvix-sidenav__icon">🍽️</div>
            <div className="rezvix-sidenav__label">
              <span>Masalar</span>
              <span className="rezvix-sidenav__badge">Canlı</span>
            </div>
          </button>

          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "kitchen" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("kitchen")}
          >
            <div className="rezvix-sidenav__icon">👨‍🍳</div>
            <div className="rezvix-sidenav__label">
              <span>Mutfak</span>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">Rezvix</div>
          <button
  type="button"
  className={
    "rezvix-sidenav__item" +
    (active === "delivery" ? " rezvix-sidenav__item--active" : "")
  }
  onClick={() => handleClick("delivery")}
>
  <div className="rezvix-sidenav__icon">🛵</div>
  <div className="rezvix-sidenav__label">
    <span>Paket Sipariş</span>
  </div>
</button>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "rezvix" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("rezvix")}
          >
            <div className="rezvix-sidenav__icon">📲</div>
            <div className="rezvix-sidenav__label">
              <span>Rezvix &amp; QR</span>
            </div>
          </button>

          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "menu" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("menu")}
          >
            <div className="rezvix-sidenav__icon">🧾</div>
            <div className="rezvix-sidenav__label">
              <span>Menü Yönetimi</span>
            </div>
          </button>

          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "reports" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("reports")}
          >
            <div className="rezvix-sidenav__icon">📊</div>
            <div className="rezvix-sidenav__label">
              <span>Raporlar</span>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">Sistem</div>

          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "settings" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("settings")}
          >
            <div className="rezvix-sidenav__icon">⚙️</div>
            <div className="rezvix-sidenav__label">
              <span>Ayarlar</span>
            </div>
          </button>
        </div>
      </nav>

      <div className="rezvix-sidenav__footer">
        <div className="rezvix-sidenav__footer-title">Servis Modu</div>
        <div className="rezvix-sidenav__footer-sub">
          Masa, mutfak ve Rezvix siparişlerini tek ekrandan yönetin.
        </div>
      </div>
    </aside>
  );
};