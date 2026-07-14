// src/services/scheduledRideSweep.js
//
// Planlı Taksi — süpürme motoru. `sweepActions` (saf, DB'siz) ile karar verir,
// burada DB'ye uygular. Tüm status geçişleri `findOneAndUpdate({_id, status:<beklenen>})`
// ile atomik — süpürme iki kez (iç cron + dış CRON_SECRET endpoint) çağrılırsa
// ikinci çağrı no-op olur. Spec: docs/superpowers/specs/2026-07-14-scheduled-taxi-design.md §2.
import ScheduledRide from "../models/ScheduledRide.js";
import TaxiDriver from "../models/TaxiDriver.js";
import TaxiRide from "../models/TaxiRide.js";
import { notifyUser } from "./notification.service.js";
import { sweepActions } from "./scheduledRide.helpers.js";
import { createRideCore } from "../controllers/taxi.controller.js";

// sweepActions T-60'a kadar bakar (pending_reservation warnUnconfirmed); güvenli pay ile 65dk.
const LOOKAHEAD_MS = 65 * 60 * 1000;

function safeNotify(promise) {
  return promise.catch((e) => console.error("[scheduledRideSweep] notify hata:", e?.message || e));
}

function toRideCorePayload(ride) {
  return {
    user: ride.user,
    pickup: { address: ride.pickup.address, coordinates: [ride.pickup.lng, ride.pickup.lat] },
    dropoff: { address: ride.dropoff.address, coordinates: [ride.dropoff.lng, ride.dropoff.lat] },
    vehicleType: ride.vehicleType,
    acceptsPets: ride.acceptsPets,
    paymentMethod: "cash",
    region: ride.region,
    scheduledRideId: ride._id,
    scheduledFee: ride.scheduledFee,
  };
}

async function applyWarnUnconfirmed(ride) {
  const updated = await ScheduledRide.findOneAndUpdate(
    { _id: ride._id, status: "pending_reservation", "remindersSent.unconfirmed60": false },
    { $set: { "remindersSent.unconfirmed60": true } },
    { new: true }
  );
  if (!updated) return null;

  await safeNotify(
    notifyUser(ride.user, {
      i18n: { key: "scheduled_ride_unconfirmed_warning" },
      data: { type: "scheduled_ride_unconfirmed_warning", scheduledRideId: String(ride._id) },
      key: `sched:warn60:${ride._id}`,
      type: "scheduled_ride_unconfirmed_warning",
    })
  );
  return updated;
}

async function applyFailUnconfirmed(ride) {
  const updated = await ScheduledRide.findOneAndUpdate(
    { _id: ride._id, status: "pending_reservation" },
    { $set: { status: "failed", failReason: "reservation_not_confirmed" } },
    { new: true }
  );
  if (!updated) return null;

  await safeNotify(
    notifyUser(ride.user, {
      i18n: { key: "scheduled_ride_failed_unconfirmed" },
      data: {
        type: "scheduled_ride_failed_unconfirmed",
        scheduledRideId: String(ride._id),
        deepLink: "taxi/instant",
      },
      key: `sched:failUnconfirmed:${ride._id}`,
      type: "scheduled_ride_failed_unconfirmed",
    })
  );
  return updated;
}

async function applyDriverReminder(ride, flag) {
  const updated = await ScheduledRide.findOneAndUpdate(
    { _id: ride._id, status: "claimed", [`remindersSent.${flag}`]: false },
    { $set: { [`remindersSent.${flag}`]: true } },
    { new: true }
  );
  if (!updated) return null;
  if (!ride.claimedBy) return updated;

  const driver = await TaxiDriver.findById(ride.claimedBy).select("user activeRide").lean();
  if (!driver?.user) return updated;

  const key = flag === "t30" ? "scheduled_ride_driver_remind30" : "scheduled_ride_driver_remind10";
  await safeNotify(
    notifyUser(driver.user, {
      i18n: { key, vars: { dateTime: ride.pickupAt } },
      data: { type: key, scheduledRideId: String(ride._id) },
      key: `sched:${flag}:${ride._id}`,
      type: key,
    })
  );

  if (flag === "t30" && driver.activeRide) {
    await safeNotify(
      notifyUser(driver.user, {
        i18n: { key: "scheduled_ride_driver_conflict" },
        data: { type: "scheduled_ride_driver_conflict", scheduledRideId: String(ride._id) },
        key: `sched:conflict:${ride._id}`,
        type: "scheduled_ride_driver_conflict",
      })
    );
  }

  return updated;
}

