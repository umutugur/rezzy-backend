// src/controllers/taxiDriver.controller.js
import TaxiDriver from "../models/TaxiDriver.js";
import TaxiRide from "../models/TaxiRide.js";
import { emitRideStatusChange } from "../sockets/taxi.socket.js";
import dayjs from "dayjs";

let _io = null;
export function setSocketIo(io) {
  _io = io;
}

// ─── POST /api/taxi/driver/register ─────────────────────────────────────────
export async function registerDriver(req, res, next) {
  try {
    const userId = req.user.id;
    const { vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, type = "sedan", licenseNumber } = req.body;

    if (!vehiclePlate || !vehicleBrand || !vehicleModel || !vehicleColor) {
      return res.status(400).json({ message: "Araç bilgileri eksik (plate, brand, model, color)" });
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
      type,
      licenseNumber,
    });

    return res.status(201).json({ message: "Sürücü kaydı oluşturuldu, onay bekleniyor", driver });
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
      { location: { type: "Point", coordinates: [Number(lng), Number(lat)] } },
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
    if (!driver.isAvailable) {
      return res.status(409).json({ message: "Sürücü şu anda müsait değil" });
    }

    ride.driver = driver._id;
    ride.status = "matched";
    ride.matchedAt = new Date();
    await ride.save();

    driver.isAvailable = false;
    driver.activeRide = ride._id;
    await driver.save();

    if (_io) await emitRideStatusChange(_io, ride);

    return res.json({ message: "Yolculuk kabul edildi", ride });
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

    // Sürücü istatistiklerini güncelle
    driver.isAvailable = true;
    driver.activeRide = null;
    driver.totalRides += 1;
    driver.todayEarnings += ride.fare;
    driver.totalEarnings += ride.fare;
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
      rating: driver.rating,
    });
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
