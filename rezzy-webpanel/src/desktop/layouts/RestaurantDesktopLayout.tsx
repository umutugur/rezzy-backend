import React, {
  PropsWithChildren,
  useEffect,
  useMemo,
  useState,
  createContext,
  useContext,
} from "react";
import "../styles/desktop.css";
import { TopBar, SummaryChip } from "../components/TopBar";
import { SideNav, DesktopNavKey } from "../components/SideNav";
import { DesktopThemeKey, getInitialDesktopTheme } from "../theme";
import { useNavigate } from "react-router-dom";

import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";
import { api } from "../../api/client";
import { getCurrencySymbolForRegion } from "../../utils/currency";

export type RestaurantDesktopLayoutProps = PropsWithChildren<{
  activeNav: DesktopNavKey;
  title: string;
  summaryChips?: SummaryChip[];
  subtitle?: string;
}>;

type CurrencyCtxValue = {
  /** Resolved from restaurant.region (preferred) or user/org fallback */
  region: string;
  /** Currency symbol derived from region */
  currencySymbol: string;
  /** Resolved restaurant id used for fetch */
  restaurantId: string;
  /** Whether restaurant.region fetch was attempted and finished */
  isRegionResolved: boolean;
};

const CurrencyCtx = createContext<CurrencyCtxValue | null>(null);

export function useRestaurantDesktopCurrency(): CurrencyCtxValue {
  const v = useContext(CurrencyCtx);
  if (!v) {
    // Fail fast: layout not mounted
    return {
      region: "TR",
      currencySymbol: getCurrencySymbolForRegion("TR"),
      restaurantId: "",
      isRegionResolved: false,
    };
  }
  return v;
}

function normRegion(input: any): string {
  const v = String(input ?? "").trim().toUpperCase();
  return v || "TR";
}

function resolveRidFromUser(user: any): string {
  const fallbackMembershipRestaurantId =
    user?.restaurantMemberships?.[0]?.id ?? null;
  return asId(user?.restaurantId || fallbackMembershipRestaurantId) || "";
}

/**
 * Resolve region priority:
 *  1) restaurant.region (authoritative for multi-country orgs)
 *  2) user.region
 *  3) active membership org region
 *  4) first org region
 *  5) TR
 */
function resolveFallbackRegionFromUser(user: any): string {
  const userRegion = String(user?.region ?? "").trim();

  const membershipOrgId =
    user?.restaurantMemberships?.[0]?.organizationId ??
    user?.organizations?.[0]?.id ??
    null;

  const membershipOrgRegion = membershipOrgId
    ? user?.organizations?.find(
        (o: any) => String(o?.id ?? "") === String(membershipOrgId)
      )?.region
    : null;

  return normRegion(
    userRegion || membershipOrgRegion || user?.organizations?.[0]?.region || "TR"
  );
}

export const RestaurantDesktopLayout: React.FC<RestaurantDesktopLayoutProps> = ({
  activeNav,
  title,
  subtitle,
  summaryChips,
  children,
}) => {
  const [theme, setTheme] = useState<DesktopThemeKey>(() =>
    getInitialDesktopTheme()
  );
  const navigate = useNavigate();

  // ---- Currency / region (layout-level) ----
  const user = authStore.getUser() as any;
  const rid = resolveRidFromUser(user);

  const [resolvedRegion, setResolvedRegion] = useState<string>(() =>
    resolveFallbackRegionFromUser(user)
  );
  const [isRegionResolved, setIsRegionResolved] = useState<boolean>(false);

  useEffect(() => {
    let alive = true;

    // No restaurant id -> fallback only
    if (!rid) {
      setResolvedRegion(resolveFallbackRegionFromUser(user));
      setIsRegionResolved(true);
      return () => {
        alive = false;
      };
    }

    // Try to fetch restaurant for authoritative region
    (async () => {
      try {
        const { data } = await api.get(`/restaurants/${rid}`);
        const rRegion = (data as any)?.region;
        if (!alive) return;
        if (rRegion) {
          setResolvedRegion(normRegion(rRegion));
        } else {
          setResolvedRegion(resolveFallbackRegionFromUser(user));
        }
      } catch {
        if (!alive) return;
        setResolvedRegion(resolveFallbackRegionFromUser(user));
      } finally {
        if (!alive) return;
        setIsRegionResolved(true);
      }
    })();

    return () => {
      alive = false;
    };
    // NOTE: user object is store-backed; rid is the stable signal here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  const currencySymbol = useMemo(() => {
    return getCurrencySymbolForRegion(normRegion(resolvedRegion));
  }, [resolvedRegion]);

  const currencyCtxValue = useMemo<CurrencyCtxValue>(() => {
    return {
      region: normRegion(resolvedRegion),
      currencySymbol,
      restaurantId: rid,
      isRegionResolved,
    };
  }, [resolvedRegion, currencySymbol, rid, isRegionResolved]);

  // SideNav tıklamaları → router navigation
  const handleNavigate = (key: DesktopNavKey) => {
    switch (key) {
      case "tables":
        navigate("/restaurant-desktop/tables");
        break;
      case "kitchen":
        navigate("/restaurant-desktop/kitchen");
        break;
      case "rezvix":
        navigate("/restaurant-desktop/rezvix");
        break;
        case "menu":
  navigate("/restaurant-desktop/menu");
  break;
      case "reports":
        navigate("/restaurant-desktop/reports");
        break;
      case "settings":
        navigate("/restaurant-desktop/settings");
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const anyEvent = e as CustomEvent<{ theme?: DesktopThemeKey }>;
      const next = anyEvent.detail?.theme;
      if (next) setTheme(next);
    };
    window.addEventListener("rezvix-desktop-theme-changed", handler);
    return () =>
      window.removeEventListener("rezvix-desktop-theme-changed", handler);
  }, []);

  return (
    <CurrencyCtx.Provider value={currencyCtxValue}>
      <div className={`rezvix-desktop-shell rezvix-theme-${theme}`}>
        <SideNav active={activeNav} onNavigate={handleNavigate} />
        <div className="rezvix-desktop-main">
          <TopBar title={title} subtitle={subtitle} summaryChips={summaryChips} />
          <section className="rezvix-desktop-content">{children}</section>
        </div>
      </div>
    </CurrencyCtx.Provider>
  );
};