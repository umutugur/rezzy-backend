// src/routes/restaurant.panel.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { listReservationsForRestaurant, getInsightsForRestaurant } from "../controllers/restaurant.panel.controller.js";

const r = Router();

// Restoran panel endpointleri (restoran sahibi veya admin)
r.get("/:rid/reservations", auth(), allow("restaurant", "admin"), listReservationsForRestaurant);
r.get("/:rid/insights",     auth(), allow("restaurant", "admin"), getInsightsForRestaurant);

export default r;
