import { Router } from "express";
import { register, login, googleLogin, appleLogin } from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.js";
import { registerSchema, loginSchema, googleSchema, appleSchema } from "../validators/auth.schema.js";

const r = Router();
r.post("/register", validate(registerSchema), register);
r.post("/login",    validate(loginSchema),    login);
r.post("/google",   validate(googleSchema),   googleLogin);
r.post("/apple",    validate(appleSchema),    appleLogin);
export default r;
