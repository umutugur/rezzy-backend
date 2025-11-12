import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.routes.js";
import restaurantRoutes from "./routes/restaurant.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import reportRoutes from "./routes/report.routes.js";
import { errorHandler } from "./middlewares/error.js";
import panelRoutes from "./routes/restaurant.panel.routes.js";
import adminRoutes from "./routes/admin.js";
import userRoutes from "./routes/user.routes.js";
import jobsRouter from "./routes/jobs.js";
import notificationsRouter from "./routes/notifications.js";
import favoritesRoutes from "./routes/favorites.routes.js";
dotenv.config();
const app = express();

app.use(helmet());
const origins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// src/app.js
app.use(cors({
  origin: (process.env.CORS_ORIGIN || "").split(",").map(s=>s.trim()).filter(Boolean),
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["*"],   // ⬅️ önemli
  exposedHeaders: ["Content-Disposition"],
}));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit:"12mb" }));
app.use(cookieParser());
app.use(morgan("dev"));


// Rate limits
const authLimiter = rateLimit({ windowMs: 10*60*1000, max: 100, standardHeaders: true, legacyHeaders: false });
const checkinLimiter = rateLimit({ windowMs: 60*1000, max: 60 });
app.use("/api/auth", authLimiter);
app.use("/api/reservations/checkin", checkinLimiter);

// Rotalar

// Public restoran endpointleri (mobil app burayı kullanacak)
app.use("/api/restaurants", restaurantRoutes);

// Panel / admin restoran endpointleri
app.use("/api/panel/restaurants", panelRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/me/favorites", favoritesRoutes);

// 404 & error aynı kalsın
app.use((req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler);

export default app;
