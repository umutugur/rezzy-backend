import assert from "node:assert";
import {
  suggestPickupAt,
  validatePickupAt,
  sweepActions,
} from "./scheduledRide.helpers.js";

const MIN = 60_000;

// ─── suggestPickupAt ──────────────────────────────────────────────────────

// reservationAt - routeDuration - 10dk tampon, dakikaya yuvarlanmış
{
  const reservationAt = new Date("2026-07-14T19:00:00.000Z");
  const suggested = suggestPickupAt(reservationAt, 20 * 60); // 20 dk yol
  // 19:00 - 20dk - 10dk = 18:30
  assert.strictEqual(suggested.toISOString(), "2026-07-14T18:30:00.000Z");
}

// Saniye küsuratı dakikaya yuvarlanır (round, ceil değil)
{
  const reservationAt = new Date("2026-07-14T19:00:00.000Z");
  const suggested = suggestPickupAt(reservationAt, 20 * 60 + 40); // 20dk40sn -> 21dk'ya yuvarlanır (>=30sn)
  assert.strictEqual(suggested.toISOString(), "2026-07-14T18:29:00.000Z");
}
{
  const reservationAt = new Date("2026-07-14T19:00:00.000Z");
  const suggested = suggestPickupAt(reservationAt, 20 * 60 + 20); // 20dk20sn -> 20dk'ya yuvarlanır (<30sn)
  assert.strictEqual(suggested.toISOString(), "2026-07-14T18:30:00.000Z");
}

// ─── validatePickupAt ─────────────────────────────────────────────────────

// Tam sınır: pickupAt - 30dk === now → geçerli (inclusive alt sınır)
{
  const now = new Date("2026-07-14T18:00:00.000Z");
  const pickupAt = new Date(now.getTime() + 30 * MIN);
  const reservationAt = new Date(now.getTime() + 60 * MIN);
  assert.strictEqual(validatePickupAt(pickupAt, reservationAt, now), null);
}

// 1 saniye daha yakın → geçersiz (alt sınırın altında)
{
  const now = new Date("2026-07-14T18:00:00.000Z");
  const pickupAt = new Date(now.getTime() + 30 * MIN - 1000);
  const reservationAt = new Date(now.getTime() + 60 * MIN);
  const err = validatePickupAt(pickupAt, reservationAt, now);
  assert.ok(typeof err === "string" && err.length > 0);
}

// Tam sınır: pickupAt === reservationAt → geçerli (inclusive üst sınır)
{
  const now = new Date("2026-07-14T18:00:00.000Z");
  const reservationAt = new Date(now.getTime() + 45 * MIN);
  const pickupAt = new Date(reservationAt.getTime());
  assert.strictEqual(validatePickupAt(pickupAt, reservationAt, now), null);
}

// pickupAt > reservationAt → geçersiz
{
  const now = new Date("2026-07-14T18:00:00.000Z");
  const reservationAt = new Date(now.getTime() + 45 * MIN);
  const pickupAt = new Date(reservationAt.getTime() + 1000);
  const err = validatePickupAt(pickupAt, reservationAt, now);
  assert.ok(typeof err === "string" && err.length > 0);
}

// Hata mesajları Türkçe metin döner
{
  const now = new Date("2026-07-14T18:00:00.000Z");
  const reservationAt = new Date(now.getTime() + 60 * MIN);
  const tooSoon = validatePickupAt(new Date(now.getTime() + 5 * MIN), reservationAt, now);
  assert.match(tooSoon, /en az|30/);
}

// ─── sweepActions ─────────────────────────────────────────────────────────

function mkRide(overrides = {}) {
  return {
    id: "r1",
    status: "scheduled",
    pickupAt: new Date("2026-07-14T19:00:00.000Z"),
    remindersSent: { t30: false, t10: false, unconfirmed60: false },
    driverOnlineAvailable: null,
    rideId: null,
    linkedRideHasDriver: null,
    ...overrides,
  };
}

