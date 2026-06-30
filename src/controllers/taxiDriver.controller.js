// src/controllers/taxiDriver.controller.js
import TaxiDriver from "../models/TaxiDriver.js";
import TaxiRide from "../models/TaxiRide.js";
import TaxiRegionConfig from "../models/TaxiRegionConfig.js";
import User from "../models/User.js";
import { clearTaxiConfigCache, getVehicleTypes } from "../services/taxiPricing.service.js";
import { emitRideStatusChange } from "../sockets/taxi.socket.js";
import { recordRedemptionForOrder } from "../services/promotionsService.js";
import dayjs from "dayjs";

let _io = null;
export function setSocketIo(io) {
  _io = io;
}

// ─── POST /api/taxi/driver/register ─────────────────────────────────────────
export async function registerDriver(req, res, next) {
  try {
    const userId = req.user.id;
    const { vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, vehicleType, acceptsPets = false, licenseNumber, region: bodyRegion } = req.body;

    if (!vehiclePlate || !vehicleBrand || !vehicleModel || !vehicleColor) {
      return res.status(400).json({ message: "Araç bilgileri eksik (plate, brand, model, color)" });
    }

    const user = await User.findById(userId).select("region").lean();
    const region = String(bodyRegion || user?.region || "").toUpperCase();
    const types = await getVehicleTypes(region);
    const key = String(vehicleType || "").toLowerCase();
    if (!types.find((t) => t.key === key)) {
      return res.status(400).json({ message: "Geçersiz araç tipi" });
    }

    const existing = await TaxiDriver.findOne({ user: userId });
    if (existing) {
      return res.status(409).json({ message: "Bu kullanıcı zaten sürücü kayıtlı", driver: existing });
    }

    const plateExists = await TaxiDriver.findOne({ vehiclePlate: vehiclePlate.toUpperCase() });
    if (plateExists) {
      return res.status(409).json({ message: "Bu plaka zaten kayıtlı" });
    }

    const driver = await TaxiDriver.create({
      user: userId,
      vehiclePlate: vehiclePlate.toUpperCase().trim(),
      vehicleBrand: vehicleBrand.trim(),
      vehicleModel: vehicleModel.trim(),
      vehicleColor: vehicleColor.trim(),
      vehicleType: key,
      acceptsPets: acceptsPets === true,
      licenseNumber,
      isApproved: false, // başvuru/onay akışı onaylar (otomatik onay kaldırıldı)
    });

    return res.status(201).json({ message: "Sürücü kaydı oluşturuldu", driver });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/taxi/driver/status ──────────────────────────────────────────
export async function toggleStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const { isOnline } = req.body;

    if (typeof isOnline !== "boolean") {
      return res.status(400).json({ message: "isOnline (boolean) gerekli" });
    }

    const driver = await TaxiDriver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });
    if (!driver.isApproved) return res.status(403).json({ message: "Sürücü hesabı henüz onaylanmadı" });

    driver.isOnline = isOnline;
    driver.isAvailable = isOnline;
    driver.lastSeenAt = new Date();
    await driver.save();

    return res.json({ isOnline: driver.isOnline, isAvailable: driver.isAvailable });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/taxi/driver/location ────────────────────────────────────────
export async function updateLocation(req, res, next) {
  try {
    const userId = req.user.id;
    const { lat, lng } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ message: "lat ve lng gerekli" });
    }

    const driver = await TaxiDriver.findOneAndUpdate(
      { user: userId },
      {
        location: { type: "Point", coordinates: [Number(lng), Number(lat)] },
        lastSeenAt: new Date(),
      },
      { new: true }
    );

    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    // Aktif yolculuğu varsa socket ile yolcuya bildir
    if (_io && driver.activeRide) {
      _io.to(`ride:${driver.activeRide}`).emit("driver:location:update", {
        driverId: driver._id,
        lat: Number(lat),
        lng: Number(lng),
        timestamp: Date.now(),
      });
    }

    return res.json({ lat: Number(lat), lng: Number(lng) });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/taxi/rides/:id/respond ──────────────────────────────────────
