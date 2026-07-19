// src/controllers/scheduledRide.controller.js
//
// Planlı Taksi — müşteri/sürücü API'leri + rezervasyon hook helper'ları
// (createScheduledRideFromPayload / activateScheduledRideForReservation /
// cancelScheduledRideForReservation) reservation.controller.js ve
// restaurant.controller.js'ten çağrılır. Spec: §3, §4.
import ScheduledRide from "../models/ScheduledRide.js";
import TaxiDriver from "../models/TaxiDriver.js";
import TaxiRide from "../models/TaxiRide.js";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";
import { getRouteInfo } from "../services/places.service.js";
import { estimateFareForRegion, getScheduledRideConfig } from "../services/taxiPricing.service.js";
import { notifyUser } from "../services/notification.service.js";
import { suggestPickupAt, validatePickupAt } from "../services/scheduledRide.helpers.js";
import { runScheduledRideSweep } from "../services/scheduledRideSweep.js";

const KNOWN_REGIONS = new Set(["TR", "CY", "UK", "US"]);
function normalizeRegion(value) {
  const r = String(value ?? "").trim().toUpperCase();
  return KNOWN_REGIONS.has(r) ? r : null;
}

const EDITABLE_STATUSES = ["pending_reservation", "scheduled", "claimed"];
const EDIT_CUTOFF_MS = 30 * 60 * 1000;
const RELEASE_LATE_MS = 60 * 60 * 1000;
const CLAIM_CONFLICT_WINDOW_MS = 45 * 60 * 1000;

function restaurantDropoff(restaurant) {
  const coords = Array.isArray(restaurant?.location?.coordinates) ? restaurant.location.coordinates : [0, 0];
  const lng = typeof coords[0] === "number" ? coords[0] : 0;
  const lat = typeof coords[1] === "number" ? coords[1] : 0;
  const address = [restaurant?.name, restaurant?.address].filter(Boolean).join(" — ") || restaurant?.name || "Restoran";
  return { lat, lng, address };
}

/* ------------------------------------------------------------------ */
/* --------------------- REZERVASYON HOOK HELPER'LARI ----------------- */
/* ------------------------------------------------------------------ */

/**
 * Rezervasyon oluşturulurken client'tan gelen `scheduledRide` payload'ını işler.
 * Quote SUNUCUDA yeniden hesaplanır — istemci değerine güvenilmez. Hata durumunda
 * (geçersiz pickupAt vb.) sessizce null döner; rezervasyonun kendisi bloklanmaz.
 * @param {{reservation: any, userId: string, payload: any}} args
 */
export async function createScheduledRideFromPayload({ reservation, userId, payload }) {
  if (!payload || typeof payload !== "object") return null;
  const { pickup, vehicleType = "ride", acceptsPets = false, pickupAt: pickupAtRaw } = payload;

  if (!pickup?.address || typeof pickup?.lat !== "number" || typeof pickup?.lng !== "number") {
    console.warn("[scheduledRide] geçersiz pickup, plan oluşturulmadı");
    return null;
  }

  const pickupAt = pickupAtRaw ? new Date(pickupAtRaw) : null;
  if (!pickupAt || Number.isNaN(pickupAt.getTime())) {
    console.warn("[scheduledRide] geçersiz pickupAt, plan oluşturulmadı");
    return null;
  }

  const now = new Date();
  const validationError = validatePickupAt(pickupAt, reservation.dateTimeUTC, now);
  if (validationError) {
    console.warn(`[scheduledRide] pickupAt doğrulaması başarısız: ${validationError}`);
    return null;
  }

  const restaurant = await Restaurant.findById(reservation.restaurantId).select("name address location region").lean();
  if (!restaurant) return null;
  const dropoff = restaurantDropoff(restaurant);

  const { distanceKm } = await getRouteInfo({ lat: pickup.lat, lng: pickup.lng }, { lat: dropoff.lat, lng: dropoff.lng });

  const user = await User.findById(userId).select("region").lean();
  const region = normalizeRegion(restaurant.region) ?? normalizeRegion(user?.region) ?? null;
  const petRequested = acceptsPets === true;

  const { fare } = await estimateFareForRegion(region, vehicleType, distanceKm, {
    when: pickupAt,
    petRequested,
  });
  const { fee: scheduledFee } = await getScheduledRideConfig(region);

  try {
    return await ScheduledRide.create({
      user: userId,
      reservationId: reservation._id,
      region,
      pickupAt,
      pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address },
      dropoff,
      vehicleType: String(vehicleType).toLowerCase(),
      acceptsPets: petRequested,
      estimatedFare: fare,
      scheduledFee,
      status: "pending_reservation",
    });
  } catch (err) {
    if (err?.code === 11000) return null; // reservationId unique çakışması — sessizce yok say
    console.error("[scheduledRide] oluşturma hatası:", err.message);
    return null;
  }
}

