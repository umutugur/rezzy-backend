// src/App.tsx
import React from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { authStore, MeUser } from "./store/auth";
import { fetchMe, loginWithEmail, updateMe } from "./api/client";
import { LANG_OPTIONS, DEFAULT_LANGUAGE } from "./utils/languages";
import { useI18n, setLocale } from "./i18n";
import { resolvePanelLanguage } from "./i18n/panel";
import { showToast } from "./ui/Toast";

// Pages
import AdminDashboardPage from "./pages/admin/Dashboard";
import AdminRestaurantsPage from "./pages/admin/Restaurants";
import AdminRestaurantDetailPage from "./pages/admin/RestaurantDetail";
import AdminUsersPage from "./pages/admin/Users";
import AdminReservationsPage from "./pages/admin/Reservations";
import AdminModerationPage from "./pages/admin/Moderation";
import AdminUserDetailPage from "./pages/admin/UserDetail";
import AdminNotificationsPage from "./pages/admin/Notifications";
import AdminCommissionsPage from "./pages/admin/commissions";
import AdminRestaurantCreatePage from "./pages/admin/RestaurantCreate";
import AdminOrganizationsPage from "./pages/admin/Organizations";
import AdminOrganizationDetailPage from "./pages/admin/OrganizationDetail";
import AdminBannersPage from "./pages/admin/Banners";

import RestaurantDashboardPage from "./pages/restaurant/Dashboard";
import RestaurantReservationsPage from "./pages/restaurant/Reservations";
import RestaurantProfilePage from "./pages/restaurant/Profile";
import OpeningHoursPage from "./pages/restaurant/OpeningHours";
import TablesPage from "./pages/restaurant/Tables";
import MenusPage from "./pages/restaurant/Menus";
import PhotosPage from "./pages/restaurant/Photos";
import PoliciesPage from "./pages/restaurant/Policies";
import MenuManagerPage from "./pages/restaurant/MenuManager";

// ORG panel
import OrgDashboardPage from "./pages/org/Dashboard";
import OrgBranchRequestsPage from "./pages/org/BranchRequests";
import OrgMenuManagerPage from "./pages/org/OrgMenuManagerPage"; 

// Desktop mode
import { LiveTablesPage } from "./desktop/pages/LiveTablesPage";
import { KitchenBoardPage } from "./desktop/pages/KitchenBoardPage";
import { RezvixOrdersPage } from "./desktop/pages/RezvixOrdersPage";
import { ReportsPage } from "./desktop/pages/ReportsPage";
import { SettingsPage } from "./desktop/pages/SettingsPage";
import { DesktopMenuManagerPage } from "./desktop/pages/DesktopMenuManagerPage";
import { DeliveryOrdersPage } from "./desktop/pages/DeliveryOrdersPage";
 
// ---- Helpers ----

// 🔑 Artık sadece “restaurant rolü var mı?” değil,
// gerçekten panel kullanabilecek biri mi diye bakıyoruz:
// - admin
// - eski “restaurant” rolü
// - tek restoranlı legacy kullanıcı (restaurantId dolu)
// - restaurantMemberships[] dolu olanlar (location_manager / staff vs.)
// - organizations[] dolu olanlar (org_owner / org_admin / org_finance → org panel kullanıcısı)
function hasRestaurantPanelAccess(user: MeUser | null): boolean {
  if (!user) return false;

  // Global roller
  if (user.role === "admin" || user.role === "restaurant") return true;

  // Legacy restaurantId
  if (user.restaurantId) return true;

  // Restaurant membership (location_manager / staff)
  if (user.restaurantMemberships && user.restaurantMemberships.length > 0) {
    return true;
  }

  // 🔥 NEW: Org owner / org admin
  if (
    user.organizations &&
    user.organizations.some(
      (o) => o.role === "org_owner" || o.role === "org_admin"
    )
  ) {
    return true;
  }

  return false;
}

function hasOrgPanelAccess(user: MeUser | null): boolean {
  if (!user) return false;
  return (
    Array.isArray(user.organizations) &&
    user.organizations.some(
      (o) =>
        o.role === "org_owner" ||
        o.role === "org_admin" ||
        o.role === "org_finance" ||
        o.role === "org_staff"
    )
  );
}

