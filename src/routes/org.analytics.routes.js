// src/routes/org.analytics.routes.js
import express from "express";
import { auth } from "../middlewares/auth.js";
import { requireOrgAccess } from "../middlewares/requireOrgAccess.js";
import {
  orgSummary,
  orgTimeseries,
  orgTopRestaurants,
  restaurantSummary,
} from "../controllers/org.analytics.controller.js";

const r = express.Router();

// Org scope
r.get("/organizations/:organizationId/summary", auth(true), requireOrgAccess(["org_owner", "org_admin", "org_finance"]), orgSummary);
r.get("/organizations/:organizationId/timeseries", auth(true), requireOrgAccess(["org_owner", "org_admin", "org_finance"]), orgTimeseries);
r.get("/organizations/:organizationId/top-restaurants", auth(true), requireOrgAccess(["org_owner", "org_admin", "org_finance"]), orgTopRestaurants);

// Restaurant scope (şimdilik auth yeterli; istersen restaurantId -> orgId check’i de ekleriz)
r.get("/restaurants/:restaurantId/summary", auth(true), restaurantSummary);

export default r;