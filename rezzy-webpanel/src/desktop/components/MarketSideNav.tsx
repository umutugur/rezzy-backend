import React from "react";
import { useI18n } from "../../i18n";
import { authStore } from "../../store/auth";

export type MarketNavKey = "orders" | "products" | "chain-products" | "campaigns" | "promo-statement" | "reports" | "settings";

interface Props {
  active: MarketNavKey;
  onNavigate: (key: MarketNavKey) => void;
  alerts?: { orders?: boolean };
}

export const MarketSideNav: React.FC<Props> = ({ active, onNavigate, alerts }) => {
  const { t } = useI18n();
  return (
    <aside className="rezvix-sidenav">
      <div className="rezvix-sidenav__brand">
        <div className="rezvix-sidenav__logo">🛒</div>
        <div className="rezvix-sidenav__title">
          <span className="rezvix-sidenav__title-main">Rezvix</span>
          <span className="rezvix-sidenav__title-sub">{t("Market Paneli")}</span>
        </div>
      </div>
      <nav className="rezvix-sidenav__nav">
        <div>
          <div className="rezvix-sidenav__group-label">{t("Siparişler")}</div>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (alerts?.orders ? " rezvix-sidenav__item--alert" : "") +
              (active === "orders" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("orders")}
          >
            <div className="rezvix-sidenav__icon">📦</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Siparişler")}</span>
              {alerts?.orders && (
                <span className="rezvix-sidenav__alert-badge">{t("Yeni")}</span>
              )}
            </div>
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">{t("Katalog")}</div>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "products" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("products")}
          >
            <div className="rezvix-sidenav__icon">🏷️</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Ürünler")}</span>
            </div>
          </button>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "chain-products" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("chain-products")}
          >
            <div className="rezvix-sidenav__icon">🔗</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Zincir Ürünleri")}</span>
            </div>
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">{t("Pazarlama")}</div>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "campaigns" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("campaigns")}
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
              (active === "promo-statement" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("promo-statement")}
          >
            <div className="rezvix-sidenav__icon">🧾</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Kampanya Ekstresi")}</span>
            </div>
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="rezvix-sidenav__group-label">{t("Analiz")}</div>
          <button
            type="button"
            className={
              "rezvix-sidenav__item" +
              (active === "reports" ? " rezvix-sidenav__item--active" : "")
            }
            onClick={() => onNavigate("reports")}
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
            onClick={() => onNavigate("settings")}
          >
            <div className="rezvix-sidenav__icon">⚙️</div>
            <div className="rezvix-sidenav__label">
              <span>{t("Ayarlar")}</span>
            </div>
          </button>
        </div>
      </nav>
      <div className="rezvix-sidenav__footer">
        <div className="rezvix-sidenav__footer-title">{t("Market Paneli")}</div>
        <div className="rezvix-sidenav__footer-sub">
          {t("Sipariş ve ürünleri yönetin.")}
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