// ---- Basit UI parçaları ----
function Shell({ children }: { children: React.ReactNode }) {
  const [u, setU] = React.useState<MeUser | null>(authStore.getUser());
  const nav = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const [lang, setLang] = React.useState<string>(
    u?.preferredLanguage || DEFAULT_LANGUAGE
  );
  const [langSaving, setLangSaving] = React.useState(false);

  React.useEffect(() => {
    const onChange = () => setU(authStore.getUser());
    window.addEventListener("auth:changed", onChange);
    return () => window.removeEventListener("auth:changed", onChange);
  }, []);

  React.useEffect(() => {
    if (u?.preferredLanguage) {
      setLang(u.preferredLanguage);
    }
  }, [u?.preferredLanguage]);

  const handleAdminLangChange = async (value: string) => {
    if (!u) return;
    setLang(value);
    setLangSaving(true);
    try {
      const updated = await updateMe({ preferredLanguage: value });
      authStore.setUser(updated);
      setLocale(value);
      showToast(t("Dil güncellendi"), "success");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || t("Dil güncellenemedi");
      showToast(msg, "error");
      setLang(u.preferredLanguage || DEFAULT_LANGUAGE);
    } finally {
      setLangSaving(false);
    }
  };

  return (
    <div className="min-h-full">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">{t("Rezvix Web Panel")}</h1>
          <div className="flex items-center gap-3">
            {u?.role === "admin" && isAdminRoute && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{t("Dil")}</span>
                <select
                  className="border rounded-md px-2 py-1 text-xs"
                  value={lang}
                  onChange={(e) => handleAdminLangChange(e.target.value)}
                  disabled={langSaving}
                >
                  {LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {u?.role === "admin" && (
              <button
                onClick={() => nav("/admin/notifications")}
                className="px-3 py-1.5 text-sm rounded-md bg-black text-white hover:opacity-90"
              >
                {t("Bildirim Gönder")}
              </button>
            )}
            <UserBadge />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function UserBadge() {
  const [user, setUser] = React.useState<MeUser | null>(authStore.getUser());
  const nav = useNavigate();
  const { t } = useI18n();

  React.useEffect(() => {
    const onChange = () => setUser(authStore.getUser());
    window.addEventListener("auth:changed", onChange);
    return () => window.removeEventListener("auth:changed", onChange);
  }, []);

  if (!user) return null;

  // Rol label'ı: admin / org_owner / location_manager vs.
  const roleLabel = React.useMemo(() => {
    if (!user) return "-";
    if (user.role === "admin") return t("Admin");

    const orgOwner = user.organizations?.find((o) => o.role === "org_owner");
    if (orgOwner) {
      return t("Org Owner • {name}", { name: orgOwner.name ?? "—" });
    }

    const locManager = user.restaurantMemberships?.find(
      (m) => m.role === "location_manager"
    );
    if (locManager) {
      return t("Lokasyon Müdürü • {name}", {
        name: locManager.name ?? "—",
      });
    }

    if (user.role === "restaurant") return t("Restaurant Kullanıcısı");

    return user.role ? t(String(user.role)) : "-";
  }, [t, user]);

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">
        {user.name} • {roleLabel}
      </span>
      <button
        className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200"
        onClick={() => {
          authStore.logout();
          (nav as any)("/login", { replace: true });
        }}
      >
        {t("Çıkış")}
      </button>
    </div>
  );
}

// ---- Auth guard ----
// allow: ["admin"] veya ["restaurant", "admin"]
function PrivateRoute({ allow }: { allow: Array<"admin" | "restaurant"> }) {
  const location = useLocation();
  const user = authStore.getUser();
  const token = authStore.getToken();

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const isAdmin = user.role === "admin";
  const isRestaurantPanelUser = hasRestaurantPanelAccess(user);

  let allowed = false;
  if (allow.includes("admin") && isAdmin) allowed = true;
  if (allow.includes("restaurant") && isRestaurantPanelUser) allowed = true;

  if (!allowed) {
    if (isAdmin) return <Navigate to="/admin" replace />;
    if (isRestaurantPanelUser) return <Navigate to="/restaurant" replace />;
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Org panel guard
function OrgPrivateRoute() {
  const location = useLocation();
  const user = authStore.getUser();
  const token = authStore.getToken();

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!hasOrgPanelAccess(user)) {
    // Org panel yetkisi yoksa mevcut erişimine göre yönlendir
    if (user.role === "admin") return <Navigate to="/admin" replace />;
    if (hasRestaurantPanelAccess(user))
      return <Navigate to="/restaurant" replace />;
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// ---- Login Page ----
function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const nav = useNavigate();
  const location = useLocation() as any;
  const { t } = useI18n();

  const computeRedirect = (u: MeUser | null): string => {
    if (!u) return "/login";

    // 🔥 Desktop mode detection (Electron / hash-based)
    // URL example: https://rezzywebpanel.onrender.com/#/login?mode=desktop
    const search =
      window.location.search ||
      window.location.hash.split("?")[1] ||
      "";

    const sp = new URLSearchParams(search);
    const isDesktopMode =
      sp.get("mode") === "desktop" || !!(window as any)?.rezvix;

    // 🔥 Desktop users always land on desktop tables
    if (isDesktopMode) {
      return "/restaurant-desktop/tables";
    }

    const isOrgUser = hasOrgPanelAccess(u);
    const isRestaurantUser = hasRestaurantPanelAccess(u);

    if (u.role === "admin") return "/admin";
    if (isOrgUser) return "/org";
    if (isRestaurantUser) return "/restaurant";

    return "/login";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const resp = await loginWithEmail({ email, password });
      authStore.setToken(resp.token);
      if (resp.user) authStore.setUser(resp.user);
      else authStore.setUser(await fetchMe());
      const u = authStore.getUser();
      const fallback = computeRedirect(u);
      const redirect = location?.state?.from?.pathname || fallback;
      nav(redirect, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || t("Giriş başarısız"));
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const t = authStore.getToken();
    if (!t) return;
    fetchMe()
      .then((me) => {
        authStore.setUser(me);
        const dest = computeRedirect(authStore.getUser());
        (nav as any)(dest, { replace: true });
      })
      .catch(() => authStore.logout());
  }, [nav]);

  return (
    <div className="min-h-full grid place-items-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-soft p-6 space-y-4"
      >
        <h2 className="text-xl font-semibold">{t("Panele Giriş")}</h2>
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            {t("E-posta")}
          </label>
          <input
            type="email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            {t("Şifre")}
          </label>
          <input
            type="password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white py-2 font-medium disabled:opacity-60"
        >
          {loading ? t("Giriş yapılıyor...") : t("Giriş Yap")}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const nav = useNavigate();
  const location = useLocation();
  const [user, setUser] = React.useState<MeUser | null>(authStore.getUser());

  React.useEffect(() => {
    const onChange = () => {
      const t = authStore.getToken();
      const u = authStore.getUser();
      setUser(u);
      if (!t || !u) (nav as any)("/login", { replace: true });
    };
    window.addEventListener("auth:changed", onChange);
    return () => window.removeEventListener("auth:changed", onChange);
  }, [nav]);

  React.useEffect(() => {
    const nextLang = resolvePanelLanguage(user, location.pathname);
    setLocale(nextLang);
  }, [user, location.pathname]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin alanı */}
      <Route element={<PrivateRoute allow={["admin"]} />}>
        <Route
          path="/admin"
          element={
            <Shell>
              <AdminDashboardPage />
            </Shell>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <Shell>
              <AdminNotificationsPage />
            </Shell>
          }
        />
        <Route
  path="/admin/banners"
  element={
    <Shell>
      <AdminBannersPage />
    </Shell>
  }
/>
        <Route
          path="/admin/organizations"
          element={
            <Shell>
              <AdminOrganizationsPage />
            </Shell>
          }
        />
        <Route
          path="/admin/organizations/:oid"
          element={
            <Shell>
              <AdminOrganizationDetailPage />
            </Shell>
          }
        />
        <Route
          path="/admin/commissions"
          element={
            <Shell>
              <AdminCommissionsPage />
            </Shell>
          }
        />
        <Route
          path="/admin/restaurants"
          element={
            <Shell>
              <AdminRestaurantsPage />
            </Shell>
          }
        />
        <Route
          path="/admin/restaurants/new"
          element={
            <Shell>
              <AdminRestaurantCreatePage />
            </Shell>
          }
        />
        <Route
          path="/admin/restaurants/:rid"
          element={
            <Shell>
              <AdminRestaurantDetailPage />
            </Shell>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Shell>
              <AdminUsersPage />
            </Shell>
          }
        />
        <Route
          path="/admin/users/:uid"
          element={
            <Shell>
              <AdminUserDetailPage />
            </Shell>
          }
        />
        <Route
          path="/admin/reservations"
          element={
            <Shell>
              <AdminReservationsPage />
            </Shell>
          }
        />
        <Route
          path="/admin/moderation"
          element={
            <Shell>
              <AdminModerationPage />
            </Shell>
          }
        />
      </Route>

      {/* Org alanı */}
      <Route element={<OrgPrivateRoute />}>
        <Route
          path="/org"
          element={
            <Shell>
              <OrgDashboardPage />
            </Shell>
          }
        />
        <Route
          path="/org/branch-requests"
          element={
            <Shell>
              <OrgBranchRequestsPage />
            </Shell>
          }
        />
        <Route
          path="/org/organizations/:id/menu"
          element={
            <Shell>
              <OrgMenuManagerPage />
            </Shell>
          }
        />
      </Route>
      

      {/* Restoran alanı + Desktop */}
      <Route element={<PrivateRoute allow={["restaurant", "admin"]} />}>
        <Route
          path="/restaurant"
          element={
            <Shell>
              <RestaurantDashboardPage />
            </Shell>
          }
        />
        <Route
          path="/restaurant/reservations"
          element={
            <Shell>
              <RestaurantReservationsPage />
            </Shell>
          }
        />
        <Route
          path="/restaurant/opening-hours"
          element={
            <Shell>
              <OpeningHoursPage />
            </Shell>
          }
        />
        <Route
          path="/restaurant/tables"
          element={
            <Shell>
              <TablesPage />
            </Shell>
          }
        />
        <Route
          path="/restaurant/menus"
          element={
            <Shell>
              <MenusPage />
            </Shell>
          }
        />
        {/* Geriye dönük uyumluluk */}
        <Route
          path="/restaurant/menu"
          element={<Navigate to="/panel/restaurant/menu" replace />}
        />
        <Route
          path="/restaurant/photos"
          element={
            <Shell>
              <PhotosPage />
            </Shell>
          }
        />
        <Route
          path="/restaurant/profile"
          element={
            <Shell>
              <RestaurantProfilePage />
            </Shell>
          }
        />
        <Route
          path="/restaurant/policies"
          element={
            <Shell>
              <PoliciesPage />
            </Shell>
          }
        />
        <Route
          path="/restaurant/menu-manager"
          element={
            <Shell>
              <MenuManagerPage />
            </Shell>
          }
        />

        {/* Yeni panel prefix'li menü rotaları */}
        <Route
          path="/panel/restaurant/menu"
          element={
            <Shell>
              <MenuManagerPage />
            </Shell>
          }
        />
        <Route
          path="/panel/restaurant/menus"
          element={
            <Shell>
              <MenusPage />
            </Shell>
          }
        />
        <Route
          path="/panel/restaurant/menu-manager"
          element={<Navigate to="/panel/restaurant/menu" replace />}
        />

        {/* 🔥 Restaurant Desktop Mode route'ları (Shell YOK) */}
        <Route path="/restaurant-desktop/tables" element={<LiveTablesPage />} />
        <Route path="/restaurant-desktop/kitchen" element={<KitchenBoardPage />} />
        <Route path="/restaurant-desktop/rezvix" element={<RezvixOrdersPage />} />
        <Route path="/restaurant-desktop/reports" element={<ReportsPage />} />
        <Route path="/restaurant-desktop/settings" element={<SettingsPage />} />
        <Route path="/restaurant-desktop/menu" element={<DesktopMenuManagerPage />} />
        <Route path="/restaurant-desktop/delivery" element={<DeliveryOrdersPage />} />

      </Route>

      {/* Kök rota */}
      <Route path="/" element={<RootRedirect />} />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RootRedirect() {
  const u = authStore.getUser();
  if (!u) return <Navigate to="/login" replace />;

  const isOrgUser = hasOrgPanelAccess(u);

  if (u.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  // 🔥 Org kullanıcıları için ayrı giriş noktası
  if (isOrgUser) {
    return <Navigate to="/org" replace />;
  }

  if (hasRestaurantPanelAccess(u)) {
    return <Navigate to="/restaurant" replace />;
  }

  return <Navigate to="/login" replace />;
}
