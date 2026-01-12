// src/controllers/deliveryZoneController.js
import { resolveZoneForRestaurant } from "../utils/deliveryZoneResolver.js";

export async function resolveDeliveryZone(req, res, next) {
  try {
    const { restaurantId, customerLocation, hexId } = req.body || {};
    const out = await resolveZoneForRestaurant({ restaurantId, customerLocation, hexId });

    if (!out.ok) {
      return res.json({
        ok: false,
        reason: out.reason,
        hexId: out.hexId,
        zoneId: null,
        isActive: false,
        minOrderAmount: out.defaults?.minOrderAmount ?? 0,
        feeAmount: out.defaults?.feeAmount ?? 0,
      });
    }

    return res.json({
      ok: true,
      reason: null,
      hexId: out.hexId,
      zoneId: out.zone.id,
      isActive: out.zone.isActive,
      minOrderAmount: out.zone.minOrderAmount,
      feeAmount: out.zone.feeAmount,
      zoneName: out.zone.name,
    });
  } catch (e) {
    return next(e);
  }
}