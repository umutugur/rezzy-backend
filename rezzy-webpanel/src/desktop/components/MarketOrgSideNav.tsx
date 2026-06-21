import React from "react";
import { useI18n } from "../../i18n";
import { authStore } from "../../store/auth";

export type MarketOrgNavKey = "catalog" | "branches";

interface Props {
  active: MarketOrgNavKey;
  onNavigate: (key: MarketOrgNavKey) => void;
}

export const MarketOrgSideNav: React.FC<Props> = ({ active, onNavigate }) => {
  const { t } = useI18n();

  return (
    <aside className="rezvix-sidenav">
      <div className="rezvix-sidenav__brand">
        <div className="rezvix-sidenav__logo">🏢</div>
        <div className="rezvix-sidenav__title">
          <span className="rezvix-sidenav__title-main">Rezvix</span>
          <span className="rezvix-sidenav__title-sub">{t("Zincir Paneli")}</span>
        </div>
      </div>

      <nav className="rezvix-sidenav__nav">
        <div>
          <div className="rezvix-sidenav__group-label">{t("Katalog")}</div>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "catalog" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("catalog")}
          >
            <div className="rezvix-sidenav__icon">🏷️</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Ürün Kataloğu")}</span>
            </div>
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">{t("Zincir")}</div>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "branches" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("branches")}
          >
            <div className="rezvix-sidenav__icon">🏪</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Şubeler")}</span>
            </div>
          </button>
        </div>
      </nav>

      <div className="rezvix-sidenav__footer">
        <div className="rezvix-sidenav__footer-title">{t("Zincir Paneli")}</div>
        <div className="rezvix-sidenav__footer-sub">
          {t("Master katalog ve şubeleri yönetin.")}
        </div>
        <button
          type="button"
          className="rezvix-topbar__logout"
          style={{ marginTop: 12, width: "100%" }}
          onClick={() => {
            authStore.logout();
            window.location.hash = "#/login";
          }}
          title={t("Çıkış")}
        >
          {t("Çıkış")}
        </button>
      </div>
    </aside>
  );
};