/**
 * Rezervasyon onaylandığında (approveReservation + panel confirm yolu) çağrılır.
 * Bağlı plan varsa pending_reservation→scheduled + yolcu push + bölge sürücülerine broadcast.
 */
export async function activateScheduledRideForReservation(reservationId) {
  const plan = await ScheduledRide.findOneAndUpdate(
    { reservationId, status: "pending_reservation" },
    { $set: { status: "scheduled" } },
    { new: true }
  );
  if (!plan) return null;

  await notifyUser(plan.user, {
    i18n: { key: "scheduled_ride_active", vars: { dateTime: plan.pickupAt } },
    data: { type: "scheduled_ride_active", scheduledRideId: String(plan._id) },
    key: `sched:active:${plan._id}`,
    type: "scheduled_ride_active",
  }).catch((e) => console.warn("[scheduledRide] notify active warn:", e.message));

  try {
    const driverFilter = { isApproved: true, vehicleType: plan.vehicleType };
    if (plan.acceptsPets) driverFilter.acceptsPets = true;
    const drivers = await TaxiDriver.find(driverFilter).select("user").populate("user", "region");
    const regionDrivers = plan.region ? drivers.filter((d) => normalizeRegion(d.user?.region) === plan.region) : drivers;

    await Promise.all(
      regionDrivers
        .filter((d) => d.user?._id)
        .map((d) =>
          notifyUser(d.user._id, {
            i18n: { key: "scheduled_ride_driver_new_board", vars: { dateTime: plan.pickupAt } },
            data: { type: "scheduled_ride_driver_new_board", scheduledRideId: String(plan._id) },
            key: `sched:board:${plan._id}:${d._id}`,
            type: "scheduled_ride_driver_new_board",
          }).catch(() => {})
        )
    );
  } catch (e) {
    console.warn("[scheduledRide] board broadcast warn:", e.message);
  }

  return plan;
}

/**
 * Rezervasyon iptal/red edildiğinde (cancelReservation, rejectReservation, panel
 * updateReservationStatus'un cancelled dalı) çağrılır. Bağlı plan → cancelled;
 * converted ise bağlı TaxiRide de mevcut iptal akışıyla iptal edilir.
 */
export async function cancelScheduledRideForReservation(reservationId) {
  const plan = await ScheduledRide.findOne({ reservationId }).lean();
  if (!plan) return null;
  if (["cancelled", "failed"].includes(plan.status)) return plan;

  const updated = await ScheduledRide.findOneAndUpdate(
    { _id: plan._id, status: plan.status },
    { $set: { status: "cancelled" } },
    { new: true }
  );
  if (!updated) return null;

  if (plan.status === "converted" && plan.rideId) {
    const ride = await TaxiRide.findById(plan.rideId);
    if (ride && ["searching", "matched"].includes(ride.status)) {
      ride.status = "cancelled";
      ride.cancelledBy = "system";
      ride.cancelReason = "Rezervasyon iptal edildi";
      await ride.save();
      if (ride.driver) {
        await TaxiDriver.findByIdAndUpdate(ride.driver, { isAvailable: true, activeRide: null }).catch(() => {});
      }
    }
  }

  await notifyUser(updated.user, {
    i18n: { key: "scheduled_ride_cancelled_by_reservation" },
    data: { type: "scheduled_ride_cancelled_by_reservation", scheduledRideId: String(updated._id) },
    key: `sched:cancelledByReservation:${updated._id}`,
    type: "scheduled_ride_cancelled_by_reservation",
  }).catch(() => {});

  if (plan.claimedBy) {
    const driver = await TaxiDriver.findById(plan.claimedBy).select("user").lean();
    if (driver?.user) {
      await notifyUser(driver.user, {
        i18n: { key: "scheduled_ride_driver_plan_cancelled" },
        data: { type: "scheduled_ride_driver_plan_cancelled", scheduledRideId: String(updated._id) },
        key: `sched:driverPlanCancelled:${updated._id}`,
        type: "scheduled_ride_driver_plan_cancelled",
      }).catch(() => {});
    }
  }

  return updated;
}

