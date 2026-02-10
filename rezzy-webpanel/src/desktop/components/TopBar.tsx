// src/desktop/components/TopBar.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { authStore, type MeUser } from "../../store/auth";
import { useRestaurantDesktopCurrency } from "../layouts/RestaurantDesktopLayout";
import { useI18n } from "../../i18n";

export type SummaryChipTone = "success" | "warning" | "danger" | "neutral";

export type SummaryChip = {
  label: string;
  value: string;
  tone?: SummaryChipTone;
};

export type TopBarProps = {
  title: string;
  subtitle?: string;
  summaryChips?: SummaryChip[];
};

function initialsFromName(name?: string | null) {
  const n = String(name ?? "").trim();
  if (!n) return "??";
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

function roleLabelFromUser(user: MeUser | null, t: (key: string, options?: any) => string): string {
  if (!user) return t("-");
  if (user.role === "admin") return t("Admin");

  const orgOwner = user.organizations?.find((o) => o.role === "org_owner");
  if (orgOwner) return t("Org Owner");

  const orgAdmin = user.organizations?.find((o) => o.role === "org_admin");
  if (orgAdmin) return t("Org Admin");

  const locManager = user.restaurantMemberships?.find((m) => m.role === "location_manager");
  if (locManager) return t("Lokasyon Müdürü");

  const staff = user.restaurantMemberships?.find((m) => m.role === "staff");
  if (staff) return t("Personel");

  if (user.role === "restaurant") return t("Restaurant Kullanıcısı");
  return user.role ? t(String(user.role)) : t("-");
}

function preserveModeDesktopLoginPath() {
  // Desktop mode detection (hash ya da search)
  const search = window.location.search || window.location.hash.split("?")[1] || "";
  const sp = new URLSearchParams(search);
  const isDesktopMode =
    sp.get("mode") === "desktop" || !!(window as any)?.rezvix;
  return isDesktopMode ? "/login?mode=desktop" : "/login";
}

export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, summaryChips }) => {
  const nav = useNavigate();
  const { currencySymbol } = useRestaurantDesktopCurrency();
  const { t } = useI18n();

  const [user, setUser] = React.useState<MeUser | null>(authStore.getUser());

  React.useEffect(() => {
    const onChange = () => setUser(authStore.getUser());
    window.addEventListener("auth:changed", onChange);
    return () => window.removeEventListener("auth:changed", onChange);
  }, []);

  // Eğer page summaryChips vermezse desktop için “currency-aware” mock
  const todaySummary = {
    covers: 86,
    total: "24.380",
    rezvixRate: 38,
  };

  const hasCustomSummary = summaryChips && summaryChips.length > 0;

  const chips: SummaryChip[] = hasCustomSummary
    ? summaryChips!
    : [
        { label: t("Bugün kişi"), value: `${todaySummary.covers} ${t("kişi")}`, tone: "success" },
        { label: t("Toplam hesap"), value: `${todaySummary.total} ${currencySymbol}`, tone: "warning" },
        { label: t("Rezvix oranı"), value: `%${todaySummary.rezvixRate}`, tone: "danger" },
      ];

  const dotClass = (tone?: SummaryChipTone) => {
    if (tone === "warning") return "rezvix-chip__dot rezvix-chip__dot--warning";
    if (tone === "danger") return "rezvix-chip__dot rezvix-chip__dot--danger";
    return "rezvix-chip__dot";
  };

  const userInitials = initialsFromName(user?.name);
  const userName = user?.name ?? t("—");
  const userRole = roleLabelFromUser(user, t);

  return (
    <header className="rezvix-topbar">
      <div className="rezvix-topbar__left">
        <h1 className="rezvix-topbar__title">{title}</h1>
        {subtitle && <p className="rezvix-topbar__subtitle">{subtitle}</p>}
      </div>

      <div className="rezvix-topbar__right">
        <div className="rezvix-topbar__summary">
          {chips.map((chip, idx) => (
            <div key={idx} className="rezvix-chip">
              <span className={dotClass(chip.tone)} />
              <span>{chip.label ? `${chip.label}: ${chip.value}` : chip.value}</span>
            </div>
          ))}
        </div>

        <div className="rezvix-topbar__user">
          <div className="rezvix-topbar__avatar">{userInitials}</div>

          <div className="rezvix-topbar__user-info">
            <span className="rezvix-topbar__user-name">{userName}</span>
            <span className="rezvix-topbar__user-role">{userRole}</span>
          </div>

          <button
            className="rezvix-topbar__logout"
            onClick={() => {
              authStore.logout();
              (nav as any)(preserveModeDesktopLoginPath(), { replace: true });
            }}
            title={t("Çıkış")}
          >
            {t("Çıkış")}
          </button>
        </div>
      </div>
    </header>
  );
};
