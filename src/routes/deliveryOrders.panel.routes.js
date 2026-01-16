import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allowLocationManagerOrAdmin } from "../middlewares/roles.js";
import {
  panelListDeliveryOrders,
  panelAcceptDeliveryOrder,
  panelSetOnTheWay,
  panelSetDelivered,
  panelCancelDeliveryOrder,
} from "../controllers/deliveryOrders.panel.controller.js";

const router = Router({ mergeParams: true });

// mount: /api/panel/restaurants/:rid
router.get("/:rid/delivery-orders", auth(), allowLocationManagerOrAdmin("rid"), panelListDeliveryOrders);

router.post("/:rid/delivery-orders/:orderId/accept", auth(), allowLocationManagerOrAdmin("rid"), panelAcceptDeliveryOrder);
router.post("/:rid/delivery-orders/:orderId/on-the-way", auth(), allowLocationManagerOrAdmin("rid"), panelSetOnTheWay);
router.post("/:rid/delivery-orders/:orderId/delivered", auth(), allowLocationManagerOrAdmin("rid"), panelSetDelivered);
router.post("/:rid/delivery-orders/:orderId/cancel", auth(), allowLocationManagerOrAdmin("rid"), panelCancelDeliveryOrder);

export default router;