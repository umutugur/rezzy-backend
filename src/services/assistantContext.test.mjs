// src/services/assistantContext.test.mjs
//
// Saf summarizeContext testleri — mock veriyle, DB'ye bağlanmaz.
import assert from "node:assert/strict";
import { summarizeContext } from "./assistantContext.js";

// 1) Tamamen boş/null durum — hepsi null/0/[] olmalı, throw etmemeli.
{
  const summary = summarizeContext(null);
  assert.equal(summary.activeMarketOrder, undefined);
  assert.equal(summary.activeDeliveryOrder, undefined);
  assert.equal(summary.activeTaxiRide, undefined);
  assert.deepEqual(summary.upcomingReservations, []);
  assert.equal(summary.activeCouponCount, 0);
  assert.equal(summary.defaultAddress, null);
}

// 2) undefined raw da aynı şekilde güvenli.
{
  const summary = summarizeContext(undefined);
  assert.deepEqual(summary.upcomingReservations, []);
  assert.equal(summary.activeCouponCount, 0);
}

// 3) Dolu mock veri — id'ler string'e çevrilir, insan-okur alanlar dolar.
{
  const raw = {
    activeMarketOrder: {
      _id: "mo1",
      store: { _id: "s1", name: "Migros Kyrenia" },
      status: "preparing",
      type: "delivery",
    },
    activeDeliveryOrder: {
      _id: "do1",
      restaurantId: { _id: "r1", name: "Sushi Co" },
      status: "on_the_way",
    },
    activeTaxiRide: {
      _id: "tr1",
      status: "matched",
      vehicleType: "comfort",
    },
    upcomingReservations: [
      {
        _id: "res1",
        restaurantId: { _id: "rest1", name: "Meze Bahce" },
        dateTimeUTC: "2026-07-21T18:00:00.000Z",
        partySize: 4,
        status: "confirmed",
        scheduledRide: {
          _id: "sr1",
          status: "scheduled",
          pickupAt: "2026-07-21T17:15:00.000Z",
        },
      },
      {
        _id: "res2",
        restaurantId: null,
        dateTimeUTC: "2026-07-22T20:00:00.000Z",
        partySize: 2,
        status: "pending",
        scheduledRide: null,
      },
    ],
    activeCouponCount: 3,
    defaultAddress: {
      _id: "addr1",
      title: "Ev",
      fullAddress: "Girne, KKTC",
    },
  };

  const summary = summarizeContext(raw);

  assert.deepEqual(summary.activeMarketOrder, {
    id: "mo1",
    store: "Migros Kyrenia",
    status: "preparing",
    type: "delivery",
  });

  assert.deepEqual(summary.activeDeliveryOrder, {
    id: "do1",
    restaurant: "Sushi Co",
    status: "on_the_way",
  });

  assert.deepEqual(summary.activeTaxiRide, {
    id: "tr1",
    status: "matched",
    vehicleType: "comfort",
  });

  assert.equal(summary.upcomingReservations.length, 2);
  assert.deepEqual(summary.upcomingReservations[0], {
    id: "res1",
    restaurant: "Meze Bahce",
    dateTimeUTC: "2026-07-21T18:00:00.000Z",
    partySize: 4,
    status: "confirmed",
    scheduledRide: { id: "sr1", status: "scheduled", pickupAt: "2026-07-21T17:15:00.000Z" },
  });
  assert.deepEqual(summary.upcomingReservations[1], {
    id: "res2",
    restaurant: null,
    dateTimeUTC: "2026-07-22T20:00:00.000Z",
    partySize: 2,
    status: "pending",
    scheduledRide: null,
  });

  assert.equal(summary.activeCouponCount, 3);
  assert.deepEqual(summary.defaultAddress, {
    id: "addr1",
    title: "Ev",
    fullAddress: "Girne, KKTC",
  });
}

// 4) Null guard'lar — objeler var ama alt alanlar eksik/null.
{
  const raw = {
    activeMarketOrder: { _id: "mo2", store: null, status: null, type: null },
    activeDeliveryOrder: { _id: "do2", restaurantId: null, status: undefined },
    activeTaxiRide: { _id: "tr2" },
    upcomingReservations: [],
    activeCouponCount: undefined,
    defaultAddress: null,
  };
  const summary = summarizeContext(raw);
  assert.deepEqual(summary.activeMarketOrder, {
    id: "mo2",
    store: null,
    status: null,
    type: null,
  });
  assert.deepEqual(summary.activeDeliveryOrder, {
    id: "do2",
    restaurant: null,
    status: null,
  });
  assert.deepEqual(summary.activeTaxiRide, {
    id: "tr2",
    status: null,
    vehicleType: null,
  });
  assert.equal(summary.activeCouponCount, 0);
  assert.equal(summary.defaultAddress, null);
}

console.log("assistantContext.test.mjs: all assertions passed");
