import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { registerTaxiSockets } from "./sockets/taxi.socket.js";
import { setSocketIo as taxiSetIo } from "./controllers/taxi.controller.js";
import { setSocketIo as taxiDriverSetIo } from "./controllers/taxiDriver.controller.js";
import { setIo } from "./sockets/io.js";

// Cron job'ların importu (varsa)
try {
  await import("./jobs/noshow.job.js");
} catch (_) {
  // opsiyonel
}
try {
  await import("./jobs/riskDecay.job.js");
} catch (_) {
  // opsiyonel
}
try {
  await import("./jobs/staleDriver.job.js");
} catch (_) {
  // opsiyonel
}
try {
  await import("./jobs/winbackCoupons.job.js");
} catch (_) {
  // opsiyonel
}
try {
  await import("./jobs/couponExpiry.job.js");
} catch (_) {
  // opsiyonel
}

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI/MONGODB_URI env eksik!");
  process.exit(1);
}
await connectDB(MONGO_URI);

const PORT = Number(process.env.PORT) || 4000;
const HOST = "0.0.0.0";

app.set("trust proxy", 1);

// HTTP sunucusu + Socket.io
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Socket.io referansını app'e ekle (route içinden req.app.get("io") ile erişilebilir)
app.set("io", io);

// Cron job'lar gibi request-dışı bağlamlardan io erişimi için global register
setIo(io);

// Taxi socket event'larını kaydet
registerTaxiSockets(io);

// Controller'lara io referansını inject et
taxiSetIo(io);
taxiDriverSetIo(io);

httpServer.listen(PORT, HOST, () => {
  console.log(`Rezvix API dinlemede: http://${HOST}:${PORT}`);
  console.log(`Socket.io aktif`);
});

// graceful shutdown
process.on("SIGTERM", () => {
  io.close();
  process.exit(0);
});
process.on("SIGINT", () => {
  io.close();
  process.exit(0);
});
