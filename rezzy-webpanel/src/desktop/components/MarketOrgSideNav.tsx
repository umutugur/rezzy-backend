import React from "react";
import { useI18n } from "../../i18n";
import { authStore } from "../../store/auth";

export type MarketOrgNavKey = "dashboard" | "catalog" | "branches" | "branch-requests" | "reports" | "settings";

interface Props {
  active: MarketOrgNavKey;
  onNavigate: (key: MarketOrgNavKey) => void;
}

interface NavItem {
  key: MarketOrgNavKey;
  icon: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const MarketOrgSideNav: React.FC<Props> = ({ active, onNavigate }) => {
  const { t } = useI18n();

  const groups: NavGroup[] = [
    {
      label: t("Genel"),
      items: [
        { key: "dashboard", icon: "📊", label: t("Genel Bakış") },
        { key: "catalog", icon: "🏷️", label: t("Ürün Kataloğu") },
      ],
    },
    {
      label: t("Zincir"),
      items: [
        { key: "branches", icon: "🏪", label: t("Şubeler") },
        { key: "branch-requests", icon: "📨", label: t("Yeni Şube Talebi") },
        { key: "reports", icon: "📈", label: t("Raporlar") },
      ],
    },
    {
      label: t("Sistem"),
      items: [
        { key: "settings", icon: "⚙️", label: t("Ayarlar") },
      ],
    },
  ];

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
        {groups.map((group, gi) => (
          <div key={group.label} style={{ marginTop: gi > 0 ? 10 : 0 }}>
            <div className="rezvix-sidenav__group-label">{group.label}</div>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className={
                  "rezvix-sidenav__item" +
                  (active === item.key ? " rezvix-sidenav__item--active" : "")
                }
                onClick={() => onNavigate(item.key)}
              >
                <div className="rezvix-sidenav__icon">{item.icon}</div>
                <div className="rezvix-sidenav__label">
                  <span>{item.label}</span>
                </div>
              </button>
            ))}
          </div>
        ))}
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
