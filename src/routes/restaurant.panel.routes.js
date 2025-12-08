// src/routes/restaurant.panel.routes.js
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import {
  listReservationsForRestaurant,
  getInsightsForRestaurant,
  getTablesLive,
  updateTablesLayout,
  listLiveOrdersForRestaurant,
  getTableDetailForRestaurant,
  closeTableSessionForRestaurant,
  resolveTableServiceRequests,
} from "../controllers/restaurant.panel.controller.js";
import { getRestaurantReportsOverview } from "../controllers/restaurant.reports.controller.js";

const r = Router();

// Restoran panel endpointleri (restoran sahibi veya admin)

// Rezervasyon listesi
r.get(
  "/:rid/reservations",
  auth(),
  allow("restaurant", "admin"),
  listReservationsForRestaurant
);

// Insights
r.get(
  "/:rid/insights",
  auth(),
  allow("restaurant", "admin"),
  getInsightsForRestaurant
);

// ✅ Canlı masa görünümü (kat + drag&drop + status)
r.get(
  "/:rid/tables/live",
  auth(),
  allow("restaurant", "admin"),
  getTablesLive
);

// ✅ Masa layout güncelleme (drag & drop sonrası)
r.patch(
  "/:rid/tables/layout",
  auth(),
  allow("restaurant", "admin"),
  updateTablesLayout
);

// ✅ Açık adisyonlara bağlı canlı siparişler
r.get(
  "/:rid/live-orders",
  auth(),
  allow("restaurant", "admin"),
  listLiveOrdersForRestaurant
);

// ✅ Masa detay (adisyon, siparişler, servis istekleri)
r.get(
  "/:rid/tables/:tableKey/detail",
  auth(),
  allow("restaurant", "admin"),
  getTableDetailForRestaurant
);

// ✅ Masa adisyon kapatma
r.post(
  "/:rid/tables/:tableKey/close-session",
  auth(),
  allow("restaurant", "admin"),
  closeTableSessionForRestaurant
);

// ✅ Garson çağır / hesap iste resolved
r.post(
  "/:rid/tables/:tableKey/service/resolve",
  auth(),
  allow("restaurant", "admin"),
  resolveTableServiceRequests
);
// 🔢 Gelişmiş raporlar (overview)
r.get(
  "/:rid/reports/overview",
  auth(),
  allow("restaurant", "admin"),
  getRestaurantReportsOverview
);

export default r;