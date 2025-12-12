import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  allow,
  allowAdmin,
  allowOrgOwnerOrAdmin,
  allowLocationManagerOrAdmin,
} from "../middlewares/roles.js";
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
   addOrganizationMember,
  removeOrganizationMember,
  addRestaurantMember,
  removeRestaurantMember,
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
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

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

// 🔽 Organizasyon üyelikleri (membership)
r.post(
  "/organizations/:oid/members",
  auth(),
  allow("admin"),
  addOrganizationMember
);

r.delete(
  "/organizations/:oid/members/:uid",
  auth(),
  allow("admin"),
  removeOrganizationMember
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

// 🔽 Restaurant membership
r.post(
  "/restaurants/:rid/members",
  auth(),
  allow("admin"),
  addRestaurantMember
);

r.delete(
  "/restaurants/:rid/members/:uid",
  auth(),
  allow("admin"),
  removeRestaurantMember
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
  allowOrgOwnerOrAdmin("oid"),
  getOrgMenu
);

// Kategoriler
r.post(
  "/organizations/:oid/menu/categories",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  createOrgCategory
);

r.patch(
  "/organizations/:oid/menu/categories/:cid",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  updateOrgCategory
);

r.delete(
  "/organizations/:oid/menu/categories/:cid",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  deleteOrgCategory
);

// Item’lar
r.post(
  "/organizations/:oid/menu/items",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  upload.single("photo"), 
  createOrgItem
);

r.patch(
  "/organizations/:oid/menu/items/:iid",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  upload.single("photo"), 
  updateOrgItem
);

r.delete(
  "/organizations/:oid/menu/items/:iid",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  deleteOrgItem
);

export default r;