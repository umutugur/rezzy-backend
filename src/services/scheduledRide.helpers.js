// src/services/scheduledRide.helpers.js
//
// Planlı Taksi — saf (side-effect'siz) yardımcı fonksiyonlar. DB'ye dokunmaz,
// yalnızca Date/number/plain-object alır ve döner. `node src/services/scheduledRide.helpers.test.mjs`
// ile test edilir. Spec: docs/superpowers/specs/2026-07-14-scheduled-taxi-design.md §2.

const MIN_MS = 60_000;

/**
 * Rezervasyon saatine ve OSRM yol süresine göre önerilen alınma saatini hesaplar.
 * reservationAt - routeDurationSec - 10dk tampon, en yakın dakikaya yuvarlanır.
 * @param {Date} reservationAt
 * @param {number} routeDurationSec
 * @returns {Date}
 */
export function suggestPickupAt(reservationAt, routeDurationSec) {
  const bufferMs = 10 * MIN_MS;
  const routeMs = Math.max(0, Number(routeDurationSec) || 0) * 1000;
  const rawMs = new Date(reservationAt).getTime() - routeMs - bufferMs;
  const roundedMs = Math.round(rawMs / MIN_MS) * MIN_MS;
  return new Date(roundedMs);
}

/**
 * pickupAt seçiminin geçerli olup olmadığını doğrular.
 * Kural: pickupAt >= now + 30dk (inclusive) VE pickupAt <= reservationAt (inclusive).
 * @param {Date} pickupAt
 * @param {Date} reservationAt
 * @param {Date} now
 * @returns {string|null} Hata mesajı (TR) veya geçerliyse null.
 */
export function validatePickupAt(pickupAt, reservationAt, now) {
  const pickupMs = new Date(pickupAt).getTime();
  const nowMs = new Date(now).getTime();
  const reservationMs = new Date(reservationAt).getTime();

  const minPickupMs = nowMs + 30 * MIN_MS;
  if (pickupMs < minPickupMs) {
    return "Alınma saati en az 30 dakika sonrası için seçilmelidir.";
  }
  if (pickupMs > reservationMs) {
    return "Alınma saati rezervasyon saatinden sonra olamaz.";
  }
  return null;
}

/**
 * @typedef {Object} ScheduledRideView
 * @property {string} id
 * @property {"pending_reservation"|"scheduled"|"claimed"|"dispatching"|"converted"|"cancelled"|"failed"} status
 * @property {Date} pickupAt
 * @property {{t30:boolean, t10:boolean, unconfirmed60:boolean}} remindersSent
 * @property {boolean|null} [driverOnlineAvailable] - yalnızca status==="claimed" iken anlamlı;
 *   true=sürücü çevrimiçi+müsait, false=çevrimdışı/meşgul, null/undefined=bilinmiyor (henüz karar verilemez).
 * @property {string|null} [rideId] - status==="converted" olunca dolu (bağlı TaxiRide).
 * @property {boolean|null} [linkedRideHasDriver] - status==="converted" iken bağlı TaxiRide'ın sürücüsü var mı.
 */

/**
 * @typedef {Object} SweepAction
 * @property {string} id
 * @property {"warnUnconfirmed"|"failUnconfirmed"|"remind30"|"convertClaimed"|"releaseAndDispatch"|"dispatch"|"failNoDriver"|"remind10"} action
 * @property {Object} meta
 */

/**
 * Süpürme motoru için saf karar fonksiyonu — DB'siz test edilir. Her kayıt için
 * en fazla 1 aksiyon üretir (veya hiç üretmez). Öncelik: daha kritik/terminal durum,
 * daha yumuşak bir hatırlatmayı her zaman ezer (ör. failUnconfirmed > warnUnconfirmed;
 * convertClaimed/releaseAndDispatch > remind10 > remind30). Sürücü durumu belirsizse
 * (driverOnlineAvailable === null/undefined) terminal karar (convert/release) verilmez,
 * T-10/T-30 hatırlatmalarına düşülür — bir sonraki tur'da durum netleşince terminal
 * aksiyon üretilir.
 *
 * @param {ScheduledRideView[]} rides
 * @param {Date} now
 * @returns {SweepAction[]}
 */
export function sweepActions(rides, now) {
  const nowMs = new Date(now).getTime();
  const actions = [];

  for (const ride of rides) {
    const action = decideAction(ride, nowMs);
    if (action) actions.push({ id: ride.id, action: action.action, meta: action.meta ?? {} });
  }

  return actions;
}

function minutesUntil(pickupAtMs, nowMs) {
  return (pickupAtMs - nowMs) / MIN_MS;
}

function decideAction(ride, nowMs) {
  const pickupAtMs = new Date(ride.pickupAt).getTime();
  const remaining = minutesUntil(pickupAtMs, nowMs); // dakika; negatifse pickupAt geçmiş

  switch (ride.status) {
    case "pending_reservation": {
      // 2. T-15: sert fail — T-60 uyarısının önüne geçer.
      if (remaining <= 15) {
        return { action: "failUnconfirmed", meta: { reason: "reservation_not_confirmed" } };
      }
      // 1. T-60: rezervasyon hâlâ onaylanmadı uyarısı (tek seferlik).
      if (remaining <= 60 && !ride.remindersSent?.unconfirmed60) {
        return { action: "warnUnconfirmed", meta: {} };
      }
      return null;
    }

    case "claimed": {
      // 4. T-15: sürücü durumu netse terminal karar (convert/release). Belirsizse ertelenir.
      if (remaining <= 15) {
        if (ride.driverOnlineAvailable === true) {
          return { action: "convertClaimed", meta: { driverId: ride.claimedBy ?? null } };
        }
        if (ride.driverOnlineAvailable === false) {
          return { action: "releaseAndDispatch", meta: { previousDriverId: ride.claimedBy ?? null } };
        }
        // driverOnlineAvailable bilinmiyor → terminal karar verilemez, hatırlatmaya düş.
      }
      // 7. T-10: ikinci hatırlatma (tek seferlik) — yalnızca hâlâ claimed ve terminal karar verilmediyse.
      if (remaining <= 10 && !ride.remindersSent?.t10) {
        return { action: "remind10", meta: {} };
      }
      // 3. T-30: ilk hatırlatma (tek seferlik).
      if (remaining <= 30 && !ride.remindersSent?.t30) {
        return { action: "remind30", meta: {} };
      }
      return null;
    }

    case "scheduled":
    case "dispatching": {
      // 5. T-30: fallback dispatch (mevcut anlık dispatch akışına düşürme).
      if (remaining <= 30) {
        return { action: "dispatch", meta: {} };
      }
      return null;
    }

    case "converted": {
      // 6. pickupAt geçti ama bağlı TaxiRide hâlâ sürücüsüz → başarısız.
      if (ride.rideId && ride.linkedRideHasDriver === false && remaining <= 0) {
        return { action: "failNoDriver", meta: { reason: "no_driver", rideId: ride.rideId } };
      }
      return null;
    }

    default:
      // cancelled, failed: terminal durumlar, aksiyon yok.
      return null;
  }
}
