import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { validate } from "../middlewares/validate.js";
import { restaurantKpisSchema } from "../validators/report.schema.js";
import { restaurantKpis } from "../controllers/report.controller.js";


const r = Router();
r.get("/restaurant/:id", auth(), allow("restaurant","admin"), validate(restaurantKpisSchema), restaurantKpis);

export default r;
