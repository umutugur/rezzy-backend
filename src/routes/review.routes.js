// rezzy-backend/src/routes/review.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { listReviews, submitReview } from "../controllers/review.controller.js";

const r = Router();

// Herkes okuyabilir (opsiyonel auth — giriş yapmışsa userReview döner)
r.get("/reviews/:entityType/:entityId", auth(false), listReviews);

// Sadece giriş yapmış kullanıcılar yorum yapabilir
r.post("/reviews/:entityType/:entityId", auth(), submitReview);

export default r;
