import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { listMakes, listModels } from "../controllers/vehicleCatalog.controller.js";

const router = Router();
router.get("/vehicle/makes", auth(), listMakes);
router.get("/vehicle/models", auth(), listModels);
export default router;
