// src/controllers/taxi.controller.js
import Stripe from "stripe";
import TaxiRide from "../models/TaxiRide.js";
import TaxiDriver from "../models/TaxiDriver.js";
import { calculateFare, estimateFareForRegion, getDispatchRadiusM, getVehicleTypes, isNightNow, getPetAddon } from "../services/taxiPricing.service.js";
import User from "../models/User.js";
import { getRouteInfo, searchPlaces, geocodeAddress } from "../services/places.service.js";
import { emitNewRideRequest, emitRideStatusChange } from "../sockets/taxi.socket.js";
import { sendExpoPush } from "../utils/expoPush.js";
import Campaign from "../models/Campaign.js";
import UserCoupon from "../models/UserCoupon.js";
import CouponRedemption from "../models/CouponRedemption.js";
import { evaluateForOrder, reverseRedemptionForOrder } from "../services/promotionsService.js";

const KNOWN_REGIONS = new Set(["TR", "CY", "UK", "US"]);
function normalizeRegion(value) {
  const r = String(value ?? "").trim().toUpperCase();
  return KNOWN_REGIONS.has(r) ? r : null;
}


const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })
  : null;

// io referansını uygulama başladığında inject ederiz
let _io = null;
export function setSocketIo(io) {
  _io = io;
}

