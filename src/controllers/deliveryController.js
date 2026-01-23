// controllers/deliveryController.js
import Restaurant from "../models/Restaurant.js";
import UserAddress from "../models/UserAddress.js";
import { resolveZoneForRestaurant } from "../utils/deliveryZoneResolver.js";

const EARTH_RADIUS_M = 6378137;
const DEFAULT_MAX_RADIUS_M = 20000;

function assertAuth(req) {
  if (!req.user?.id) throw { status: 401, message: "Unauthorized" };
}

function haversineMeters([lng1, lat1], [lng2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export const listDeliveryRestaurants = async (req, res, next) => {
  try {
    assertAuth(req);

    const userId = req.user.id;
    const { addressId } = req.query;

    if (!addressId) throw { status: 400, message: "addressId is required" };

    const addr = await UserAddress.findOne({ _id: addressId, userId, isActive: true }).lean();
    if (!addr) throw { status: 404, message: "Address not found" };

    const userCoords = addr?.location?.coordinates;
    if (!Array.isArray(userCoords) || userCoords.length !== 2) {
      throw { status: 400, message: "Address location is invalid" };
    }

    const maxRadius = Number(process.env.DELIVERY_MAX_RADIUS_METERS || DEFAULT_MAX_RADIUS_M);
    const maxRad = maxRadius / EARTH_RADIUS_M;

    // 1) Konuma göre aday havuz (hex için de buna ihtiyacın var)
    const candidates = await Restaurant.find({
      isActive: true,
      status: "active",
      "delivery.enabled": true,
      location: { $geoWithin: { $centerSphere: [userCoords, maxRad] } },
    })
      .select("name city address phone email logoUrl photos rating priceRange businessType location delivery")
      .lean();

    // 2) Hex zone resolve ile filtrele
    const items = [];
    for (const r of candidates) {
      const center = r?.location?.coordinates;
      if (!Array.isArray(center) || center.length !== 2) continue;

      // backend authoritative zone check
      const out = await resolveZoneForRestaurant({
        restaurantId: String(r._id),
        customerLocation: userCoords,
        hexId: null,
      });

      if (!out.ok) continue;
      if (!out.zone?.isActive) continue;

      const dist = haversineMeters(userCoords, center);

      // controllers/deliveryController.js (listDeliveryRestaurants içinde)
items.push({
  _id: String(r._id),
  name: r.name,
  city: r.city ?? null,
  address: r.address ?? null,
  photos: Array.isArray(r.photos) ? r.photos : [],
  rating: typeof r.rating === "number" ? r.rating : null,
  region: r.region ?? null,

  // delivery meta (frontend'in beklediği alanlar)
  deliveryActive: true,
  deliveryMinOrderAmount: Number(out.zone.minOrderAmount ?? 0),
  deliveryEtaMin: Number(r?.delivery?.etaMin ?? 0) || null,   // yoksa null
  deliveryEtaMax: Number(r?.delivery?.etaMax ?? 0) || null,   // yoksa null
  distanceKm: Number((dist / 1000).toFixed(2)),
  deliveryFee: Number(out.zone.feeAmount ?? 0),

  // order tarafı için ayrıca lazım olabilir
  deliveryZone: {
    id: out.zone.id,
    name: out.zone.name || null,
    minOrderAmount: out.zone.minOrderAmount,
    feeAmount: out.zone.feeAmount,
  },
});
    }

    items.sort((a, b) => (a._distanceMeters ?? 0) - (b._distanceMeters ?? 0));

    return res.json({
      address: { id: String(addr._id), title: addr.title, coordinates: userCoords },
      items,
    });
  } catch (e) {
    return next(e);
  }
};
