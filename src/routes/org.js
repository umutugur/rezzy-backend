import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allowOrgOwnerOrAdmin } from "../middlewares/roles.js";
import { requireOrgAccess } from "../middlewares/requireOrgAccess.js";
import {
  listMyOrganizations,
  getMyOrganizationDetail,
  updateMyOrganization,
  listOrganizationRestaurantsForOwner,
  createBranchRequest,
  listMyBranchRequests,
} from "../controllers/org.controller.js";
import {
  listRestaurantManagers,
  addRestaurantManager,
  removeRestaurantManager,
} from "../controllers/branchManagers.controller.js";

const r = Router();

r.get("/organizations", auth(), listMyOrganizations);

r.get(
  "/organizations/:oid",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  getMyOrganizationDetail
);

r.patch(
  "/organizations/:oid",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  updateMyOrganization
);

r.get(
  "/organizations/:oid/restaurants",
  auth(),
  allowOrgOwnerOrAdmin("oid"),
  listOrganizationRestaurantsForOwner
);

r.post("/branch-requests", auth(), createBranchRequest);
r.get("/branch-requests", auth(), listMyBranchRequests);

r.get(
  "/organizations/:organizationId/restaurants/:rid/managers",
  auth(),
  requireOrgAccess(["org_owner", "org_admin"]),
  listRestaurantManagers
);
r.post(
  "/organizations/:organizationId/restaurants/:rid/managers",
  auth(),
  requireOrgAccess(["org_owner", "org_admin"]),
  addRestaurantManager
);
r.delete(
  "/organizations/:organizationId/restaurants/:rid/managers/:userId",
  auth(),
  requireOrgAccess(["org_owner", "org_admin"]),
  removeRestaurantManager
);

export default r;