export async function respondToRide(req, res, next) {
  try {
    const userId = req.user.id;
    const { action } = req.body; // 'accept' | 'reject'
    const rideId = req.params.id;

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ message: "action: 'accept' veya 'reject' olmalı" });
    }

    const driver = await TaxiDriver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    const ride = await TaxiRide.findById(rideId);
    if (!ride) return res.status(404).json({ message: "Yolculuk bulunamadı" });
    if (ride.status !== "searching") {
      return res.status(409).json({ message: "Bu yolculuk artık müsait değil" });
    }

    if (action === "reject") {
      return res.json({ message: "Yolculuk reddedildi" });
    }

    // Kabul et
    // isOnline değil = gerçekten çevrimdışı
    if (!driver.isOnline) {
      return res.status(409).json({ message: "Sürücü çevrimdışı" });
    }
    // Başka aktif yolculuğu var mı
    if (driver.activeRide) {
      return res.status(409).json({ message: "Sürücünün aktif bir yolculuğu var" });
    }
    // isOnline true ama isAvailable false = socket geçici koptu, resetle
    if (!driver.isAvailable) {
      driver.isAvailable = true;
    }

    ride.driver = driver._id;
    ride.status = "matched";
    ride.matchedAt = new Date();
    await ride.save();

    driver.isAvailable = false;
    driver.activeRide = ride._id;
    await driver.save();

    if (_io) await emitRideStatusChange(_io, ride);

    // Sürücü eşleşti — yolcu haritasından kaldır
    if (_io) {
      _io.to("passengers:map").emit("driver:went_offline", { driverId: driver._id });
    }

    // Yolcuya dönecek yanıta sürücü bilgisini (photoUrl dahil) ekle
    const rideWithDriver = await TaxiRide.findById(ride._id)
      .populate({ path: "driver", populate: { path: "user", select: "name phone" } });

    return res.json({ message: "Yolculuk kabul edildi", ride: rideWithDriver ?? ride });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/taxi/rides/:id/complete ─────────────────────────────────────
