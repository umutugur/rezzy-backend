import React from "react";
import { useI18n } from "../../i18n";
import { authStore } from "../../store/auth";

export type AdminNavKey =
  | "dashboard"
  | "organizations"
  | "restaurants"
  | "markets"
  | "market-orders"
  | "market-collections"
  | "taxi-drivers"
  | "taxi-rides"
  | "taxi-config"
  | "delivery-orders"
  | "banners"
  | "notifications"
  | "commissions"
  | "users"
  | "reservations"
  | "moderation";

interface Props {
  active: AdminNavKey;
  onNavigate: (key: AdminNavKey) => void;
}

interface NavItem {
  key: AdminNavKey;
  icon: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const AdminSideNav: React.FC<Props> = ({ active, onNavigate }) => {
  const { t } = useI18n();

  const groups: NavGroup[] = [
    {
      label: t("Genel"),
      items: [
        { key: "dashboard", icon: "🏠", label: t("Dashboard") },
        { key: "organizations", icon: "🏢", label: t("Zincirler / Organizasyonlar") },
      ],
    },
    {
      label: t("Restoran"),
      items: [
        { key: "restaurants", icon: "🍽️", label: t("Restoranlar") },
      ],
    },
    {
      label: t("Market"),
      items: [
        { key: "markets", icon: "🛒", label: t("Marketler") },
        { key: "market-orders", icon: "📦", label: t("Market Siparişleri") },
        { key: "market-collections", icon: "🗂️", label: t("Market Koleksiyonları") },
      ],
    },
    {
      label: t("Taksi"),
      items: [
        { key: "taxi-drivers", icon: "🚗", label: t("Sürücü Başvuruları") },
        { key: "taxi-rides", icon: "🛣️", label: t("Taksi Yolculukları") },
        { key: "taxi-config", icon: "💰", label: t("Taksi Tarifeleri") },
      ],
    },
    {
      label: t("Paket Servis"),
      items: [
        { key: "delivery-orders", icon: "🛵", label: t("Paket Servis Siparişleri") },
      ],
    },
    {
      label: t("Pazarlama"),
      items: [
        { key: "banners", icon: "🖼️", label: t("Bannerlar") },
        { key: "notifications", icon: "🔔", label: t("Bildirim Gönder") },
        { key: "commissions", icon: "📊", label: t("Komisyonlar") },
      ],
    },
    {
      label: t("Sistem"),
      items: [
        { key: "users", icon: "👥", label: t("Kullanıcılar") },
        { key: "reservations", icon: "📅", label: t("Rezervasyonlar") },
        { key: "moderation", icon: "🛡️", label: t("Moderasyon") },
      ],
    },
  ];

  return (
    <aside className="rezvix-sidenav">
      <div className="rezvix-sidenav__brand">
        <div className="rezvix-sidenav__logo">⚙️</div>
        <div className="rezvix-sidenav__title">
          <span className="rezvix-sidenav__title-main">Rezvix</span>
          <span className="rezvix-sidenav__title-sub">{t("Admin Paneli")}</span>
        </div>
      </div>
      <nav className="rezvix-sidenav__nav" style={{ overflowY: "auto", flex: 1 }}>
        {groups.map((group, gi) => (
          <div key={group.label} style={gi > 0 ? { marginTop: 10 } : undefined}>
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
        <div className="rezvix-sidenav__footer-title">{t("Admin Paneli")}</div>
        <div className="rezvix-sidenav__footer-sub">
          {t("Tüm sistemi yönetin.")}
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
