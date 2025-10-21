// src/routes/admin.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  kpiGlobal, kpiByRestaurant, kpiByUser,
  listRestaurants, getRestaurantDetail, listReservationsByRestaurantAdmin,
  updateRestaurantCommission,
  listUsers, getUserDetail, banUser, unbanUser,
  listReservationsAdmin,
  listReviews, hideReview, unhideReview, removeReview,
  listComplaints, resolveComplaint, dismissComplaint,
} from "../controllers/admin.controller.js";

import {
  commissionsPreview,
  commissionsExport,
} from "../controllers/commission.controller.js";

const r = Router();

// ---- admin guard
function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ ok:false, error:"forbidden" });
  next();
}

// KPI
r.get("/admin/kpi/global",              auth(), requireAdmin, kpiGlobal);
r.get("/admin/kpi/restaurant/:rid",     auth(), requireAdmin, kpiByRestaurant);
r.get("/admin/kpi/user/:uid",           auth(), requireAdmin, kpiByUser);

// Commissions (✅ sadece ARRIVED üzerinden)
r.get("/admin/commissions/preview",     auth(), requireAdmin, commissionsPreview);
r.get("/admin/commissions/export",      auth(), requireAdmin, commissionsExport);

// Restaurants
r.get("/admin/restaurants",             auth(), requireAdmin, listRestaurants);
r.get("/admin/restaurants/:rid",        auth(), requireAdmin, getRestaurantDetail);
r.get("/admin/restaurants/:rid/reservations", auth(), requireAdmin, listReservationsByRestaurantAdmin);
r.post("/admin/restaurants/:rid/commission",  auth(), requireAdmin, updateRestaurantCommission);

// Users
r.get("/admin/users",                   auth(), requireAdmin, listUsers);
r.get("/admin/users/:uid",              auth(), requireAdmin, getUserDetail);
r.post("/admin/users/:uid/ban",         auth(), requireAdmin, banUser);
r.post("/admin/users/:uid/unban",       auth(), requireAdmin, unbanUser);

// Reservations (global RO)
r.get("/admin/reservations",            auth(), requireAdmin, listReservationsAdmin);

// Reviews
r.get("/admin/reviews",                 auth(), requireAdmin, listReviews);
r.post("/admin/reviews/:id/hide",       auth(), requireAdmin, hideReview);
r.post("/admin/reviews/:id/unhide",     auth(), requireAdmin, unhideReview);
r.delete("/admin/reviews/:id",          auth(), requireAdmin, removeReview);

// Complaints
r.get("/admin/complaints",              auth(), requireAdmin, listComplaints);
r.post("/admin/complaints/:id/resolve", auth(), requireAdmin, resolveComplaint);
r.post("/admin/complaints/:id/dismiss", auth(), requireAdmin, dismissComplaint);

export default r;