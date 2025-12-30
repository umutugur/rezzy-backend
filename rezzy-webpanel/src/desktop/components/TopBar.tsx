// src/desktop/components/TopBar.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { authStore, type MeUser } from "../../store/auth";
import { useRestaurantDesktopCurrency } from "../layouts/RestaurantDesktopLayout";

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

function roleLabelFromUser(user: MeUser | null): string {
  if (!user) return "-";
  if (user.role === "admin") return "Admin";

  const orgOwner = user.organizations?.find((o) => o.role === "org_owner");
  if (orgOwner) return `Org Owner • ${orgOwner.name ?? "—"}`;

  const orgAdmin = user.organizations?.find((o) => o.role === "org_admin");
  if (orgAdmin) return `Org Admin • ${orgAdmin.name ?? "—"}`;

  const locManager = user.restaurantMemberships?.find((m) => m.role === "location_manager");
  if (locManager) return `Lokasyon Müdürü • ${locManager.name ?? "—"}`;

  const staff = user.restaurantMemberships?.find((m) => m.role === "staff");
  if (staff) return `Personel • ${staff.name ?? "—"}`;

  if (user.role === "restaurant") return "Restaurant Kullanıcısı";
  return user.role;
}

function preserveModeDesktopLoginPath() {
  // Desktop mode detection (hash ya da search)
  const search = window.location.search || window.location.hash.split("?")[1] || "";
  const sp = new URLSearchParams(search);
  const isDesktopMode = sp.get("mode") === "desktop";
  return isDesktopMode ? "/login?mode=desktop" : "/login";
}

export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, summaryChips }) => {
  const nav = useNavigate();
  const { currencySymbol } = useRestaurantDesktopCurrency();

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
        { label: "Bugün kişi", value: `${todaySummary.covers} kişi`, tone: "success" },
        { label: "Toplam hesap", value: `${todaySummary.total} ${currencySymbol}`, tone: "warning" },
        { label: "Rezvix oranı", value: `%${todaySummary.rezvixRate}`, tone: "danger" },
      ];

  const dotClass = (tone?: SummaryChipTone) => {
    if (tone === "warning") return "rezvix-chip__dot rezvix-chip__dot--warning";
    if (tone === "danger") return "rezvix-chip__dot rezvix-chip__dot--danger";
    return "rezvix-chip__dot";
  };

  const userInitials = initialsFromName(user?.name);
  const userName = user?.name ?? "—";
  const userRole = roleLabelFromUser(user);

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
            title="Çıkış"
          >
            Çıkış
          </button>
        </div>
      </div>
    </header>
  );
};