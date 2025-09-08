import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { validate } from "../middlewares/validate.js";
import { createRestaurantSchema, listRestaurantsSchema, getRestaurantSchema, createMenuSchema } from "../validators/restaurant.schema.js";
import { createRestaurant, listRestaurants, getRestaurant, createMenu } from "../controllers/restaurant.controller.js";

const r = Router();
r.get("/", validate(listRestaurantsSchema), listRestaurants);
r.get("/:id", validate(getRestaurantSchema), getRestaurant);
r.post("/", auth(), allow("restaurant","admin"), validate(createRestaurantSchema), createRestaurant);
r.post("/:id/menus", auth(), allow("restaurant","admin"), validate(createMenuSchema), createMenu);

export default r;
