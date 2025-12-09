// src/routes/org.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";

import {
  createBranchRequest,
  listMyBranchRequests,
} from "../controllers/org.controller.js";

import {
  createBranchRequestSchema,
  adminListBranchRequestsSchema, // GET için de kullanacağız
} from "../validators/branchRequest.schema.js";

const r = Router();

// Org owner / org_admin → yeni şube talebi
r.post(
  "/branch-requests",
  auth(),
  validate(createBranchRequestSchema),
  createBranchRequest
);

// Org owner / org_admin → kendi taleplerini listeleme
r.get(
  "/branch-requests",
  auth(),
  validate(adminListBranchRequestsSchema), // status, organizationId, limit, cursor validate
  listMyBranchRequests
);

export default r;