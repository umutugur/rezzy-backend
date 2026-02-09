import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allowOrgOwnerOrAdmin } from "../middlewares/roles.js";
import {
  listMyOrganizations,
  getMyOrganizationDetail,
  updateMyOrganization,
  listOrganizationRestaurantsForOwner,
  createBranchRequest,
  listMyBranchRequests,
} from "../controllers/org.controller.js";

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

export default r;
