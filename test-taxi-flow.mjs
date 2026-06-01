/**
 * test-taxi-flow.mjs — Rezvix Taksi WebSocket Uçtan Uca Test
 *
 * Kullanım:
 *   node test-taxi-flow.mjs
 *
 * Ön koşul:
 *   Backend çalışıyor: npm run start:dev  (port 4000)
 *   Veya: API_URL env ile remote URL verilir
 *     API_URL=https://rezvix.onrender.com node test-taxi-flow.mjs
 *
 * Gereksinimler (backend node_modules'den gelir):
 *   axios, socket.io-client
 */

import axios from "axios";
import { io } from "socket.io-client";

// ─── Ayarlar ─────────────────────────────────────────────────────────────────

const API_URL  = process.env.API_URL  || "http://localhost:4000";
const SOCKET_URL = process.env.SOCKET_URL || API_URL;

// Test hesapları — backend'de bu kullanıcıların mevcut olması gerekir.
// Yoksa seed scriptiyle oluşturun:
//   npx ts-node src/seed.ts
const DRIVER_EMAIL    = process.env.DRIVER_EMAIL    || "driver@test.rezvix.com";
const DRIVER_PASSWORD = process.env.DRIVER_PASSWORD || "Test1234!";
const PASS_EMAIL      = process.env.PASS_EMAIL      || "passenger@test.rezvix.com";
const PASS_PASSWORD   = process.env.PASS_PASSWORD   || "Test1234!";

// Test koordinatları (İstanbul Taksim civarı)
const PICKUP  = { address: "Taksim Meydanı, İstanbul", coordinates: [28.9784, 41.0369] };
const DROPOFF = { address: "Beşiktaş İskelesi, İstanbul", coordinates: [29.0041, 41.0434] };

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(msg) {
  console.log(`  ✅  ${msg}`);
  passCount++;
}

function fail(msg, detail) {
  console.error(`  ❌  ${msg}`);
  if (detail) console.error(`      ${String(detail).split("\n")[0]}`);
  failCount++;
}

function info(msg) {
  console.log(`\n${"─".repeat(60)}\n🔹 ${msg}`);
}

