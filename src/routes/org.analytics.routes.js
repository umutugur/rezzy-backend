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
r.get("/organizations/:organizationId/summary", auth(true), requireOrgAccess(), orgSummary);
r.get("/organizations/:organizationId/timeseries", auth(true), requireOrgAccess(), orgTimeseries);
r.get("/organizations/:organizationId/top-restaurants", auth(true), requireOrgAccess(), orgTopRestaurants);

// Restaurant scope (şimdilik auth yeterli; istersen restaurantId -> orgId check’i de ekleriz)
r.get("/restaurants/:restaurantId/summary", auth(true), restaurantSummary);

export default r;