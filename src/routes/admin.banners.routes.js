import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { imageUpload } from "../utils/multer.js";
import {
  adminListBanners,
  adminCreateBanner,
  adminUpdateBanner,
  adminDeleteBanner,
} from "../controllers/banner.controller.js";

const r = Router();

r.get("/banners", auth(), allow("admin"), adminListBanners);
r.post("/banners", auth(), allow("admin"), imageUpload.single("image"), adminCreateBanner);
r.patch("/banners/:id", auth(), allow("admin"), imageUpload.single("image"), adminUpdateBanner);
r.delete("/banners/:id", auth(), allow("admin"), adminDeleteBanner);

export default r;