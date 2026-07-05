import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { listServiceCategories } from "../controllers/serviceCategories.controller.js";

const r = Router();
r.get("/service-categories", auth(false), listServiceCategories);
export default r;
