// src/sockets/taxi.socket.js
import TaxiDriver from "../models/TaxiDriver.js";
import TaxiRide from "../models/TaxiRide.js";

/**
 * Socket.io'yu io nesnesine bağlar ve taksi event'larını kaydeder.
 * @param {import('socket.io').Server} io
 */
export function registerTaxiSockets(io) {
  io.on("connection", (socket) => {
    const { userId, role } = socket.handshake.auth ?? {};
    console.log(`[taxi.socket] bağlandı | socketId=${socket.id} userId=${userId} role=${role}`);

    // ─── Sürücü: online ol ──────────────────────────────────────────────────
    socket.on("driver:online", async ({ driverId } = {}) => {
      try {
        const driver = await TaxiDriver.findById(driverId);
        if (!driver) return;

        driver.isOnline = true;
        driver.isAvailable = true;
        driver.socketId = socket.id;
        await driver.save();

        // Sürücüyü kendi room'una ekle
        socket.join(`driver:${driverId}`);
        socket.emit("driver:online:ack", { driverId, isOnline: true });
        console.log(`[taxi.socket] driver:online driverId=${driverId}`);
      } catch (err) {
        console.error("[taxi.socket] driver:online hata:", err.message);
      }
    });

    // ─── Sürücü: offline ol ─────────────────────────────────────────────────
    socket.on("driver:offline", async ({ driverId } = {}) => {
      try {
        const driver = await TaxiDriver.findById(driverId);
        if (!driver) return;

        driver.isOnline = false;
        driver.isAvailable = false;
        driver.socketId = null;
        await driver.save();

        socket.leave(`driver:${driverId}`);
        socket.emit("driver:offline:ack", { driverId, isOnline: false });
        console.log(`[taxi.socket] driver:offline driverId=${driverId}`);
      } catch (err) {
        console.error("[taxi.socket] driver:offline hata:", err.message);
      }
    });

    // ─── Sürücü: konum güncelle ─────────────────────────────────────────────
    socket.on("driver:location", async ({ driverId, lat, lng } = {}) => {
      try {
        const driver = await TaxiDriver.findByIdAndUpdate(
          driverId,
          {
            location: { type: "Point", coordinates: [Number(lng), Number(lat)] },
          },
          { new: false }
        );

        if (!driver) return;

        // Aktif yolculuğu varsa yolcuya konum bildir
        if (driver.activeRide) {
          io.to(`ride:${driver.activeRide}`).emit("driver:location:update", {
            driverId,
            lat: Number(lat),
            lng: Number(lng),
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error("[taxi.socket] driver:location hata:", err.message);
      }
    });

    // ─── Yolcu: yolculuk room'una katıl ────────────────────────────────────
    socket.on("ride:join", ({ rideId } = {}) => {
      if (!rideId) return;
      socket.join(`ride:${rideId}`);
      console.log(`[taxi.socket] ride:join rideId=${rideId} socket=${socket.id}`);
    });

    // ─── Yolcu: yolculuktan ayrıl ──────────────────────────────────────────
    socket.on("ride:leave", ({ rideId } = {}) => {
      if (!rideId) return;
      socket.leave(`ride:${rideId}`);
    });

    // ─── Sürücü: bağlantı kesildiğinde ─────────────────────────────────────
    socket.on("disconnect", async (reason) => {
      console.log(`[taxi.socket] disconnect socket=${socket.id} reason=${reason}`);
      try {
        // socketId'ye göre sürücüyü bul ve offline yap
        const driver = await TaxiDriver.findOne({ socketId: socket.id });
        if (driver) {
          driver.isOnline = false;
          driver.isAvailable = false;
          driver.socketId = null;
          await driver.save();
          console.log(`[taxi.socket] sürücü offline: driverId=${driver._id}`);
        }
      } catch (err) {
        console.error("[taxi.socket] disconnect cleanup hata:", err.message);
      }
    });
  });
}

/**
 * Yeni yolculuk talebi geldiğinde yakın sürücülere socket event'ı gönderir.
 * REST controller'larından çağrılır.
 * @param {import('socket.io').Server} io
 * @param {Object} ride - TaxiRide belgesi
 * @param {Array} nearbyDriverIds - Bildirim gönderilecek sürücü _id listesi
 */
export async function emitNewRideRequest(io, ride, nearbyDriverIds) {
  const payload = {
    rideId: ride._id,
    pickup: ride.pickup,
    dropoff: ride.dropoff,
    vehicleType: ride.vehicleType,
    fare: ride.fare,
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    requestedAt: ride.requestedAt,
  };

  for (const driverId of nearbyDriverIds) {
    io.to(`driver:${driverId}`).emit("ride:new_request", payload);
  }
}

/**
 * Yolculuk durumu değiştiğinde ilgili taraflara bildirim gönderir.
 * @param {import('socket.io').Server} io
 * @param {Object} ride - TaxiRide belgesi
 */
export async function emitRideStatusChange(io, ride) {
  io.to(`ride:${ride._id}`).emit("ride:status_change", {
    rideId: ride._id,
    status: ride.status,
    driver: ride.driver,
    updatedAt: Date.now(),
  });

  // Sürücüye de ayrıca bildir
  if (ride.driver) {
    io.to(`driver:${ride.driver}`).emit("ride:status_change", {
      rideId: ride._id,
      status: ride.status,
      updatedAt: Date.now(),
    });
  }
}