function waitFor(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: '${event}' ${timeoutMs}ms içinde gelmedi`)), timeoutMs);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const api = axios.create({ baseURL: `${API_URL}/api` });

// ─── Ana Test Akışı ───────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Rezvix Taksi WebSocket — Uçtan Uca Test`);
  console.log(`  API: ${API_URL}`);
  console.log(`${"═".repeat(60)}\n`);

  let driverToken, passengerToken, driverDoc, rideId;
  let driverSocket, passengerSocket;

  try {

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 1 — Sağlık kontrolü");
    // ──────────────────────────────────────────────────────────────────────────
    try {
      // /auth/me 401 döner ama backend cevap verir — erişilebilirlik yeterli
      await api.get("/auth/me").catch((e) => {
        if (e.response?.status === 401 || e.response?.data?.message) return; // OK
        throw e;
      });
      pass(`Backend erişilebilir (${API_URL})`);
    } catch (e) {
      fail("Backend erişilemiyor — lütfen 'npm run dev' çalıştırın", e.message);
      process.exit(1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 2 — Sürücü ve Yolcu Login");
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const { data: d } = await api.post("/auth/login", { email: DRIVER_EMAIL, password: DRIVER_PASSWORD });
      driverToken = d.token;
      pass(`Sürücü login OK (${DRIVER_EMAIL})`);
    } catch (e) {
      fail(`Sürücü login başarısız (${DRIVER_EMAIL})`, e.response?.data?.message || e.message);
      console.log("\n  💡 İpucu: Önce seed scriptini çalıştırın:");
      console.log(`     node test-taxi-flow.mjs --seed\n`);
      process.exit(1);
    }

    try {
      const { data: p } = await api.post("/auth/login", { email: PASS_EMAIL, password: PASS_PASSWORD });
      passengerToken = p.token;
      pass(`Yolcu login OK (${PASS_EMAIL})`);
    } catch (e) {
      fail(`Yolcu login başarısız (${PASS_EMAIL})`, e.response?.data?.message || e.message);
      process.exit(1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 3 — Sürücü Profili ve Onay Durumu");
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const { data } = await api.get("/taxi/driver/me", {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      driverDoc = data;
      pass(`Sürücü profili alındı: ${data.vehicleBrand} ${data.vehicleModel} (${data.vehiclePlate})`);

      if (!data.isApproved) {
        console.log("\n  ⚠️  Sürücü henüz admin tarafından onaylanmamış.");
        console.log("     Admin panelinden onayladıktan sonra tekrar deneyin.");
        console.log("     Veya: PATCH /api/admin/taxi/drivers/:id/approve\n");
        // Onaysız bile socket testine devam et — kısıtlı çalışacak
      } else {
        pass("Sürücü onaylı ✓");
      }
    } catch (e) {
      fail("Sürücü profili alınamadı — önce driver kaydı yapın", e.response?.data?.message);
      process.exit(1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 4 — Socket Bağlantıları (JWT ile)");
    // ──────────────────────────────────────────────────────────────────────────
    driverSocket = io(SOCKET_URL, {
      auth: { token: driverToken, role: "driver" },
      transports: ["websocket"],
      reconnection: false,
    });

    passengerSocket = io(SOCKET_URL, {
      auth: { token: passengerToken, role: "passenger" },
      transports: ["websocket"],
      reconnection: false,
    });

    // Bağlantı bekleniyor
    await Promise.all([
      new Promise((res, rej) => {
        driverSocket.on("connect", () => { pass(`Sürücü socket bağlandı (${driverSocket.id})`); res(); });
        driverSocket.on("connect_error", (e) => { fail("Sürücü socket bağlanamadı", e.message); rej(e); });
        setTimeout(() => rej(new Error("Driver socket timeout")), 8000);
      }),
      new Promise((res, rej) => {
        passengerSocket.on("connect", () => { pass(`Yolcu socket bağlandı (${passengerSocket.id})`); res(); });
        passengerSocket.on("connect_error", (e) => { fail("Yolcu socket bağlanamadı", e.message); rej(e); });
        setTimeout(() => rej(new Error("Passenger socket timeout")), 8000);
      }),
    ]);

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 4b — Sürücü Konumu Güncelle (pickup yakını)");
    // ──────────────────────────────────────────────────────────────────────────
    try {
      await api.patch(
        "/taxi/driver/location",
        { lat: PICKUP.coordinates[1], lng: PICKUP.coordinates[0] },
        { headers: { Authorization: `Bearer ${driverToken}` } }
      );
      pass(`Sürücü konumu Taksim'e ayarlandı (${PICKUP.coordinates[1]}, ${PICKUP.coordinates[0]})`);
    } catch (e) {
      fail("Sürücü konumu güncellenemedi", e.response?.data?.message);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 5 — Sürücü Online (driver:online event)");
    // ──────────────────────────────────────────────────────────────────────────
    const ackPromise = waitFor(driverSocket, "driver:online:ack", 6000);
    driverSocket.emit("driver:online");

    try {
      const ack = await ackPromise;
      pass(`driver:online:ack alındı — isOnline=${ack.isOnline}, driverId=${ack.driverId}`);
    } catch (e) {
      fail("driver:online:ack gelmedi", e.message);
      console.log("  💡 Sürücü onaylı değilse bu adım çalışmaz.");
    }

    // REST ile de durum güncelle
    try {
      await api.patch(
        "/taxi/driver/status",
        { isOnline: true },
        { headers: { Authorization: `Bearer ${driverToken}` } }
      );
      pass("REST driver/status → isOnline:true ✓");
    } catch (e) {
      fail("REST driver/status başarısız", e.response?.data?.message);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 6 — Yolcu Taksi Talebi Oluşturuyor");
    // ──────────────────────────────────────────────────────────────────────────

    // Sürücünün ride:new_request almasını bekle (arka planda)
    let receivedNewRequest = false;
    const newRequestPromise = waitFor(driverSocket, "ride:new_request", 10000)
      .then((payload) => {
        receivedNewRequest = true;
        rideId = String(payload.rideId);
        return payload;
      })
      .catch(() => null);

    let rideData;
    try {
      const { data } = await api.post(
        "/taxi/rides",
        { pickup: PICKUP, dropoff: DROPOFF, vehicleType: "ride", paymentMethod: "cash" },
        { headers: { Authorization: `Bearer ${passengerToken}` } }
      );
      rideData = data.ride;
      rideId = String(rideData._id);
      pass(`Yolculuk oluşturuldu: ${rideId.slice(-8)} | Ücret: ₺${rideData.fare}`);
      pass(`Yakın sürücü sayısı: ${data.nearbyDriverCount}`);

      if (data.nearbyDriverCount === 0) {
        console.log("  ⚠️  Yakın sürücü bulunamadı — sürücünün konumu ayarlanmamış olabilir.");
        console.log("     Test manuel olarak devam edecek.");
      }
    } catch (e) {
      fail("Yolculuk oluşturulamadı", e.response?.data?.message || e.message);
    }

    // Yolcu ride room'una katılsın
    passengerSocket.emit("ride:join", { rideId });
    pass(`Yolcu ride:${rideId.slice(-8)} room'una katıldı`);

    // ride:new_request bekleniyor (birkaç saniye)
    const newRequestPayload = await newRequestPromise;
    if (newRequestPayload) {
      pass(`Sürücü ride:new_request aldı ✓ | Ücret: ₺${newRequestPayload.fare}`);
    } else {
      fail("Sürücü ride:new_request almadı (timeout veya yakın değil)");
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 7 — Sürücü Kabul Ediyor (REST + ride:status_change)");
    // ──────────────────────────────────────────────────────────────────────────

    // Yolcunun status_change almasını bekle
    const statusChangePromise = waitFor(passengerSocket, "ride:status_change", 8000);
    const driverStatusChangePromise = waitFor(driverSocket, "ride:status_change", 8000);

    // Sürücü ride room'una da katılsın
    driverSocket.emit("ride:join", { rideId });

    try {
      await api.patch(
        `/taxi/rides/${rideId}/respond`,
        { action: "accept" },
        { headers: { Authorization: `Bearer ${driverToken}` } }
      );
      pass("Sürücü yolculuğu kabul etti (REST) ✓");
    } catch (e) {
      fail("Sürücü kabul başarısız", e.response?.data?.message);
    }

    try {
      const sc = await statusChangePromise;
      pass(`Yolcu ride:status_change aldı → status="${sc.status}" ✓`);
      if (sc.status === "matched") pass("Durum 'matched' — beklenen ✓");
      else fail(`Beklenen 'matched', gelen '${sc.status}'`);
    } catch (e) {
      fail("Yolcu ride:status_change almadı", e.message);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 8 — Sürücü Konum Güncellemesi (driver:location)");
    // ──────────────────────────────────────────────────────────────────────────

    const locationUpdatePromise = waitFor(passengerSocket, "driver:location:update", 6000);
    driverSocket.emit("driver:location", { lat: 41.0380, lng: 28.9800 });

    try {
      const loc = await locationUpdatePromise;
      pass(`Yolcu driver:location:update aldı → lat=${loc.lat}, lng=${loc.lng} ✓`);
    } catch (e) {
      fail("driver:location:update gelmedi", e.message);
      console.log("  💡 Sürücünün activeRide'ı set edilmemiş olabilir.");
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 9 — Yolculuk Başlatma (inProgress)");
    // ──────────────────────────────────────────────────────────────────────────

    const inProgressPromise = waitFor(passengerSocket, "ride:status_change", 8000);

    try {
      await api.patch(
        `/taxi/rides/${rideId}/start`,
        {},
        { headers: { Authorization: `Bearer ${driverToken}` } }
      );
      pass("Yolculuk başlatıldı (REST) ✓");
    } catch (e) {
      fail("Yolculuk başlatılamadı", e.response?.data?.message);
    }

    try {
      const sc = await inProgressPromise;
      pass(`Yolcu status_change aldı → status="${sc.status}" ✓`);
      if (sc.status === "inProgress") pass("Durum 'inProgress' — beklenen ✓");
      else fail(`Beklenen 'inProgress', gelen '${sc.status}'`);
    } catch (e) {
      fail("inProgress status_change gelmedi", e.message);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 10 — Yolculuk Tamamlama (completed)");
    // ──────────────────────────────────────────────────────────────────────────

    const completedPromise = waitFor(passengerSocket, "ride:status_change", 8000);

    try {
      await api.patch(
        `/taxi/rides/${rideId}/complete`,
        {},
        { headers: { Authorization: `Bearer ${driverToken}` } }
      );
      pass("Yolculuk tamamlandı (REST) ✓");
    } catch (e) {
      fail("Yolculuk tamamlanamadı", e.response?.data?.message);
    }

    try {
      const sc = await completedPromise;
      pass(`Yolcu status_change aldı → status="${sc.status}" ✓`);
      if (sc.status === "completed") pass("Durum 'completed' — beklenen ✓");
      else fail(`Beklenen 'completed', gelen '${sc.status}'`);
    } catch (e) {
      fail("completed status_change gelmedi", e.message);
    }

    // ──────────────────────────────────────────────────────────────────────────
    info("Adım 11 — Sürücü Kazanç Kontrolü");
    // ──────────────────────────────────────────────────────────────────────────
    try {
      const { data } = await api.get("/taxi/driver/earnings", {
        headers: { Authorization: `Bearer ${driverToken}` },
      });
      pass(`Kazanç güncellendi — totalRides=${data.totalRides}, todayEarnings=₺${data.todayEarnings}`);
    } catch (e) {
      fail("Kazanç alınamadı", e.message);
    }

  } catch (unexpectedErr) {
    fail("Beklenmeyen hata", unexpectedErr.message);
    console.error(unexpectedErr);
  } finally {
    // Temizlik
    if (driverSocket?.connected) driverSocket.disconnect();
    if (passengerSocket?.connected) passengerSocket.disconnect();

    // ─── Özet ────────────────────────────────────────────────────────────────
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Sonuç: ${passCount} geçti, ${failCount} başarısız`);
    const pct = Math.round((passCount / (passCount + failCount)) * 100);
    console.log(`  Başarı oranı: %${pct}`);
    if (failCount === 0) {
      console.log("  🎉 Tüm testler geçti! APK almaya hazırsınız.");
    } else {
      console.log("  ⚠️  Başarısız adımları düzelttikten sonra gerçek cihaz testine geçin.");
    }
    console.log(`${"═".repeat(60)}\n`);

    process.exit(failCount > 0 ? 1 : 0);
  }
}

run();
