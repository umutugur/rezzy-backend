import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { validate } from "../middlewares/validate.js";
import {
  kpiGlobal,
  kpiByRestaurant,
  kpiByUser,
  listOrganizations,
  getOrganizationDetail,
  createOrganization,
  createOrganizationRestaurant,
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
  createRestaurant, // ✅
  createUser, // ✅
  listBranchRequestsAdmin,
  approveBranchRequestAdmin,
  rejectBranchRequestAdmin,
} from "../controllers/admin.controller.js";
import {
  commissionsPreview,
  commissionsExport,
} from "../controllers/commission.controller.js";
import {
  adminListBranchRequestsSchema,
  adminApproveBranchRequestSchema,
  adminRejectBranchRequestSchema,
} from "../validators/branchRequest.schema.js"; // ✅ NEW
import {
  getOrgMenu,
  createOrgCategory,
  updateOrgCategory,
  deleteOrgCategory,
  createOrgItem,
  updateOrgItem,
  deleteOrgItem,
} from "../controllers/orgMenu.controller.js";
const r = Router();

// ---- KPI / Analytics ----
r.get("/kpi/global", auth(), allow("admin"), kpiGlobal);
r.get("/kpi/restaurants/:rid", auth(), allow("admin"), kpiByRestaurant);
r.get("/kpi/users/:uid", auth(), allow("admin"), kpiByUser);

// ---- Organizations ----
r.get("/organizations", auth(), allow("admin"), listOrganizations);
r.get("/organizations/:oid", auth(), allow("admin"), getOrganizationDetail);
r.post("/organizations", auth(), allow("admin"), createOrganization);

// Organizasyona şube ekleme
r.post(
  "/organizations/:oid/restaurants",
  auth(),
  allow("admin"),
  createOrganizationRestaurant
);

// ---- Restaurants ----
r.get("/restaurants", auth(), allow("admin"), listRestaurants);
r.post("/restaurants", auth(), allow("admin"), createRestaurant);
r.get("/restaurants/:rid", auth(), allow("admin"), getRestaurantDetail);
r.get(
  "/restaurants/:rid/reservations",
  auth(),
  allow("admin"),
  listReservationsByRestaurantAdmin
);
r.patch(
  "/restaurants/:rid/commission",
  auth(),
  allow("admin"),
  updateRestaurantCommission
);

// ---- Users ----
r.get("/users/stats", auth(), allow("admin"), userStats);
r.get("/users/export", auth(), allow("admin"), exportUsers);
r.get("/users", auth(), allow("admin"), listUsers);
r.post("/users", auth(), allow("admin"), createUser);
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

// ---- Branch Requests ----
r.get(
  "/branch-requests",
  auth(),
  allow("admin"),
  validate(adminListBranchRequestsSchema),
  listBranchRequestsAdmin
);

r.post(
  "/branch-requests/:id/approve",
  auth(),
  allow("admin"),
  validate(adminApproveBranchRequestSchema),
  approveBranchRequestAdmin
);

r.post(
  "/branch-requests/:id/reject",
  auth(),
  allow("admin"),
  validate(adminRejectBranchRequestSchema),
  rejectBranchRequestAdmin
);
// ---- Commissions ----
r.get(
  "/commissions/monthly",
  auth(),
  allow("admin"),
  commissionsPreview
);
r.get(
  "/commissions/monthly/export",
  auth(),
  allow("admin"),
  commissionsExport
);
// ---- Organization Menu (Org-level menü) ----
r.get(
  "/organizations/:oid/menu",
  auth(),
  allow("admin"),
  getOrgMenu
);

// Kategoriler
r.post(
  "/organizations/:oid/menu/categories",
  auth(),
  allow("admin"),
  createOrgCategory
);

r.patch(
  "/organizations/:oid/menu/categories/:cid",
  auth(),
  allow("admin"),
  updateOrgCategory
);

r.delete(
  "/organizations/:oid/menu/categories/:cid",
  auth(),
  allow("admin"),
  deleteOrgCategory
);

// Item’lar
r.post(
  "/organizations/:oid/menu/items",
  auth(),
  allow("admin"),
  createOrgItem
);

r.patch(
  "/organizations/:oid/menu/items/:iid",
  auth(),
  allow("admin"),
  updateOrgItem
);

r.delete(
  "/organizations/:oid/menu/items/:iid",
  auth(),
  allow("admin"),
  deleteOrgItem
);

export default r;