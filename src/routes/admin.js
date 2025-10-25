import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { exportUsers, userStats } from "../controllers/admin.controller.js";
import * as admin from "../controllers/admin.controller.js";
// ✅ Senin dosyan ve fonksiyon isimlerin:
import { commissionsPreview, commissionsExport } from "../controllers/commission.controller.js";

const r = Router();

// ---- KPI / Analytics ----
r.get("/kpi/global",             auth(), allow("admin"), admin.kpiGlobal);
r.get("/kpi/restaurants/:rid",   auth(), allow("admin"), admin.kpiByRestaurant);
r.get("/kpi/users/:uid",         auth(), allow("admin"), admin.kpiByUser);
// ✅ Kullanıcı istatistikleri ve dışa aktarım
r.get("/users/stats",  auth(), allow("admin"), userStats);
r.get("/users/export", auth(), allow("admin"), exportUsers);

// ---- Restaurants ----
r.get("/restaurants",                        auth(), allow("admin"), admin.listRestaurants);
r.get("/restaurants/:rid",                   auth(), allow("admin"), admin.getRestaurantDetail);
r.get("/restaurants/:rid/reservations",      auth(), allow("admin"), admin.listReservationsByRestaurantAdmin);

// ✅ Komisyon oranı güncelle
r.patch("/restaurants/:rid/commission",      auth(), allow("admin"), admin.updateRestaurantCommission);

// ---- Users (list + detail + ban/unban + role) ----
r.get(   "/users",               auth(), allow("admin"), admin.listUsers);
r.get(   "/users/:uid",          auth(), allow("admin"), admin.getUserDetail);
r.get(   "/users/:uid/risk",     auth(), allow("admin"), admin.getUserRiskHistory); // ✅ NEW: risk geçmişi
r.post(  "/users/:uid/ban",      auth(), allow("admin"), admin.banUser);
r.post(  "/users/:uid/unban",    auth(), allow("admin"), admin.unbanUser);

// ✅ Rol güncelle
r.post(  "/users/:uid/role",     auth(), allow("admin"), admin.updateUserRole);

// ---- Reservations (global, read-only) ----
r.get("/reservations",           auth(), allow("admin"), admin.listReservationsAdmin);

// ---- Reviews & Complaints (moderasyon) ----
r.get(   "/reviews",             auth(), allow("admin"), admin.listReviews);
r.post(  "/reviews/:id/hide",    auth(), allow("admin"), admin.hideReview);
r.post(  "/reviews/:id/unhide",  auth(), allow("admin"), admin.unhideReview);
r.delete("/reviews/:id",         auth(), allow("admin"), admin.removeReview);

r.get(   "/complaints",              auth(), allow("admin"), admin.listComplaints);
r.post(  "/complaints/:id/resolve",  auth(), allow("admin"), admin.resolveComplaint);
r.post(  "/complaints/:id/dismiss",  auth(), allow("admin"), admin.dismissComplaint);

// ---- Commissions (Aylık rapor – sadece ARRIVED) ----
// JSON önizleme (özet)
r.get("/commissions/monthly",            auth(), allow("admin"), commissionsPreview);
// Excel (xlsx) indirme
r.get("/commissions/monthly/export",     auth(), allow("admin"), commissionsExport);

export default r;