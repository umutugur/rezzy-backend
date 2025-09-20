import { Router } from "express";
import {
  register,
  login,
  googleLogin,
  appleLogin,
  me,
  updateMe,
  changePassword,
} from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import {
  registerSchema,
  loginSchema,
  googleSchema,
  appleSchema,
} from "../validators/auth.schema.js";
import { auth } from "../middlewares/auth.js";

const r = Router();

// Giriş / Kayıt
r.post("/register", validate(registerSchema), register);
r.post("/login",    validate(loginSchema),    login);
r.post("/google",   validate(googleSchema),   googleLogin);
r.post("/apple",    validate(appleSchema),    appleLogin);

// Profil (✔️ hepsi /auth altında)
r.get("/me",    auth(true), me);
r.patch("/me",  auth(true), updateMe);

// Şifre değiştir (yalnız password provider için)
r.post("/change-password", auth(true), changePassword);

export default r;