function actionFor(list, id) {
  return list.find((a) => a.id === id) ?? null;
}

// pending_reservation + T-60 geçmiş + bayrak set değil → warnUnconfirmed
{
  const now = new Date("2026-07-14T18:00:00.000Z"); // pickupAt - 60dk == now
  const rides = [mkRide({ id: "a", status: "pending_reservation", pickupAt: new Date("2026-07-14T19:00:00.000Z") })];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "warnUnconfirmed");
}

// pending_reservation + T-60 geçmiş ama bayrak zaten set → aksiyon üretilmez
{
  const now = new Date("2026-07-14T18:00:00.000Z");
  const rides = [
    mkRide({
      id: "a",
      status: "pending_reservation",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      remindersSent: { t30: false, t10: false, unconfirmed60: true },
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a"), null);
}

// pending_reservation + T-15 geçmiş → failUnconfirmed (T-60 uyarı bayrağı ne olursa olsun)
{
  const now = new Date("2026-07-14T18:45:00.000Z"); // pickupAt - 15dk == now
  const rides = [mkRide({ id: "a", status: "pending_reservation", pickupAt: new Date("2026-07-14T19:00:00.000Z") })];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "failUnconfirmed");
}

// Öncelik sırası: T-15 VE T-60 aynı anda tetiklenirse failUnconfirmed > warnUnconfirmed kazanır
{
  const now = new Date("2026-07-14T19:30:00.000Z"); // pickupAt çoktan geçti, her ikisi de tetik
  const rides = [
    mkRide({
      id: "a",
      status: "pending_reservation",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      remindersSent: { t30: false, t10: false, unconfirmed60: false },
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "failUnconfirmed");
}

// claimed + T-30 tam sınır + bayrak set değil → remind30
{
  const now = new Date("2026-07-14T18:30:00.000Z"); // pickupAt - 30dk == now
  const rides = [mkRide({ id: "a", status: "claimed", pickupAt: new Date("2026-07-14T19:00:00.000Z") })];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "remind30");
}

// claimed + T-30 + bayrak zaten set → aksiyon yok
{
  const now = new Date("2026-07-14T18:30:00.000Z");
  const rides = [
    mkRide({
      id: "a",
      status: "claimed",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      remindersSent: { t30: true, t10: false, unconfirmed60: false },
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a"), null);
}

// claimed + T-15 tam sınır + sürücü online/müsait → convertClaimed
{
  const now = new Date("2026-07-14T18:45:00.000Z"); // pickupAt - 15dk == now
  const rides = [
    mkRide({
      id: "a",
      status: "claimed",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      driverOnlineAvailable: true,
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "convertClaimed");
}

// claimed + T-15 + sürücü çevrimdışı/meşgul → releaseAndDispatch
{
  const now = new Date("2026-07-14T18:45:00.000Z");
  const rides = [
    mkRide({
      id: "a",
      status: "claimed",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      driverOnlineAvailable: false,
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "releaseAndDispatch");
}

// Öncelik: claimed + T-15 VE T-30 aynı anda tetiklenirse convert/release, remind30'u ezer
{
  const now = new Date("2026-07-14T19:30:00.000Z"); // pickupAt çoktan geçti
  const rides = [
    mkRide({
      id: "a",
      status: "claimed",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      driverOnlineAvailable: true,
      remindersSent: { t30: false, t10: false, unconfirmed60: false },
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "convertClaimed");
}

// claimed + T-15 + sürücü durumu belirsiz (null) → terminal karar verilemez, T-10 hatırlatmasına düşer
{
  const now = new Date("2026-07-14T18:50:00.000Z"); // pickupAt - 10dk == now (T-15 de geçmiş)
  const rides = [
    mkRide({
      id: "a",
      status: "claimed",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      driverOnlineAvailable: null,
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "remind10");
}

// claimed + T-10 + bayrak zaten set (ve sürücü durumu belirsiz) → aksiyon yok
{
  const now = new Date("2026-07-14T18:50:00.000Z");
  const rides = [
    mkRide({
      id: "a",
      status: "claimed",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      driverOnlineAvailable: null,
      remindersSent: { t30: true, t10: true, unconfirmed60: false },
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a"), null);
}

// scheduled + T-30 tam sınır → dispatch
{
  const now = new Date("2026-07-14T18:30:00.000Z");
  const rides = [mkRide({ id: "a", status: "scheduled", pickupAt: new Date("2026-07-14T19:00:00.000Z") })];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "dispatch");
}

// dispatching + T-30 tam sınır → dispatch (aynı kural scheduled|dispatching için)
{
  const now = new Date("2026-07-14T18:30:00.000Z");
  const rides = [mkRide({ id: "a", status: "dispatching", pickupAt: new Date("2026-07-14T19:00:00.000Z") })];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "dispatch");
}

// scheduled + T-30'dan önce → aksiyon yok
{
  const now = new Date("2026-07-14T18:29:59.000Z");
  const rides = [mkRide({ id: "a", status: "scheduled", pickupAt: new Date("2026-07-14T19:00:00.000Z") })];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a"), null);
}

// converted + rideId set + hâlâ sürücüsüz + pickupAt geçti → failNoDriver
{
  const now = new Date("2026-07-14T19:00:00.000Z"); // pickupAt == now
  const rides = [
    mkRide({
      id: "a",
      status: "converted",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      rideId: "ride-1",
      linkedRideHasDriver: false,
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a")?.action, "failNoDriver");
}

// converted + sürücü atanmış → aksiyon yok
{
  const now = new Date("2026-07-14T19:00:00.000Z");
  const rides = [
    mkRide({
      id: "a",
      status: "converted",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      rideId: "ride-1",
      linkedRideHasDriver: true,
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a"), null);
}

// converted + sürücüsüz ama pickupAt henüz gelmedi → aksiyon yok
{
  const now = new Date("2026-07-14T18:59:00.000Z");
  const rides = [
    mkRide({
      id: "a",
      status: "converted",
      pickupAt: new Date("2026-07-14T19:00:00.000Z"),
      rideId: "ride-1",
      linkedRideHasDriver: false,
    }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a"), null);
}

// cancelled/failed → hiçbir zaman aksiyon üretmez
{
  const now = new Date("2026-07-14T20:00:00.000Z");
  const rides = [
    mkRide({ id: "a", status: "cancelled", pickupAt: new Date("2026-07-14T19:00:00.000Z") }),
    mkRide({ id: "b", status: "failed", pickupAt: new Date("2026-07-14T19:00:00.000Z") }),
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actionFor(actions, "a"), null);
  assert.strictEqual(actionFor(actions, "b"), null);
}

// Birden çok kayıt bağımsız değerlendirilir; her kayıt için en fazla 1 aksiyon döner
{
  const now = new Date("2026-07-14T18:45:00.000Z");
  const rides = [
    mkRide({ id: "a", status: "pending_reservation", pickupAt: new Date("2026-07-14T19:00:00.000Z") }), // T-15 -> fail
    mkRide({ id: "b", status: "claimed", pickupAt: new Date("2026-07-14T19:00:00.000Z"), driverOnlineAvailable: true }), // T-15 -> convert
    mkRide({ id: "c", status: "scheduled", pickupAt: new Date("2026-07-14T19:20:00.000Z") }), // henüz T-30 değil
  ];
  const actions = sweepActions(rides, now);
  assert.strictEqual(actions.length, 2);
  assert.strictEqual(actionFor(actions, "a")?.action, "failUnconfirmed");
  assert.strictEqual(actionFor(actions, "b")?.action, "convertClaimed");
  assert.strictEqual(actionFor(actions, "c"), null);
}

console.log("scheduledRide.helpers ok");