export async function completeRide(req, res, next) {
  try {
    const userId = req.user.id;
    const rideId = req.params.id;

    const driver = await TaxiDriver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    const ride = await TaxiRide.findById(rideId);
    if (!ride) return res.status(404).json({ message: "Yolculuk bulunamadı" });
    if (ride.driver?.toString() !== driver._id.toString()) {
      return res.status(403).json({ message: "Bu yolculuk size ait değil" });
    }
    if (ride.status !== "inProgress") {
      return res.status(409).json({ message: "Yolculuk henüz başlamadı ya da zaten tamamlandı" });
    }

    ride.status = "completed";
    ride.completedAt = new Date();
    ride.paymentStatus = "paid";
    await ride.save();

    // Kupon ancak yolculuk gerçekten tamamlandığında "kullanılmış" sayılır:
    // bütçe ve kullanıcı kuponu burada düşülür (idempotent). İptal/başarısız
    // yolculuklar kuponu yakmaz.
    if (ride.couponCampaign && ride.discount > 0) {
      try {
        await recordRedemptionForOrder({
          campaign: ride.couponCampaign,
          user: ride.passenger,
          surface: "taxi",
          orderRef: ride._id,
          gross: ride.grossFare ?? ride.fare,
          discount: ride.discount,
          platformContribution: ride.platformContribution ?? 0,
          businessContribution: ride.businessContribution ?? 0,
          paymentMethod: ride.paymentMethod,
          region: ride.region,
        });
      } catch (e) {
        console.error("[completeRide] coupon redemption error:", e.message);
      }
    }

    // Sürücü istatistiklerini güncelle. Sürücü brüt ücreti hak eder (kupon
    // indirimini platform karşılar) — indirimli müşteri ücreti değil.
    const driverEarned = ride.driverEarning ?? ride.grossFare ?? ride.fare;
    driver.isAvailable = true;
    driver.activeRide = null;
    driver.totalRides += 1;
    driver.todayEarnings += driverEarned;
    driver.totalEarnings += driverEarned;
    await driver.save();

    if (_io) await emitRideStatusChange(_io, ride);

    return res.json({ message: "Yolculuk tamamlandı", ride });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/driver/earnings ──────────────────────────────────────────
export async function getEarnings(req, res, next) {
  try {
    const userId = req.user.id;
    const driver = await TaxiDriver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    const now = dayjs();
    const todayStart = now.startOf("day").toDate();
    const weekStart = now.startOf("week").toDate();

    const [todayRides, weekRides] = await Promise.all([
      TaxiRide.find({
        driver: driver._id,
        status: "completed",
        completedAt: { $gte: todayStart },
      }),
      TaxiRide.find({
        driver: driver._id,
        status: "completed",
        completedAt: { $gte: weekStart },
      }),
    ]);

    const todayEarnings = todayRides.reduce((sum, r) => sum + (r.fare ?? 0), 0);
    const weekEarnings = weekRides.reduce((sum, r) => sum + (r.fare ?? 0), 0);

    return res.json({
      todayRideCount: todayRides.length,
      todayEarnings,
      weekRideCount: weekRides.length,
      weekEarnings,
      totalRides: driver.totalRides,
      totalEarnings: driver.totalEarnings,
      averageRating: driver.rating,
      ratingCount: driver.ratingCount ?? 0,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/driver/rides ─────────────────────────────────────────────
export async function getDriverRides(req, res, next) {
  try {
    const userId = req.user.id;
    const driver = await TaxiDriver.findOne({ user: userId });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    const { cursor, limit = 20 } = req.query;
    const pageLimit = Math.min(Number(limit), 50);

    const filter = {
      driver: driver._id,
      status: { $in: ["completed", "cancelled"] },
    };
    if (cursor) filter._id = { $lt: cursor };

    const rides = await TaxiRide.find(filter)
      .populate("passenger", "name")
      .sort({ _id: -1 })
      .limit(pageLimit + 1);

    const hasMore = rides.length > pageLimit;
    const items = hasMore ? rides.slice(0, pageLimit) : rides;
    const nextCursor = hasMore ? items[items.length - 1]._id.toString() : null;

    return res.json({ rides: items, nextCursor });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/taxi/drivers ─────────────────────────────────────────────
export async function adminListDrivers(req, res, next) {
  try {
    const { isApproved, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (isApproved !== undefined) filter.isApproved = isApproved === "true";

    const skip = (Number(page) - 1) * Number(limit);
    const [drivers, total] = await Promise.all([
      TaxiDriver.find(filter)
        .populate("user", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      TaxiDriver.countDocuments(filter),
    ]);

    return res.json({ drivers, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/admin/taxi/drivers/:id/approve ───────────────────────────────
export async function adminApproveDriver(req, res, next) {
  try {
    const { id } = req.params;
    const driver = await TaxiDriver.findByIdAndUpdate(
      id,
      { isApproved: true },
      { new: true }
    ).populate("user", "name email");

    if (!driver) return res.status(404).json({ message: "Sürücü bulunamadı" });

    return res.json({ message: "Sürücü onaylandı", driver });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/admin/taxi/drivers/:id/reject ────────────────────────────────
export async function adminRejectDriver(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const driver = await TaxiDriver.findByIdAndUpdate(
      id,
      { isApproved: false, rejectionReason: reason ?? "Admin tarafından reddedildi" },
      { new: true }
    ).populate("user", "name email");

    if (!driver) return res.status(404).json({ message: "Sürücü bulunamadı" });

    return res.json({ message: "Sürücü reddedildi", driver });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/taxi/rides ───────────────────────────────────────────────
export async function adminListTaxiRides(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [rides, total] = await Promise.all([
      TaxiRide.find(filter)
        .populate("passenger", "name phone")
        .populate({ path: "driver", populate: { path: "user", select: "name phone" } })
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      TaxiRide.countDocuments(filter),
    ]);

    return res.json({ rides, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/market/orders ────────────────────────────────────────────
export async function adminListMarketOrders(req, res, next) {
  try {
    const MarketOrder = (await import("../models/MarketOrder.js")).default;
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      MarketOrder.find(filter)
        .populate("customer", "name phone")
        .populate("store", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      MarketOrder.countDocuments(filter),
    ]);

    return res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/delivery/orders ─────────────────────────────────────────
export async function adminListDeliveryOrders(req, res, next) {
  try {
    const DeliveryOrder = (await import("../models/DeliveryOrder.js")).default;
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      DeliveryOrder.find(filter)
        .populate("restaurantId", "name")
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      DeliveryOrder.countDocuments(filter),
    ]);

    return res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/admin/taxi/config ──────────────────────────────────────────────
export async function adminListTaxiConfigs(req, res, next) {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    const configs = await TaxiRegionConfig.find().sort({ region: 1 }).lean();
    res.json({ configs });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/admin/taxi/config/:region ──────────────────────────────────────
export async function adminUpsertTaxiConfig(req, res, next) {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Forbidden" });
    const region = String(req.params.region || "").toUpperCase();
    if (!region) return res.status(400).json({ message: "region required" });
    const { dispatchRadiusKm, commissionRate, tariffs, isActive, vehicleTypes, nightTariff, petAddon, timezone } = req.body || {};
    const update = {};
    if (dispatchRadiusKm != null) update.dispatchRadiusKm = Number(dispatchRadiusKm);
    if (commissionRate != null) update.commissionRate = Number(commissionRate);
    if (tariffs != null) update.tariffs = tariffs;
    if (isActive != null) update.isActive = !!isActive;
    if (vehicleTypes != null) update.vehicleTypes = vehicleTypes;
    if (nightTariff != null) update.nightTariff = nightTariff;
    if (petAddon != null) update.petAddon = petAddon;
    if (timezone != null) update.timezone = timezone;
    const config = await TaxiRegionConfig.findOneAndUpdate(
      { region },
      { $set: update, $setOnInsert: { region } },
      { new: true, upsert: true, runValidators: true }
    );
    clearTaxiConfigCache();
    res.json({ config });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/driver/me ─────────────────────────────────────────────────
export async function getDriverProfile(req, res, next) {
  try {
    const driver = await TaxiDriver.findOne({ user: req.user.id }).populate("user", "name phone email");
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });
    return res.json(driver);
  } catch (err) {
    next(err);
  }
}
