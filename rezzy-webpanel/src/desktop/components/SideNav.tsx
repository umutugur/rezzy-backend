import React from "react";
import { useI18n } from "../../i18n";

export type DesktopNavKey =
  | "tables"
  | "kitchen"
  | "rezvix"
  | "menu"
  | "reports"
  | "delivery"
  | "campaigns"
  | "settings";

export type SideNavProps = {
  active: DesktopNavKey;
  onNavigate?: (key: DesktopNavKey) => void; // Router ile bağlarken kullanırsın
  alerts?: Partial<Record<DesktopNavKey, boolean>>;
};

export const SideNav: React.FC<SideNavProps> = ({ active, onNavigate, alerts }) => {
  const { t } = useI18n();
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
          <span className="rezvix-sidenav__title-sub">{t("Restaurant Desktop")}</span>
        </div>
      </div>

      <nav className="rezvix-sidenav__nav">
        <div>
          <div className="rezvix-sidenav__group-label">{t("Servis")}</div>

          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (alerts?.tables ? " rezvix-sidenav__item--alert" : "") +
              (active === "tables" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("tables")}
          >
            <div className="rezvix-sidenav__icon">🍽️</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Masalar")}</span>
              <span className="rezvix-sidenav__badge">{t("Canlı")}</span>
              {alerts?.tables && (
                <span className="rezvix-sidenav__alert-badge">{t("Yeni")}</span>
              )}
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
              <span>{t("Mutfak")}</span>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">{t("Rezvix")}</div>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (alerts?.delivery ? " rezvix-sidenav__item--alert" : "") +
              (active === "delivery" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("delivery")}
          >
            <div className="rezvix-sidenav__icon">🛵</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Paket Sipariş")}</span>
              {alerts?.delivery && (
                <span className="rezvix-sidenav__alert-badge">{t("Yeni")}</span>
              )}
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
              <span>{t("Rezvix & QR")}</span>
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
              <span>{t("Menü Yönetimi")}</span>
            </div>
          </button>

          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "campaigns" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => handleClick("campaigns")}
          >
            <div className="rezvix-sidenav__icon">🎁</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Kampanyalar")}</span>
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
              <span>{t("Raporlar")}</span>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">{t("Sistem")}</div>

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
              <span>{t("Ayarlar")}</span>
            </div>
          </button>
        </div>
      </nav>

      <div className="rezvix-sidenav__footer">
        <div className="rezvix-sidenav__footer-title">{t("Servis Modu")}</div>
        <div className="rezvix-sidenav__footer-sub">
          {t("Masa, mutfak ve Rezvix siparişlerini tek ekrandan yönetin.")}
        </div>
      </div>
    </aside>
  );
};
