import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import rateLimit from "express-rate-limit";
import menuRoutes from "./routes/menu.routes.js";
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
import { stripeWebhook } from "./controllers/stripe.webhook.controller.js";
import ordersRoutes from "./routes/orders.routes.js";
import tableServiceRoutes from "./routes/tableService.routes.js";
import { initIntentEmbeddings } from "./ai/intentClassifier.js";
import assistantRoutes from "./routes/assistant.routes.js";
import qrPosterRoutes from "./routes/qrPoster.routes.js";
import orgRoutes from "./routes/org.js";
import orgAnalyticsRoutes from "./routes/org.analytics.routes.js";
import addressRoutes from "./routes/address.js";
import deliveryRoutes from "./routes/delivery.js";
import bannersRoutes from "./routes/banners.routes.js";
import adminBannersRoutes from "./routes/admin.banners.routes.js";

// ✅ NEW: Delivery panel routes (desktop delivery orders)
import deliveryPanelRoutes from "./routes/deliveryOrders.panel.routes.js";

dotenv.config();
const app = express();

app.use(helmet());

const corsAll = cors({
  credentials: true,
  origin: (_origin, cb) => cb(null, true),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: "*",
  exposedHeaders: ["Content-Disposition"],
});

app.use(corsAll);

// ✅ Stripe webhook (raw body, JSON parser'dan ÖNCE!)
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());
app.use(morgan("dev"));

initIntentEmbeddings()
  .then(() => console.log("[intent] hazır ✅"))
  .catch((err) => console.error("[intent] init hata:", err));

// Rate limits
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
const checkinLimiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use("/api/auth", authLimiter);
app.use("/api/reservations/checkin", checkinLimiter);

// Public restoran endpointleri (mobil app burayı kullanacak)
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/restaurants", menuRoutes);

// Panel / admin restoran endpointleri
app.use("/api/panel/restaurants", panelRoutes);
app.use("/api/panel/restaurants", menuRoutes);

// ✅ NEW: Delivery orders panel endpoints
// GET  /api/panel/restaurants/:rid/delivery-orders
// POST /api/panel/restaurants/:rid/delivery-orders/:orderId/accept
// ...
app.use("/api/panel/restaurants", deliveryPanelRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/reservations", reservationRoutes);
app.use("/api/orders", ordersRoutes);

// Panel — orders (cancel, future panel-specific order actions)
app.use("/api/panel/restaurants", ordersRoutes);

app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/me/favorites", favoritesRoutes);
app.use("/api/table-service", tableServiceRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api", qrPosterRoutes);

app.use("/api/org", orgRoutes);
app.use("/api/org-analytics", orgAnalyticsRoutes);

// adress control and delivery
app.use("/api/addresses", addressRoutes);
app.use("/api/delivery", deliveryRoutes);

//Banner
app.use("/api", bannersRoutes);
app.use("/api/admin", adminBannersRoutes);

// 404 & error aynı kalsın
app.use((req, res) => res.status(404).json({ message: "Not found" }));
app.use(errorHandler);

export default app;