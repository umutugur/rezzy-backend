import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import {
  kpiGlobal,
  kpiByRestaurant,
  kpiByUser,
  listRestaurants,
  getRestaurantDetail,
  listReservationsByRestaurantAdmin,
  updateRestaurantCommission,
  listUsers,
  getUserDetail,
  getUserRiskHistory,
  banUser,
  unbanUser,
  updateUserRole,
  listReservationsAdmin,
  listReviews,
  hideReview,
  unhideReview,
  removeReview,
  exportUsers,
  userStats,
  listComplaints,
  resolveComplaint,
  dismissComplaint,
  createRestaurant, // ✅ YENİ
} from "../controllers/admin.controller.js";
import { commissionsPreview, commissionsExport } from "../controllers/commission.controller.js";

const r = Router();

// ---- KPI / Analytics ----
r.get("/kpi/global", auth(), allow("admin"), kpiGlobal);
r.get("/kpi/restaurants/:rid", auth(), allow("admin"), kpiByRestaurant);
r.get("/kpi/users/:uid", auth(), allow("admin"), kpiByUser);

// ---- Restaurants ----
r.get("/restaurants", auth(), allow("admin"), listRestaurants);
r.post("/restaurants", auth(), allow("admin"), createRestaurant); // ✅ YENİ
r.get("/restaurants/:rid", auth(), allow("admin"), getRestaurantDetail);
r.get("/restaurants/:rid/reservations", auth(), allow("admin"), listReservationsByRestaurantAdmin);
r.patch("/restaurants/:rid/commission", auth(), allow("admin"), updateRestaurantCommission);

// ---- Users ----
r.get("/users/stats", auth(), allow("admin"), userStats);
r.get("/users/export", auth(), allow("admin"), exportUsers);
r.get("/users", auth(), allow("admin"), listUsers);
r.get("/users/:uid/risk", auth(), allow("admin"), getUserRiskHistory);
r.get("/users/:uid", auth(), allow("admin"), getUserDetail);
r.post("/users/:uid/ban", auth(), allow("admin"), banUser);
r.post("/users/:uid/unban", auth(), allow("admin"), unbanUser);
r.post("/users/:uid/role", auth(), allow("admin"), updateUserRole);

// ---- Reservations ----
r.get("/reservations", auth(), allow("admin"), listReservationsAdmin);

// ---- Reviews ----
r.get("/reviews", auth(), allow("admin"), listReviews);
r.post("/reviews/:id/hide", auth(), allow("admin"), hideReview);
r.post("/reviews/:id/unhide", auth(), allow("admin"), unhideReview);
r.delete("/reviews/:id", auth(), allow("admin"), removeReview);

// ---- Complaints ----
r.get("/complaints", auth(), allow("admin"), listComplaints);
r.post("/complaints/:id/resolve", auth(), allow("admin"), resolveComplaint);
r.post("/complaints/:id/dismiss", auth(), allow("admin"), dismissComplaint);

// ---- Commissions ----
r.get("/commissions/monthly", auth(), allow("admin"), commissionsPreview);
r.get("/commissions/monthly/export", auth(), allow("admin"), commissionsExport);

export default r;