async function applyConvertClaimed(ride, meta) {
  // Tek adımlı atomik kilit: yalnızca "claimed" olan bir kayıt "converted"e geçebilir —
  // aynı anda iki süpürme çağrısı olsa da yalnızca biri yarışı kazanır, ikinci createRideCore
  // çağrılmaz (duplicate ride oluşmaz).
  const locked = await ScheduledRide.findOneAndUpdate(
    { _id: ride._id, status: "claimed" },
    { $set: { status: "converted" } },
    { new: false }
  );
  if (!locked) return null;

  const driverId = meta?.driverId || ride.claimedBy;
  try {
    const result = await createRideCore(toRideCorePayload(ride), { assignDriverId: driverId });
    if (!result.ok) throw new Error(result.body?.message || "createRideCore başarısız");

    await ScheduledRide.updateOne({ _id: ride._id }, { $set: { rideId: result.body.ride._id } });

    await safeNotify(
      notifyUser(ride.user, {
        i18n: { key: "scheduled_ride_driver_on_way" },
        data: {
          type: "scheduled_ride_driver_on_way",
          scheduledRideId: String(ride._id),
          rideId: String(result.body.ride._id),
        },
        key: `sched:onway:${ride._id}`,
        type: "scheduled_ride_driver_on_way",
      })
    );

    return result.body.ride;
  } catch (err) {
    await ScheduledRide.updateOne(
      { _id: ride._id, status: "converted" },
      { $set: { status: "failed", failReason: "no_driver" } }
    );
    await safeNotify(
      notifyUser(ride.user, {
        i18n: { key: "scheduled_ride_failed_no_driver" },
        data: {
          type: "scheduled_ride_failed_no_driver",
          scheduledRideId: String(ride._id),
          deepLink: "taxi/instant",
        },
        key: `sched:failNoDriver:${ride._id}`,
        type: "scheduled_ride_failed_no_driver",
      })
    );
    throw err;
  }
}

async function applyReleaseAndDispatch(ride, meta) {
  const updated = await ScheduledRide.findOneAndUpdate(
    { _id: ride._id, status: "claimed" },
    { $set: { status: "dispatching", claimedBy: null, claimedAt: null } },
    { new: true }
  );
  if (!updated) return null;

  const previousDriverId = meta?.previousDriverId || ride.claimedBy;
  if (previousDriverId) {
    const driver = await TaxiDriver.findById(previousDriverId).select("user").lean();
    if (driver?.user) {
      await safeNotify(
        notifyUser(driver.user, {
          i18n: { key: "scheduled_ride_driver_claim_dropped" },
          data: { type: "scheduled_ride_driver_claim_dropped", scheduledRideId: String(ride._id) },
          key: `sched:claimDropped:${ride._id}:${previousDriverId}`,
          type: "scheduled_ride_driver_claim_dropped",
        })
      );
    }
  }

  await safeNotify(
    notifyUser(ride.user, {
      i18n: { key: "scheduled_ride_driver_changed" },
      data: { type: "scheduled_ride_driver_changed", scheduledRideId: String(ride._id) },
      key: `sched:driverChanged:${ride._id}`,
      type: "scheduled_ride_driver_changed",
    })
  );

  return updated;
}

async function applyDispatch(ride, now) {
  // "scheduled" (hiç üstlenilmedi) veya "dispatching" (releaseAndDispatch'ten düşmüş) her
  // ikisi de aynı şekilde işlenir — tek adımlı atomik kilit.
  const locked = await ScheduledRide.findOneAndUpdate(
    { _id: ride._id, status: { $in: ["scheduled", "dispatching"] } },
    { $set: { status: "converted" } },
    { new: false }
  );
  if (!locked) return null;

  try {
    const result = await createRideCore(toRideCorePayload(ride));
    if (!result.ok) throw new Error(result.body?.message || "createRideCore başarısız");

    await ScheduledRide.updateOne({ _id: ride._id }, { $set: { rideId: result.body.ride._id } });

    // Kabaca gecikme tahmini: dispatch anından itibaren rota süresi kadar sürer varsayımı.
    const durationMs = (result.body.ride.durationMin || 0) * 60 * 1000;
    const etaMs = now.getTime() + durationMs;
    const pickupMs = new Date(ride.pickupAt).getTime();
    if (etaMs > pickupMs) {
      const lateMinutes = Math.max(1, Math.ceil((etaMs - pickupMs) / 60000));
      await safeNotify(
        notifyUser(ride.user, {
          i18n: { key: "scheduled_ride_may_be_late", vars: { minutes: lateMinutes } },
          data: {
            type: "scheduled_ride_may_be_late",
            scheduledRideId: String(ride._id),
            rideId: String(result.body.ride._id),
          },
          key: `sched:maybeLate:${ride._id}`,
          type: "scheduled_ride_may_be_late",
        })
      );
    }

    return result.body.ride;
  } catch (err) {
    await ScheduledRide.updateOne(
      { _id: ride._id, status: "converted" },
      { $set: { status: "failed", failReason: "no_driver" } }
    );
    await safeNotify(
      notifyUser(ride.user, {
        i18n: { key: "scheduled_ride_failed_no_driver" },
        data: {
          type: "scheduled_ride_failed_no_driver",
          scheduledRideId: String(ride._id),
          deepLink: "taxi/instant",
        },
        key: `sched:failNoDriver:${ride._id}`,
        type: "scheduled_ride_failed_no_driver",
      })
    );
    throw err;
  }
}

