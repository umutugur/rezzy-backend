// src/controllers/taxi.controller.js
import Stripe from "stripe";
import TaxiRide from "../models/TaxiRide.js";
import TaxiDriver from "../models/TaxiDriver.js";
import { calculateFare } from "../services/taxiPricing.service.js";
import { getRouteInfo, searchPlaces, geocodeAddress } from "../services/places.service.js";
import { emitNewRideRequest, emitRideStatusChange } from "../sockets/taxi.socket.js";

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

    const { distanceKm, durationMin } = await getRouteInfo(origin, destination);
    const fare = calculateFare(vehicleType, distanceKm);

    return res.json({ fare, distanceKm, durationMin, vehicleType });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/taxi/rides ─────────────────────────────────────────────────────
export async function createRide(req, res, next) {
  try {
    const passengerId = req.user.id;
    const { pickup, dropoff, vehicleType = "ride", paymentMethod = "cash" } = req.body;

    if (!pickup?.address || !dropoff?.address) {
      return res.status(400).json({ message: "pickup.address ve dropoff.address gerekli" });
    }

    // Mevcut aktif yolculuk kontrolü
    const existing = await TaxiRide.findOne({
      passenger: passengerId,
      status: { $in: ["searching", "matched", "inProgress"] },
    });
    if (existing) {
      return res.status(409).json({ message: "Zaten aktif bir yolculuğunuz var", rideId: existing._id });
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
    const fare = calculateFare(vehicleType, distanceKm);

    const safePaymentMethod = ["cash", "card", "online"].includes(paymentMethod) ? paymentMethod : "cash";

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
      distanceKm,
      durationMin,
      fare,
      paymentMethod: safePaymentMethod,
      status: "searching",
    });

    // Pickup'a yakın online ve müsait sürücüleri bul (5 km)
    const vehicleTypeMap = {
      ride: "sedan",
      xl: "van",
      lux: "luxury",
      pet: "pet",
    };

    const nearbyDrivers = await TaxiDriver.find({
      isOnline: true,
      isAvailable: true,
      isApproved: true,
      type: vehicleTypeMap[vehicleType] ?? "sedan",
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: pickup.coordinates ?? [0, 0],
          },
          $maxDistance: 5000, // 5 km
        },
      },
    }).limit(10);

    const nearbyDriverIds = nearbyDrivers.map((d) => d._id.toString());

    // Socket event: yakın sürücülere bildir
    if (_io && nearbyDriverIds.length > 0) {
      await emitNewRideRequest(_io, ride, nearbyDriverIds);
    }

    // ─── Online ödeme: Stripe PaymentIntent (yolculuk başlamadan önce tahsil) ─
    if (safePaymentMethod === "online") {
      if (!stripe) {
        await TaxiRide.findByIdAndDelete(ride._id);
        return res.status(500).json({ message: "Stripe konfigüre değil. Online ödeme yapılamıyor." });
      }

      try {
        const pi = await stripe.paymentIntents.create({
          amount: Math.round(fare * 100),
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

        return res.status(201).json({
          ride,
          nearbyDriverCount: nearbyDriverIds.length,
          payment: {
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            amount: fare,
            currency: "TRY",
          },
        });
      } catch (stripeErr) {
        console.error("[taxi.createRide] Stripe error", stripeErr);
        await TaxiRide.findByIdAndDelete(ride._id).catch(() => {});
        return res.status(500).json({ message: "Ödeme sistemi başlatılamadı. Lütfen tekrar deneyin." });
      }
    }

    return res.status(201).json({ ride, nearbyDriverCount: nearbyDriverIds.length, payment: null });
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
