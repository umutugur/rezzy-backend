import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import {
  adminListServiceCategories, adminCreateServiceCategory,
  adminUpdateServiceCategory, adminDeleteServiceCategory,
  adminListCoreCategories, adminCreateCoreCategory, adminUpdateCoreCategory,
} from "../controllers/serviceCategories.controller.js";

const r = Router();
r.get("/service-categories", auth(), allow("admin"), adminListServiceCategories);
r.post("/service-categories", auth(), allow("admin"), adminCreateServiceCategory);
r.put("/service-categories/:id", auth(), allow("admin"), adminUpdateServiceCategory);
r.delete("/service-categories/:id", auth(), allow("admin"), adminDeleteServiceCategory);

r.get("/core-categories", auth(), allow("admin"), adminListCoreCategories);
r.post("/core-categories", auth(), allow("admin"), adminCreateCoreCategory);
r.put("/core-categories/:id", auth(), allow("admin"), adminUpdateCoreCategory);
export default r;
