import { Router } from "express";
import { listActiveBanners } from "../controllers/banner.controller.js";

const r = Router();

r.get("/banners", listActiveBanners);

export default r;