import Restaurant from "../models/Restaurant.js";
import UserAddress from "../models/UserAddress.js";

const EARTH_RADIUS_M = 6378137;
const DEFAULT_MAX_RADIUS_M = 20000; // 20km (istersen env ile yönet)

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

    const userPoint = { type: "Point", coordinates: userCoords };

    // 1) Polygon match: DB direct
    const polygonRestaurants = await Restaurant.find({
      isActive: true,
      status: "active",
      "delivery.enabled": true,
      "delivery.serviceArea.type": "polygon",
      "delivery.serviceArea.polygon": {
        $geoIntersects: { $geometry: userPoint },
      },
    })
      .select("name city address phone email logoUrl photos rating priceRange businessType location delivery")
      .lean();

    // 2) Radius match: aday havuzunu max radius ile çek, sonra filtrele
    const maxRadius = Number(process.env.DELIVERY_MAX_RADIUS_METERS || DEFAULT_MAX_RADIUS_M);
    const maxRad = maxRadius / EARTH_RADIUS_M;

    const radiusCandidates = await Restaurant.find({
      isActive: true,
      status: "active",
      "delivery.enabled": true,
      "delivery.serviceArea.type": "radius",
      location: { $geoWithin: { $centerSphere: [userCoords, maxRad] } },
    })
      .select("name city address phone email logoUrl photos rating priceRange businessType location delivery")
      .lean();

    const radiusMatched = [];
    for (const r of radiusCandidates) {
      const center = r?.location?.coordinates;
      const radiusMeters = Number(r?.delivery?.serviceArea?.radiusMeters || 0);
      if (!Array.isArray(center) || center.length !== 2) continue;
      if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) continue;

      const dist = haversineMeters(userCoords, center);
      if (dist <= radiusMeters) {
        radiusMatched.push({ ...r, _distanceMeters: Math.round(dist) });
      }
    }

    // merge + uniq
    const byId = new Map();
    for (const r of [...polygonRestaurants, ...radiusMatched]) {
      byId.set(String(r._id), r);
    }

    const items = Array.from(byId.values()).sort((a, b) => {
      const da = a._distanceMeters ?? 0;
      const db = b._distanceMeters ?? 0;
      return da - db;
    });

    return res.json({
      address: { id: String(addr._id), title: addr.title, coordinates: userCoords },
      items,
    });
  } catch (e) {
    return next(e);
  }
};