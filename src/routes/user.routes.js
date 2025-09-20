// routes/user.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import multer from "multer";
import { getMe, updateMe, uploadAvatar, changePassword } from "../controllers/user.controller.js";

const r = Router();
const upload = multer(); // memory storage

r.get("/me", auth(), getMe);
r.patch("/me", auth(), updateMe);
r.post("/me/avatar", auth(), upload.single("file"), uploadAvatar);
r.post("/change-password", auth(), changePassword);

export default r;
