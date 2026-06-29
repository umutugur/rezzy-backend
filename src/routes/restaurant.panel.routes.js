import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import {
  allowLocationManagerOrAdmin,
} from "../middlewares/roles.js";
import {
  listReservationsForRestaurant,
  getInsightsForRestaurant,
  getTablesLive,
  updateTablesLayout,
  listLiveOrdersForRestaurant,
  getTableDetailForRestaurant,
  closeTableSessionForRestaurant,
  resolveTableServiceRequests,
  notifyOrderReadyForTable,
} from "../controllers/restaurant.panel.controller.js";
import { getRestaurantReportsOverview } from "../controllers/restaurant.reports.controller.js";
import {
  listEligibleCampaigns,
  joinCampaign,
  leaveCampaign,
} from "../controllers/restaurantCampaign.controller.js";

const r = Router();

/**
 * Restoran panel endpointleri
 * Erişim:
 *  - Global admin
 *  - Veya o restoranda restaurantMemberships.role === "location_manager" olan kullanıcı
 *
 * allowLocationManagerOrAdmin("rid") middleware’i:
 *  - req.user.role === "admin" ise direkt geçer
 *  - Değilse req.user.restaurantMemberships içinde
 *      { restaurant: req.params.rid, role: "location_manager" }
 *    kaydı arar.
 */

// Rezervasyon listesi
r.get(
  "/:rid/reservations",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  listReservationsForRestaurant
);

// Insights
r.get(
  "/:rid/insights",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  getInsightsForRestaurant
);

// ✅ Canlı masa görünümü (kat + drag&drop + status)
r.get(
  "/:rid/tables/live",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  getTablesLive
);

// ✅ Masa layout güncelleme (drag & drop sonrası)
r.patch(
  "/:rid/tables/layout",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  updateTablesLayout
);

// ✅ Açık adisyonlara bağlı canlı siparişler
r.get(
  "/:rid/live-orders",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  listLiveOrdersForRestaurant
);

// ✅ Masa detay (adisyon, siparişler, servis istekleri)
r.get(
  "/:rid/tables/:tableKey/detail",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  getTableDetailForRestaurant
);

// ✅ Masa adisyon kapatma
r.post(
  "/:rid/tables/:tableKey/close-session",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  closeTableSessionForRestaurant
);

// ✅ Garson çağır / hesap iste resolved
r.post(
  "/:rid/tables/:tableKey/service/resolve",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  resolveTableServiceRequests
);

// ✅ Self servis: sipariş hazır bildirimi
r.post(
  "/:rid/tables/:tableKey/order-ready",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  notifyOrderReadyForTable
);

// 🔢 Gelişmiş raporlar (overview)
r.get(
  "/:rid/reports/overview",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  getRestaurantReportsOverview
);

// 🎟️ Kampanyalar (coupon opt-in) — restaurant-scoped
r.get(
  "/:rid/campaigns",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  listEligibleCampaigns
);
r.post(
  "/:rid/campaigns/:campaignId/join",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  joinCampaign
);
r.post(
  "/:rid/campaigns/:campaignId/leave",
  auth(),
  allowLocationManagerOrAdmin("rid"),
  leaveCampaign
);

export default r;
