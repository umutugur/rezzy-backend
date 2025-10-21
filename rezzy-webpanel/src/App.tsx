import React from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { authStore, MeUser } from "./store/auth";
import { fetchMe, loginWithEmail } from "./api/client";

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

import RestaurantDashboardPage from "./pages/restaurant/Dashboard";
import RestaurantReservationsPage from "./pages/restaurant/Reservations";
import RestaurantProfilePage from "./pages/restaurant/Profile";
import OpeningHoursPage from "./pages/restaurant/OpeningHours";
import TablesPage from "./pages/restaurant/Tables";
import MenusPage from "./pages/restaurant/Menus";
import PhotosPage from "./pages/restaurant/Photos";
import PoliciesPage from "./pages/restaurant/Policies";

// ---- Basit UI parçaları ----
function Shell({ children }: { children: React.ReactNode }) {
  const u = authStore.getUser();
  const nav = useNavigate();
  return (
    <div className="min-h-full">
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Rezzy Web Panel</h1>
          <div className="flex items-center gap-3">
            {u?.role === "admin" && (
              <button
                onClick={() => nav("/admin/notifications")}
                className="px-3 py-1.5 text-sm rounded-md bg-black text-white hover:opacity-90"
              >
                Bildirim Gönder
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
  React.useEffect(() => {
    const onChange = () => setUser(authStore.getUser());
    window.addEventListener("auth:changed", onChange);
    return () => window.removeEventListener("auth:changed", onChange);
  }, []);
  if (!user) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600">{user.name} • {user.role}</span>
      <button
        className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200"
        onClick={() => {
          authStore.logout();
          nav("/login", { replace: true });
        }}
      >
        Çıkış
      </button>
    </div>
  );
}

// ---- Auth guard ----
function PrivateRoute({ allow }: { allow: Array<"admin" | "restaurant"> }) {
  const location = useLocation();
  const user = authStore.getUser();
  const token = authStore.getToken();
  if (!token || !user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!allow.includes(user.role as any)) {
    return user.role === "admin" ? <Navigate to="/admin" replace /> : <Navigate to="/restaurant" replace />;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const resp = await loginWithEmail({ email, password });
      authStore.setToken(resp.token);
      if (resp.user) authStore.setUser(resp.user);
      else authStore.setUser(await fetchMe());
      const u = authStore.getUser();
      const redirect = location?.state?.from?.pathname || (u?.role === "admin" ? "/admin" : "/restaurant");
      nav(redirect, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || "Giriş başarısız");
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
        nav(me.role === "admin" ? "/admin" : "/restaurant", { replace: true });
      })
      .catch(() => authStore.logout());
  }, [nav]);

  return (
    <div className="min-h-full grid place-items-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-soft p-6 space-y-4">
        <h2 className="text-xl font-semibold">Panele Giriş</h2>
        <div>
          <label className="block text-sm text-gray-600 mb-1">E-posta</label>
          <input type="email" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                 value={email} onChange={(e)=>setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Şifre</label>
          <input type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
                 value={password} onChange={(e)=>setPassword(e.target.value)} required />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button type="submit" disabled={loading} className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white py-2 font-medium disabled:opacity-60">
          {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const nav = useNavigate();
  React.useEffect(() => {
    const onChange = () => {
      const t = authStore.getToken();
      const u = authStore.getUser();
      if (!t || !u) nav("/login", { replace: true });
    };
    window.addEventListener("auth:changed", onChange);
    return () => window.removeEventListener("auth:changed", onChange);
  }, [nav]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin alanı */}
      <Route element={<PrivateRoute allow={["admin"]} />}>
        <Route path="/admin" element={<Shell><AdminDashboardPage /></Shell>} />
        <Route path="/admin/notifications" element={<Shell><AdminNotificationsPage /></Shell>} />
        <Route path="/admin/restaurants" element={<Shell><AdminRestaurantsPage /></Shell>} />
        <Route path="/admin/restaurants/:rid" element={<Shell><AdminRestaurantDetailPage /></Shell>} />
        <Route path="/admin/users" element={<Shell><AdminUsersPage /></Shell>} />
        <Route path="/admin/users/:uid" element={<Shell><AdminUserDetailPage /></Shell>} />
        <Route path="/admin/reservations" element={<Shell><AdminReservationsPage /></Shell>} />
        <Route path="/admin/moderation" element={<Shell><AdminModerationPage /></Shell>} />
        <Route path="/admin/commisions" element={<Shell><AdminCommissionsPage /></Shell>} />

      </Route>

      {/* Restoran alanı */}
      <Route element={<PrivateRoute allow={["restaurant", "admin"]} />}>
        <Route path="/restaurant" element={<Shell><RestaurantDashboardPage /></Shell>} />
        <Route path="/restaurant/reservations" element={<Shell><RestaurantReservationsPage /></Shell>} />
        <Route path="/restaurant/opening-hours" element={<Shell><OpeningHoursPage /></Shell>} />
        <Route path="/restaurant/tables" element={<Shell><TablesPage /></Shell>} />
        <Route path="/restaurant/menus" element={<Shell><MenusPage /></Shell>} />
        <Route path="/restaurant/photos" element={<Shell><PhotosPage /></Shell>} />
        <Route path="/restaurant/profile" element={<Shell><RestaurantProfilePage /></Shell>} />
        <Route path="/restaurant/policies" element={<Shell><PoliciesPage /></Shell>} />
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
  return u.role === "admin" ? <Navigate to="/admin" replace /> : <Navigate to="/restaurant" replace />;
}