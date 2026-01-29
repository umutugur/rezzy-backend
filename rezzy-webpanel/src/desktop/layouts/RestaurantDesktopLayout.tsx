import React, {
  PropsWithChildren,
  useEffect,
  useMemo,
  useState,
  createContext,
  useContext,
  useRef,
} from "react";
import "../styles/desktop.css";
import { TopBar, SummaryChip } from "../components/TopBar";
import { SideNav, DesktopNavKey } from "../components/SideNav";
import { DesktopThemeKey, getInitialDesktopTheme } from "../theme";
import { useNavigate } from "react-router-dom";

import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";
import { api, restaurantGetLiveTables } from "../../api/client";
import { restaurantListDeliveryOrders, type DeliveryOrderRow } from "../../api/delivery";
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
  const [deliveryAlert, setDeliveryAlert] = useState(false);
  const [tablesAlert, setTablesAlert] = useState(false);

  const deliveryPrevRef = useRef<Record<string, DeliveryOrderRow> | null>(null);
  const tablesPrevRef = useRef<Record<string, string> | null>(null);
  const deliverySoundRef = useRef<HTMLAudioElement | null>(null);
  const tablesSoundRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    deliverySoundRef.current = new Audio("/sounds/order-come.mp3");
    tablesSoundRef.current = new Audio("/sounds/order-come.mp3");
  }, []);

  // 🔔 Global: Paket servis yeni sipariş + QR sipariş alarmı
  useEffect(() => {
    if (!rid) return;

    let alive = true;
    let timer: any;
    let tableTimer: any;

    const playSound = (ref: React.MutableRefObject<HTMLAudioElement | null>) => {
      if (!ref.current) return;
      try {
        ref.current.currentTime = 0;
        ref.current.play().catch(() => {});
      } catch {}
    };

    const pollDelivery = async () => {
      try {
        const data = await restaurantListDeliveryOrders(rid);
        if (!alive) return;
        const orders: DeliveryOrderRow[] = data?.items ?? [];
        const nowMap: Record<string, DeliveryOrderRow> = {};
        let hasNew = false;
        let hasAnyNew = false;

        for (const o of orders) {
          nowMap[String(o._id)] = o;
          if ((o as any)?.status === "new") hasAnyNew = true;
        }

        const prev = deliveryPrevRef.current;
        if (prev) {
          for (const id of Object.keys(nowMap)) {
            if (!prev[id] && (nowMap[id] as any)?.status === "new") {
              hasNew = true;
              break;
            }
          }
        }

        if (hasNew) {
          playSound(deliverySoundRef);
        }
        setDeliveryAlert(hasAnyNew);
        deliveryPrevRef.current = nowMap;
      } catch {
        // ignore polling errors
      }
    };

    const pollTables = async () => {
      try {
        const data = await restaurantGetLiveTables(rid);
        if (!alive) return;
        const tables = (data as any)?.tables ?? [];

        const nowMap: Record<string, string> = {};
        let hasQrActive = false;
        let hasNewQr = false;

        for (const t of tables) {
          const channel = String(t?.channel || "");
          const lastOrderAt = String(t?.lastOrderAt || "");
          if (channel === "QR" && lastOrderAt) {
            nowMap[String(t.id)] = lastOrderAt;
          }
          if (channel === "QR" && String(t?.status) === "order_active") {
            hasQrActive = true;
          }
        }

        const prev = tablesPrevRef.current;
        if (prev) {
          for (const id of Object.keys(nowMap)) {
            if (!prev[id] && nowMap[id]) {
              hasNewQr = true;
              break;
            }
            if (prev[id] && prev[id] !== nowMap[id]) {
              hasNewQr = true;
              break;
            }
          }
        }

        if (hasNewQr) {
          playSound(tablesSoundRef);
        }
        setTablesAlert(hasQrActive);
        tablesPrevRef.current = nowMap;
      } catch {
        // ignore polling errors
      }
    };

    pollDelivery();
    pollTables();
    timer = setInterval(pollDelivery, 5000);
    tableTimer = setInterval(pollTables, 6000);

    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(tableTimer);
    };
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
    if (key === "delivery") setDeliveryAlert(false);
    if (key === "tables") setTablesAlert(false);
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
        case "delivery":
  navigate("/restaurant-desktop/delivery");
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
        <SideNav
          active={activeNav}
          onNavigate={handleNavigate}
          alerts={{ delivery: deliveryAlert, tables: tablesAlert }}
        />
        <div className="rezvix-desktop-main">
          <TopBar title={title} subtitle={subtitle} summaryChips={summaryChips} />
          <section className="rezvix-desktop-content">{children}</section>
        </div>
      </div>
    </CurrencyCtx.Provider>
  );
};