/* ------------------------------------------------------------------ */
/* ---------------------------- MÜŞTERİ API ---------------------------- */
/* ------------------------------------------------------------------ */

// ─── POST /api/taxi/scheduled/quote ─────────────────────────────────────────
export async function quoteScheduledRide(req, res, next) {
  try {
    const { pickup, dropoff, vehicleType = "ride", pickupAt, reservationAt, acceptsPets, restaurantId } = req.body || {};

    if (!pickup?.address || typeof pickup?.lat !== "number" || typeof pickup?.lng !== "number") {
      return res.status(400).json({ message: "pickup.lat/lng/address gerekli" });
    }
    if (!dropoff?.address || typeof dropoff?.lat !== "number" || typeof dropoff?.lng !== "number") {
      return res.status(400).json({ message: "dropoff.lat/lng/address gerekli" });
    }

    const { distanceKm, durationMin } = await getRouteInfo(
      { lat: pickup.lat, lng: pickup.lng },
      { lat: dropoff.lat, lng: dropoff.lng }
    );
    const routeDurationSec = Math.round((durationMin || 0) * 60);

    const reservationAtDate = reservationAt ? new Date(reservationAt) : null;
    const suggestedPickupAt =
      reservationAtDate && !Number.isNaN(reservationAtDate.getTime())
        ? suggestPickupAt(reservationAtDate, routeDurationSec)
        : null;

    const effectivePickupAt = pickupAt ? new Date(pickupAt) : suggestedPickupAt ?? new Date();

    // Bölge önceliği ORLUŞTURMAYLA AYNI olmalı: restoran bölgesi > body > kullanıcı bölgesi.
    // (Aksi hâlde quote kullanıcının bölge tarifesiyle, kayıt restoranın tarifesiyle hesaplanıp tutmaz.)
    let restaurantRegion = null;
    if (restaurantId) {
      const rest = await Restaurant.findById(restaurantId).select("region").lean();
      restaurantRegion = normalizeRegion(rest?.region);
    }
    const user = await User.findById(req.user.id).select("region").lean();
    const region =
      restaurantRegion ?? normalizeRegion(req.body?.region) ?? normalizeRegion(user?.region) ?? null;

    const { fare: estimatedFare } = await estimateFareForRegion(region, vehicleType, distanceKm, {
      when: effectivePickupAt,
      petRequested: acceptsPets === true,
    });
    const { fee: scheduledFee } = await getScheduledRideConfig(region);

    return res.json({ estimatedFare, scheduledFee, suggestedPickupAt, routeDurationSec, distanceKm });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/taxi/scheduled/mine ───────────────────────────────────────────
export async function getMyScheduledRides(req, res, next) {
  try {
    const rides = await ScheduledRide.find({
      user: req.user.id,
      status: { $in: ["pending_reservation", "scheduled", "claimed", "dispatching", "converted"] },
    })
      .sort({ pickupAt: 1 })
      .populate({ path: "claimedBy", populate: { path: "user", select: "name phone" } })
      .lean();

    return res.json({ scheduledRides: rides });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/taxi/scheduled/:id ──────────────────────────────────────────
export async function updateScheduledRide(req, res, next) {
  try {
    const { id } = req.params;
    const plan = await ScheduledRide.findOne({ _id: id, user: req.user.id });
    if (!plan) return res.status(404).json({ message: "Plan bulunamadı" });

    if (!EDITABLE_STATUSES.includes(plan.status)) {
      return res.status(409).json({ message: "Bu plan artık düzenlenemez" });
    }
    const now = new Date();
    if (now.getTime() > new Date(plan.pickupAt).getTime() - EDIT_CUTOFF_MS) {
      return res.status(409).json({ message: "Alınma saatine 30 dakikadan az kaldığı için plan düzenlenemez" });
    }

    const reservation = await Reservation.findById(plan.reservationId).select("dateTimeUTC").lean();

    const update = {};
    let recomputeFare = false;

    if (req.body.pickupAt) {
      const pickupAt = new Date(req.body.pickupAt);
      if (Number.isNaN(pickupAt.getTime())) return res.status(400).json({ message: "Geçersiz pickupAt" });
      const err = validatePickupAt(pickupAt, reservation?.dateTimeUTC ?? plan.pickupAt, now);
      if (err) return res.status(400).json({ message: err });
      update.pickupAt = pickupAt;
      recomputeFare = true;
    }
    if (req.body.pickup?.address && typeof req.body.pickup.lat === "number" && typeof req.body.pickup.lng === "number") {
      update.pickup = { lat: req.body.pickup.lat, lng: req.body.pickup.lng, address: req.body.pickup.address };
      recomputeFare = true;
    }
    if (req.body.vehicleType) {
      update.vehicleType = String(req.body.vehicleType).toLowerCase();
      recomputeFare = true;
    }
    if (typeof req.body.acceptsPets === "boolean") {
      update.acceptsPets = req.body.acceptsPets;
      recomputeFare = true;
    }

    if (recomputeFare) {
      const pickup = update.pickup || plan.pickup;
      const dropoff = plan.dropoff;
      const vehicleType = update.vehicleType || plan.vehicleType;
      const pickupAt = update.pickupAt || plan.pickupAt;
      const acceptsPets = update.acceptsPets ?? plan.acceptsPets;
      const { distanceKm } = await getRouteInfo({ lat: pickup.lat, lng: pickup.lng }, { lat: dropoff.lat, lng: dropoff.lng });
      const { fare } = await estimateFareForRegion(plan.region, vehicleType, distanceKm, {
        when: pickupAt,
        petRequested: acceptsPets,
      });
      update.estimatedFare = fare;
    }

    const updated = await ScheduledRide.findOneAndUpdate(
      { _id: plan._id, status: plan.status },
      { $set: update },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: "Plan durumu değişti, tekrar deneyin" });

    if (updated.status === "claimed" && updated.claimedBy) {
      const driver = await TaxiDriver.findById(updated.claimedBy).select("user").lean();
      if (driver?.user) {
        await notifyUser(driver.user, {
          i18n: { key: "scheduled_ride_driver_plan_updated", vars: { dateTime: updated.pickupAt } },
          data: { type: "scheduled_ride_driver_plan_updated", scheduledRideId: String(updated._id) },
          key: `sched:driverPlanUpdated:${updated._id}:${Date.now()}`,
          type: "scheduled_ride_driver_plan_updated",
        }).catch(() => {});
      }
    }

    return res.json({ scheduledRide: updated });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/taxi/scheduled/:id ─────────────────────────────────────────
export async function cancelScheduledRideCustomer(req, res, next) {
  try {
    const { id } = req.params;
    const plan = await ScheduledRide.findOne({ _id: id, user: req.user.id });
    if (!plan) return res.status(404).json({ message: "Plan bulunamadı" });

    if (!EDITABLE_STATUSES.includes(plan.status)) {
      return res.status(409).json({ message: "Bu plan artık iptal edilemez" });
    }
    const now = new Date();
    if (now.getTime() > new Date(plan.pickupAt).getTime() - EDIT_CUTOFF_MS) {
      return res.status(409).json({ message: "Alınma saatine 30 dakikadan az kaldığı için plan iptal edilemez" });
    }

    const updated = await ScheduledRide.findOneAndUpdate(
      { _id: plan._id, status: plan.status },
      { $set: { status: "cancelled" } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: "Plan durumu değişti, tekrar deneyin" });

    if (plan.claimedBy) {
      const driver = await TaxiDriver.findById(plan.claimedBy).select("user").lean();
      if (driver?.user) {
        await notifyUser(driver.user, {
          i18n: { key: "scheduled_ride_driver_plan_cancelled" },
          data: { type: "scheduled_ride_driver_plan_cancelled", scheduledRideId: String(updated._id) },
          key: `sched:driverPlanCancelled:${updated._id}`,
          type: "scheduled_ride_driver_plan_cancelled",
        }).catch(() => {});
      }
    }

    return res.json({ ok: true, scheduledRide: updated });
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------------------------------ */
/* ---------------------------- SÜRÜCÜ API ----------------------------- */
/* ------------------------------------------------------------------ */

// ─── GET /api/taxi/driver/scheduled ─────────────────────────────────────────
export async function getDriverScheduledBoard(req, res, next) {
  try {
    const driver = await TaxiDriver.findOne({ user: req.user.id });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    const user = await User.findById(req.user.id).select("region").lean();
    const region = normalizeRegion(user?.region);

    const boardFilter = { status: "scheduled", vehicleType: driver.vehicleType };
    if (!driver.acceptsPets) boardFilter.acceptsPets = { $ne: true };
    if (region) boardFilter.region = region;

    const [board, claimed] = await Promise.all([
      ScheduledRide.find(boardFilter).sort({ pickupAt: 1 }).limit(50).lean(),
      ScheduledRide.find({ claimedBy: driver._id, status: "claimed" }).sort({ pickupAt: 1 }).lean(),
    ]);

    return res.json({ board, claimed });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/taxi/driver/scheduled/:id/claim ──────────────────────────────
export async function claimScheduledRide(req, res, next) {
  try {
    const { id } = req.params;
    const driver = await TaxiDriver.findOne({ user: req.user.id });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });
    if (!driver.isApproved) return res.status(403).json({ message: "Sürücü hesabı henüz onaylanmadı" });

    const target = await ScheduledRide.findOne({ _id: id, status: "scheduled" }).lean();
    if (!target) return res.status(409).json({ message: "Bu yolculuk artık müsait değil" });

    const targetMs = new Date(target.pickupAt).getTime();
    const conflict = await ScheduledRide.findOne({
      claimedBy: driver._id,
      status: "claimed",
      pickupAt: {
        $gte: new Date(targetMs - CLAIM_CONFLICT_WINDOW_MS),
        $lte: new Date(targetMs + CLAIM_CONFLICT_WINDOW_MS),
      },
    }).lean();
    if (conflict) {
      return res.status(409).json({ message: "45 dakika içinde başka bir planlı yolculuğunuz var" });
    }

    const updated = await ScheduledRide.findOneAndUpdate(
      { _id: id, status: "scheduled" },
      { $set: { status: "claimed", claimedBy: driver._id, claimedAt: new Date() } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: "Bu yolculuğu başka bir sürücü üstlendi" });

    const driverUser = await User.findById(req.user.id).select("name").lean();
    await notifyUser(updated.user, {
      i18n: {
        key: "scheduled_ride_claimed",
        vars: { driverName: driverUser?.name || "Sürücünüz", plate: driver.vehiclePlate },
      },
      data: { type: "scheduled_ride_claimed", scheduledRideId: String(updated._id) },
      key: `sched:claimed:${updated._id}`,
      type: "scheduled_ride_claimed",
    }).catch(() => {});

    return res.json({ scheduledRide: updated });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/taxi/driver/scheduled/:id/release ────────────────────────────
export async function releaseScheduledRide(req, res, next) {
  try {
    const { id } = req.params;
    const driver = await TaxiDriver.findOne({ user: req.user.id });
    if (!driver) return res.status(404).json({ message: "Sürücü profili bulunamadı" });

    const plan = await ScheduledRide.findOne({ _id: id, status: "claimed", claimedBy: driver._id });
    if (!plan) return res.status(404).json({ message: "Üstlendiğiniz plan bulunamadı" });

    const now = new Date();
    const isLate = now.getTime() > new Date(plan.pickupAt).getTime() - RELEASE_LATE_MS;
    const nextStatus = isLate ? "dispatching" : "scheduled";

    const updated = await ScheduledRide.findOneAndUpdate(
      { _id: id, status: "claimed", claimedBy: driver._id },
      { $set: { status: nextStatus, claimedBy: null, claimedAt: null } },
      { new: true }
    );
    if (!updated) return res.status(409).json({ message: "Plan durumu değişti" });

    if (isLate) {
      await TaxiDriver.updateOne({ _id: driver._id }, { $inc: { lateReleaseCount: 1 } }).catch(() => {});
    }

    await notifyUser(updated.user, {
      i18n: { key: "scheduled_ride_released" },
      data: { type: "scheduled_ride_released", scheduledRideId: String(updated._id) },
      key: `sched:released:${updated._id}:${Date.now()}`,
      type: "scheduled_ride_released",
    }).catch(() => {});

    return res.json({ scheduledRide: updated });
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------------------------------ */
/* ------------------------------- CRON -------------------------------- */
/* ------------------------------------------------------------------ */

// ─── POST /api/cron/taxi-sweep ──────────────────────────────────────────────
export async function cronTaxiSweep(req, res, next) {
  try {
    // Repo'nun yerleşik cron secret'ı CRON_JOB_SECRET (bkz. src/routes/jobs.js); CRON_SECRET de kabul edilir.
    const secret = process.env.CRON_JOB_SECRET || process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ message: "CRON_JOB_SECRET yapılandırılmamış" });

    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    // jobs.js deseniyle uyum için ?k= query parametresi de kabul edilir.
    const provided = token || req.query?.k || null;
    if (!provided || provided !== secret) return res.status(401).json({ message: "Unauthorized" });

    const result = await runScheduledRideSweep(new Date());
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}
