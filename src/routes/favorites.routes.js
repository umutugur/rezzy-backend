// routes/favorites.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  listMyFavorites,
  addFavorite,
  removeFavorite,
  toggleFavorite
} from "../controllers/favorites.controller.js";

const r = Router();

// Tüm favori endpoints authenticated
r.use(auth());

// Liste
r.get("/", listMyFavorites);

// Ekle/Çıkar/Toggle
r.post("/:rid", addFavorite);
r.delete("/:rid", removeFavorite);
r.post("/:rid/toggle", toggleFavorite);

export default r;
