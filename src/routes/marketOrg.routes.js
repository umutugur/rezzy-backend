import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireOrgAccess } from "../middlewares/requireOrgAccess.js";
import { listOrgProducts, createOrgProduct, updateOrgProduct, deleteOrgProduct, listOrgBranches } from "../controllers/marketOrgCatalog.controller.js";

const r = Router();
const guard = [auth(), requireOrgAccess(["org_owner", "org_admin"])];
r.get("/market/org/:organizationId/products", ...guard, listOrgProducts);
r.post("/market/org/:organizationId/products", ...guard, createOrgProduct);
r.patch("/market/org/:organizationId/products/:id", ...guard, updateOrgProduct);
r.delete("/market/org/:organizationId/products/:id", ...guard, deleteOrgProduct);
r.get("/market/org/:organizationId/branches", ...guard, listOrgBranches);
export default r;