async function applyFailNoDriver(ride, meta) {
  const updated = await ScheduledRide.findOneAndUpdate(
    { _id: ride._id, status: "converted" },
    { $set: { status: "failed", failReason: "no_driver" } },
    { new: true }
  );
  if (!updated) return null;

  const rideId = meta?.rideId || ride.rideId;
  if (rideId) {
    await TaxiRide.findOneAndUpdate(
      { _id: rideId, status: "searching" },
      {
        $set: {
          status: "cancelled",
          cancelledBy: "system",
          cancelReason: "Planlı yolculuk için sürücü bulunamadı",
        },
      }
    ).catch(() => {});
  }

  await safeNotify(
    notifyUser(ride.user, {
      i18n: { key: "scheduled_ride_failed_no_driver" },
      data: {
        type: "scheduled_ride_failed_no_driver",
        scheduledRideId: String(ride._id),
        deepLink: "taxi/instant",
      },
      key: `sched:failNoDriver:${ride._id}`,
      type: "scheduled_ride_failed_no_driver",
    })
  );

  return updated;
}

async function applyAction(ride, act, now) {
  switch (act.action) {
    case "warnUnconfirmed":
      return applyWarnUnconfirmed(ride);
    case "failUnconfirmed":
      return applyFailUnconfirmed(ride);
    case "remind30":
      return applyDriverReminder(ride, "t30");
    case "remind10":
      return applyDriverReminder(ride, "t10");
    case "convertClaimed":
      return applyConvertClaimed(ride, act.meta);
    case "releaseAndDispatch":
      return applyReleaseAndDispatch(ride, act.meta);
    case "dispatch":
      return applyDispatch(ride, now);
    case "failNoDriver":
      return applyFailNoDriver(ride, act.meta);
    default:
      return null;
  }
}

/**
 * İdempotent süpürme. İç node-cron (her dakika) ve dış `POST /api/cron/taxi-sweep`
 * (CRON_SECRET) aynı fonksiyonu çağırır; atomik status geçişleri çift çalışmayı zararsız kılar.
 * @param {Date} now
 * @returns {Promise<{processed:number, actions:{id:string, action:string, applied:boolean, error?:string}[]}>}
 */
export async function runScheduledRideSweep(now = new Date()) {
  const cutoff = new Date(now.getTime() + LOOKAHEAD_MS);
  const candidates = await ScheduledRide.find({
    status: { $in: ["pending_reservation", "claimed", "scheduled", "dispatching", "converted"] },
    pickupAt: { $lte: cutoff },
  }).lean();

  if (candidates.length === 0) return { processed: 0, actions: [] };

  const claimedDriverIds = candidates
    .filter((r) => r.status === "claimed" && r.claimedBy)
    .map((r) => String(r.claimedBy));
  const driverMap = new Map();
  if (claimedDriverIds.length) {
    const drivers = await TaxiDriver.find({ _id: { $in: claimedDriverIds } })
      .select("isOnline isAvailable activeRide")
      .lean();
    for (const d of drivers) driverMap.set(String(d._id), d);
  }

  const convertedRideIds = candidates
    .filter((r) => r.status === "converted" && r.rideId)
    .map((r) => String(r.rideId));
  const rideMap = new Map();
  if (convertedRideIds.length) {
    const rides = await TaxiRide.find({ _id: { $in: convertedRideIds } }).select("driver").lean();
    for (const rd of rides) rideMap.set(String(rd._id), rd);
  }

  const views = candidates.map((r) => {
    const view = {
      id: String(r._id),
      status: r.status,
      pickupAt: r.pickupAt,
      remindersSent: r.remindersSent || {},
      claimedBy: r.claimedBy ? String(r.claimedBy) : null,
      rideId: r.rideId ? String(r.rideId) : null,
    };
    if (r.status === "claimed") {
      const d = r.claimedBy ? driverMap.get(String(r.claimedBy)) : undefined;
      // Sürücü kaydı bulunamadıysa null (belirsiz); sweepActions bunu terminal karar vermeden
      // hatırlatmaya düşürür.
      view.driverOnlineAvailable = d ? d.isOnline === true && d.isAvailable === true : null;
    }
    if (r.status === "converted" && r.rideId) {
      const rd = rideMap.get(String(r.rideId));
      view.linkedRideHasDriver = rd ? !!rd.driver : false;
    }
    return view;
  });

  const actions = sweepActions(views, now);
  const byId = new Map(candidates.map((r) => [String(r._id), r]));

  const results = [];
  for (const act of actions) {
    const ride = byId.get(act.id);
    if (!ride) continue;
    try {
      const outcome = await applyAction(ride, act, now);
      results.push({ id: act.id, action: act.action, applied: !!outcome });
    } catch (err) {
      console.error(`[scheduledRideSweep] action ${act.action} for ${act.id} hata:`, err?.message || err);
      results.push({ id: act.id, action: act.action, applied: false, error: err?.message });
    }
  }

  return { processed: candidates.length, actions: results };
}
