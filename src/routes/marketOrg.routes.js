import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { requireOrgAccess } from "../middlewares/requireOrgAccess.js";
import { listOrgProducts, createOrgProduct, updateOrgProduct, deleteOrgProduct, listOrgBranches } from "../controllers/marketOrgCatalog.controller.js";
import { orgReports, orgBranchDetail, orgUpdateBranch, orgProductOverrides, orgBulkImport, orgExportCsv, orgBulkUpdate, orgBulkPrice } from "../controllers/marketOrgPanel.controller.js";
import { listImportTemplates, createImportTemplate, updateImportTemplate, deleteImportTemplate } from "../controllers/marketImportTemplate.controller.js";
import { createMarketBranchRequest, listMarketBranchRequests } from "../controllers/marketBranchRequest.controller.js";
import { listStoreManagers, addStoreManager, removeStoreManager } from "../controllers/branchManagers.controller.js";
import { listOrgCampaigns, joinOrgCampaign, leaveOrgCampaign } from "../controllers/marketCampaign.controller.js";

const r = Router();
const guard = [auth(), requireOrgAccess(["org_owner", "org_admin"])];
r.get("/market/org/:organizationId/products", ...guard, listOrgProducts);
r.post("/market/org/:organizationId/products", ...guard, createOrgProduct);
r.post("/market/org/:organizationId/products/bulk-import", ...guard, orgBulkImport);
r.get("/market/org/:organizationId/products/export", ...guard, orgExportCsv);
r.post("/market/org/:organizationId/products/bulk-update", ...guard, orgBulkUpdate);
r.post("/market/org/:organizationId/products/bulk-price", ...guard, orgBulkPrice);
r.patch("/market/org/:organizationId/products/:id", ...guard, updateOrgProduct);
r.delete("/market/org/:organizationId/products/:id", ...guard, deleteOrgProduct);
r.get("/market/org/:organizationId/products/:id/overrides", ...guard, orgProductOverrides);
r.get("/market/org/:organizationId/branches", ...guard, listOrgBranches);
r.get("/market/org/:organizationId/branches/:storeId", ...guard, orgBranchDetail);
r.patch("/market/org/:organizationId/branches/:storeId", ...guard, orgUpdateBranch);
r.get("/market/org/:organizationId/reports", ...guard, orgReports);
r.get("/market/org/:organizationId/import-templates", ...guard, listImportTemplates);
r.post("/market/org/:organizationId/import-templates", ...guard, createImportTemplate);
r.patch("/market/org/:organizationId/import-templates/:id", ...guard, updateImportTemplate);
r.delete("/market/org/:organizationId/import-templates/:id", ...guard, deleteImportTemplate);
r.post("/market/org/:organizationId/branch-requests", ...guard, createMarketBranchRequest);
r.get("/market/org/:organizationId/branch-requests", ...guard, listMarketBranchRequests);

r.get("/market/org/:organizationId/branches/:storeId/managers", ...guard, listStoreManagers);
r.post("/market/org/:organizationId/branches/:storeId/managers", ...guard, addStoreManager);
r.delete("/market/org/:organizationId/branches/:storeId/managers/:userId", ...guard, removeStoreManager);

r.get("/market/org/:organizationId/campaigns", ...guard, listOrgCampaigns);
r.post("/market/org/:organizationId/campaigns/:campaignId/join", ...guard, joinOrgCampaign);
r.post("/market/org/:organizationId/campaigns/:campaignId/leave", ...guard, leaveOrgCampaign);

export default r;
