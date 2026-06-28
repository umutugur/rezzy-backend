import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { getWallet, collectCoupon, getApplicable, getStoreBadges } from "../controllers/promotions.controller.js";
const r = Router();
r.get("/promotions/wallet", auth(), getWallet);
r.post("/promotions/collect", auth(), collectCoupon);
r.get("/promotions/applicable", auth(), getApplicable);
r.get("/promotions/store-badges", auth(), getStoreBadges);
export default r;