// ─── POST /api/taxi/estimate ─────────────────────────────────────────────────
export async function estimateFare(req, res, next) {
  try {
    const { pickup, dropoff, vehicleType = "ride" } = req.body;

    if (
      !pickup?.coordinates?.[0] ||
      !pickup?.coordinates?.[1] ||
      !dropoff?.coordinates?.[0] ||
      !dropoff?.coordinates?.[1]
    ) {
      return res.status(400).json({ message: "pickup ve dropoff koordinatları gerekli" });
    }

    const origin = {
      lat: pickup.coordinates[1],
      lng: pickup.coordinates[0],
    };
    const destination = {
      lat: dropoff.coordinates[1],
      lng: dropoff.coordinates[0],
    };

    const { distanceKm, durationMin, geometry } = await getRouteInfo(origin, destination);

    // Region-aware fare (falls back to hardcoded tariffs when no DB config exists)
    const passengerUser = await User.findById(req.user.id).select("region").lean();
    const region = normalizeRegion(req.body?.region) ?? passengerUser?.region ?? null;
    const petRequested = req.body?.petRequested === true;
    const { fare, isNight } = await estimateFareForRegion(region, vehicleType, distanceKm, { petRequested });

    let discount = 0;
    const couponCampaignId = req.body?.couponCampaignId;
    if (couponCampaignId) {
      const campaign = await Campaign.findById(couponCampaignId);
      const held = campaign
        ? await UserCoupon.findOne({ user: req.user.id, campaign: campaign._id, status: "active" })
        : null;
      if (campaign && held) {
        const r = await evaluateForOrder({
          campaign,
          user: req.user.id,
          base: fare,
          deliveryFee: 0,
          surface: "taxi",
          region,
          paymentMethod: req.body?.paymentMethod || "online",
          storeId: null,
          storeCategory: vehicleType,
          organizationId: null,
        });
        if (r.eligible) discount = r.discount;
      }
    }

    return res.json({
      fare: +(fare - discount).toFixed(2),
      grossFare: fare,
      discount,
      distanceKm,
      durationMin,
      vehicleType,
      isNight,
      geometry,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/vehicle-types ─────────────────────────────────────────────
export async function getVehicleTypesHandler(req, res, next) {
  try {
    const region =
      normalizeRegion(req.headers?.["x-region"]) ??
      (await User.findById(req.user.id).select("region").lean())?.region ??
      null;
    const [types, nightActiveNow, petAddon] = await Promise.all([
      getVehicleTypes(region),
      isNightNow(region),
      getPetAddon(region),
    ]);
    res.json({
      types: types.map((t) => ({
        key: t.key, name: t.name, icon: t.icon, capacity: t.capacity ?? null,
        description: t.description ?? "", base: t.base, perKm: t.perKm,
      })),
      nightActiveNow,
      petAddon,
    });
  } catch (err) { next(err); }
}

// ─── createRideCore ───────────────────────────────────────────────────────────
// req/res'siz çekirdek yolculuk oluşturma mantığı. `createRide` (POST /api/taxi/rides)
// bunu çağırır; Planlı Taksi süpürme motoru (P2, scheduledRideSweep.js) da aynı
// çekirdeği kullanacak (convert/convert-to-dispatch). Beklenen/iş-kuralı durumları
// (validasyon, aktif yolculuk çakışması, Stripe konfig hatası) throw ETMEZ —
// `{ ok:false, status, body }` döner ki çağıran orijinal response şeklini birebir
// koruyabilsin. Beklenmeyen hatalar (DB vb.) normal şekilde throw edilir.
//
// payload: { user, pickup, dropoff, vehicleType, acceptsPets, paymentMethod, region,
//            couponCampaignId, scheduledRideId, scheduledFee }
// opts:    { assignDriverId } — verilirse yakın sürücü dispatch/push atlanır, yolculuk
//            doğrudan bu sürücüye "matched" olarak atanır (mevcut respondToRide ile aynı desen).
export async function createRideCore(payload, opts = {}) {
  const {
    user: passengerId,
    pickup,
    dropoff,
    vehicleType = "ride",
    acceptsPets = false,
    paymentMethod = "cash",
    region: regionOverride = null,
    couponCampaignId = null,
    scheduledRideId = null,
    scheduledFee = 0,
  } = payload;
  const { assignDriverId = null } = opts;

  if (!pickup?.address || !dropoff?.address) {
    return { ok: false, status: 400, body: { message: "pickup.address ve dropoff.address gerekli" } };
  }

  // Mevcut aktif yolculuk kontrolü
  const existing = await TaxiRide.findOne({
    passenger: passengerId,
    status: { $in: ["searching", "matched", "inProgress"] },
  });
  if (existing) {
    return {
      ok: false,
      status: 409,
      body: { message: "Zaten aktif bir yolculuğunuz var", rideId: existing._id },
    };
  }

  const origin = {
    lat: pickup.coordinates?.[1] ?? 0,
    lng: pickup.coordinates?.[0] ?? 0,
  };
  const destination = {
    lat: dropoff.coordinates?.[1] ?? 0,
    lng: dropoff.coordinates?.[0] ?? 0,
  };

  const { distanceKm, durationMin } = await getRouteInfo(origin, destination);

  // Region-aware fare (falls back to hardcoded tariffs when no DB config exists)
  const passengerUser = await User.findById(passengerId).select("region").lean();
  const region = normalizeRegion(regionOverride) ?? passengerUser?.region ?? null;
  const petRequested = acceptsPets === true;
  const { fare, isNight } = await estimateFareForRegion(region, vehicleType, distanceKm, { petRequested });

  const safePaymentMethod = ["cash", "card", "online"].includes(paymentMethod) ? paymentMethod : "cash";
  const safeScheduledFee = Math.max(0, Number(scheduledFee) || 0);

  let discount = 0, platformContribution = 0, businessContribution = 0, couponCampaign = null;
  if (couponCampaignId) {
    const campaign = await Campaign.findById(couponCampaignId);
    const held = campaign
      ? await UserCoupon.findOne({ user: passengerId, campaign: campaign._id, status: "active" })
      : null;
    if (campaign && held) {
      const r = await evaluateForOrder({
        campaign,
        user: passengerId,
        base: fare,
        deliveryFee: 0,
        surface: "taxi",
        region,
        paymentMethod: safePaymentMethod,
        storeId: null,
        storeCategory: vehicleType,
        organizationId: null,
      });
      if (r.eligible) {
        discount = r.discount;
        platformContribution = r.platformContribution;
        businessContribution = r.businessContribution;
        couponCampaign = campaign._id;
      }
    }
  }
  // customerFare: kupon indirimi sonrası, scheduledFee HARİÇ (komisyon/kupon matrahı = fare/grossFare, değişmez).
  const customerFare = +(fare - discount).toFixed(2);
  // Müşteriye yansıyan toplam tutar: scheduledFee üstüne eklenir (pet eklentisinin `fare`'e
  // eklendiği desenle tutarlı — bkz. taxiPricing.service.js estimateFareForRegion).
  const totalFare = +(customerFare + safeScheduledFee).toFixed(2);

  const ride = await TaxiRide.create({
    passenger: passengerId,
    pickup: {
      address: pickup.address,
      coordinates: pickup.coordinates ?? [0, 0],
    },
    dropoff: {
      address: dropoff.address,
      coordinates: dropoff.coordinates ?? [0, 0],
    },
    vehicleType,
    petRequested,
    isNight,
    distanceKm,
    durationMin,
    fare: totalFare,
    grossFare: fare,
    discount,
    platformContribution,
    businessContribution,
    couponCampaign,
    // scheduledFee komisyon matrahına girmez (grossFare/discount hesabına dahil edilmedi);
    // tamamı sürücü kazancına yazılır (pet eklentisinin fare'e girme deseniyle tutarlı additive yaklaşım).
    driverEarning: +(fare + safeScheduledFee).toFixed(2),
    scheduledRideId,
    scheduledFee: safeScheduledFee,
    region,
    paymentMethod: safePaymentMethod,
    status: assignDriverId ? "matched" : "searching",
  });

  let nearbyDriverIds = [];
  let assignedDriver = null;

  if (assignDriverId) {
    // Planlı Taksi convert: doğrudan atama, dispatch broadcast'i atlanır.
    assignedDriver = await TaxiDriver.findById(assignDriverId);
    if (assignedDriver) {
      ride.driver = assignedDriver._id;
      ride.matchedAt = new Date();
      await ride.save();

      assignedDriver.isAvailable = false;
      assignedDriver.activeRide = ride._id;
      await assignedDriver.save();

      if (_io) await emitRideStatusChange(_io, ride);
    }
  } else {
    // Pickup'a yakın online ve müsait sürücüleri bul
    const dispatchRadiusM = await getDispatchRadiusM(region);

    const nearbyDrivers = await TaxiDriver.find({
      isOnline: true,
      isAvailable: true,
      isApproved: true,
      lastSeenAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
      vehicleType: vehicleType,
      ...(petRequested ? { acceptsPets: true } : {}),
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: pickup.coordinates ?? [0, 0],
          },
          $maxDistance: dispatchRadiusM,
        },
      },
    })
      .populate("user", "pushTokens notificationPrefs")
      .limit(10);

    nearbyDriverIds = nearbyDrivers.map((d) => d._id.toString());

    // NOTE: The coupon redemption (budget.spent + UserCoupon consumption) is NOT
    // recorded here. The discount is computed and stored on the ride above, but the
    // coupon is only *consumed* when the trip completes (see completeRide). This way
    // a cancelled / abandoned / Stripe-failed ride never burns a single-use coupon.

    // Socket event: yakın sürücülere bildir
    if (_io && nearbyDriverIds.length > 0) {
      await emitNewRideRequest(_io, ride, nearbyDriverIds);
    }

    // Push notification: yakın sürücülere bildir (uygulama arka planda olsa bile)
    const driverPushTokens = nearbyDrivers.flatMap((d) => {
      if (d.user?.notificationPrefs?.push === false) return [];
      return (d.user?.pushTokens ?? [])
        .filter((t) => t?.isActive && t?.token)
        .map((t) => t.token);
    });

    if (driverPushTokens.length > 0) {
      sendExpoPush(driverPushTokens, {
        title: "Yeni Taksi Çağrısı 🚖",
        body: `${pickup.address} → ${fare} ₺`,
        data: {
          type: "ride:new_request",
          rideId: String(ride._id),
          pickup: ride.pickup,
          dropoff: ride.dropoff,
          fare: ride.fare,
          vehicleType: ride.vehicleType,
        },
      }).catch((err) => console.error("[createRide] push error:", err.message));
    }
  }

  // ─── Online ödeme: Stripe PaymentIntent (yolculuk başlamadan önce tahsil) ─
  if (safePaymentMethod === "online") {
    if (!stripe) {
      await TaxiRide.findByIdAndDelete(ride._id);
      return { ok: false, status: 500, body: { message: "Stripe konfigüre değil. Online ödeme yapılamıyor." } };
    }

    try {
      const pi = await stripe.paymentIntents.create({
        amount: Math.round(totalFare * 100),
        currency: "try",
        automatic_payment_methods: { enabled: true },
        metadata: {
          kind: "taxi_ride",
          rideId: String(ride._id),
          passengerId: String(passengerId),
          vehicleType,
        },
      });

      ride.stripePaymentIntentId = pi.id;
      await ride.save();

      return {
        ok: true,
        body: {
          ride,
          nearbyDriverCount: nearbyDriverIds.length,
          payment: {
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            amount: totalFare,
            currency: "TRY",
          },
        },
      };
    } catch (stripeErr) {
      console.error("[taxi.createRide] Stripe error", stripeErr);
      await TaxiRide.findByIdAndDelete(ride._id).catch(() => {});
      return { ok: false, status: 500, body: { message: "Ödeme sistemi başlatılamadı. Lütfen tekrar deneyin." } };
    }
  }

  return { ok: true, body: { ride, nearbyDriverCount: nearbyDriverIds.length, payment: null } };
}

// ─── POST /api/taxi/rides ─────────────────────────────────────────────────────
export async function createRide(req, res, next) {
  try {
    const passengerId = req.user.id;
    const { pickup, dropoff, vehicleType = "ride", paymentMethod = "cash" } = req.body;

    const result = await createRideCore({
      user: passengerId,
      pickup,
      dropoff,
      vehicleType,
      acceptsPets: req.body?.petRequested === true,
      paymentMethod,
      region: req.body?.region,
      couponCampaignId: req.body?.couponCampaignId,
    });

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }
    return res.status(201).json(result.body);
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/rides/active ──────────────────────────────────────────────
// Kullanıcının aktif (searching / matched / inProgress) yolculuğunu döndürür.
// Yoksa 404.
export async function getActiveRide(req, res, next) {
  try {
    const passengerId = req.user.id;
    const ride = await TaxiRide.findOne({
      passenger: passengerId,
      status: { $in: ["searching", "matched", "inProgress"] },
    })
      .sort({ requestedAt: -1 })
      .populate("passenger", "name phone")
      .populate({ path: "driver", populate: { path: "user", select: "name phone" } });

    if (!ride) return res.status(404).json({ message: "Aktif yolculuk yok" });
    return res.json(ride);
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/rides/:id ─────────────────────────────────────────────────
export async function getRide(req, res, next) {
  try {
    const ride = await TaxiRide.findById(req.params.id)
      .populate("passenger", "name phone")
      .populate({ path: "driver", populate: { path: "user", select: "name phone" } });

    if (!ride) return res.status(404).json({ message: "Yolculuk bulunamadı" });

    const userId = req.user.id;
    const isPassenger = ride.passenger._id?.toString() === userId;
    const isDriver = ride.driver?.user?._id?.toString() === userId || ride.driver?.user?.toString() === userId;

    if (!isPassenger && !isDriver && req.user.role !== "admin") {
      return res.status(403).json({ message: "Erişim yetkiniz yok" });
    }

    return res.json(ride);
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/taxi/rides/:id/cancel ───────────────────────────────────────
export async function cancelRide(req, res, next) {
  try {
    const { reason } = req.body;
    const ride = await TaxiRide.findById(req.params.id);

    if (!ride) return res.status(404).json({ message: "Yolculuk bulunamadı" });

    if (!["searching", "matched"].includes(ride.status)) {
      return res.status(409).json({ message: "Bu aşamada yolculuk iptal edilemez" });
    }

    ride.status = "cancelled";
    ride.cancelledBy = "passenger";
    ride.cancelReason = reason ?? "Yolcu tarafından iptal edildi";
    await ride.save();

    // Reverse any coupon redemption
    await reverseRedemptionForOrder(ride._id);

    // Sürücü varsa müsait yap
    if (ride.driver) {
      await TaxiDriver.findByIdAndUpdate(ride.driver, {
        isAvailable: true,
        activeRide: null,
      });
    }

    if (_io) await emitRideStatusChange(_io, ride);

    return res.json({ message: "Yolculuk iptal edildi", ride });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/my-rides ──────────────────────────────────────────────────
export async function getMyRides(req, res, next) {
  try {
    const passengerId = req.user.id;
    const { status, limit = 20, page = 1 } = req.query;

    const filter = { passenger: passengerId };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [rides, total] = await Promise.all([
      TaxiRide.find(filter)
        .populate({ path: "driver", populate: { path: "user", select: "name phone" } })
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      TaxiRide.countDocuments(filter),
    ]);

    return res.json({
      rides,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/places/search ─────────────────────────────────────────────
export async function searchPlacesHandler(req, res, next) {
  try {
    const { q, lat, lng } = req.query;
    if (!q) return res.status(400).json({ message: "Arama terimi (q) gerekli" });

    const location = lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
    const results = await searchPlaces(q, location);

    return res.json({ results });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/places/geocode ────────────────────────────────────────────
export async function geocodeAddressHandler(req, res, next) {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ message: "address sorgu parametresi gerekli" });

    const result = await geocodeAddress(address);
    if (!result) {
      return res.status(404).json({ message: "Adres koordinata çevrilemedi" });
    }

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/taxi/rides/:id/rate ──────────────────────────────────────────
export async function rateRide(req, res, next) {
  try {
    const passengerId = req.user.id;
    const { id } = req.params;
    const { passengerRating } = req.body;

    if (!passengerRating || passengerRating < 1 || passengerRating > 5) {
      return res.status(400).json({ message: "Geçersiz puan. 1-5 arasında olmalı." });
    }

    const ride = await TaxiRide.findOne({ _id: id, passenger: passengerId });
    if (!ride) return res.status(404).json({ message: "Yolculuk bulunamadı." });
    if (ride.status !== "completed") {
      return res.status(400).json({ message: "Yalnızca tamamlanan yolculuklar puanlanabilir." });
    }
    if (ride.passengerRating !== null && ride.passengerRating !== undefined) {
      return res.status(409).json({ message: "Bu yolculuk zaten puanlandı." });
    }

    ride.passengerRating = passengerRating;
    await ride.save();

    // Driver average rating güncelle
    if (ride.driver) {
      const driver = await TaxiDriver.findById(ride.driver);
      if (driver) {
        const newCount = (driver.ratingCount || 0) + 1;
        const newRating = ((driver.rating || 5) * (driver.ratingCount || 0) + passengerRating) / newCount;
        driver.rating = Math.round(newRating * 10) / 10;
        driver.ratingCount = newCount;
        await driver.save();
      }
    }

    return res.json({ message: "Puanlama kaydedildi.", passengerRating });
  } catch (err) {
    next(err);
  }
}
