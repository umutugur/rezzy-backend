import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireOrgAccess } from "../middlewares/requireOrgAccess.js";
import { listOrgProducts, createOrgProduct, updateOrgProduct, deleteOrgProduct, listOrgBranches } from "../controllers/marketOrgCatalog.controller.js";
import { orgReports, orgBranchDetail, orgUpdateBranch } from "../controllers/marketOrgPanel.controller.js";

const r = Router();
const guard = [auth(), requireOrgAccess(["org_owner", "org_admin"])];
r.get("/market/org/:organizationId/products", ...guard, listOrgProducts);
r.post("/market/org/:organizationId/products", ...guard, createOrgProduct);
r.patch("/market/org/:organizationId/products/:id", ...guard, updateOrgProduct);
r.delete("/market/org/:organizationId/products/:id", ...guard, deleteOrgProduct);
r.get("/market/org/:organizationId/branches", ...guard, listOrgBranches);
r.get("/market/org/:organizationId/branches/:storeId", ...guard, orgBranchDetail);
r.patch("/market/org/:organizationId/branches/:storeId", ...guard, orgUpdateBranch);
r.get("/market/org/:organizationId/reports", ...guard, orgReports);
export default r;
