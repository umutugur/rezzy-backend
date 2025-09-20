import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { connectDB } from "./config/db.js";

// Cron job'ların importu (varsa)
try {
  await import("./jobs/noshow.job.js");
} catch (_) {
  // opsiyonel
}

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI/MONGODB_URI env eksik!");
  process.exit(1);
}
await connectDB(MONGO_URI);

const PORT = Number(process.env.PORT) || 4000;
const HOST = "0.0.0.0";

app.set("trust proxy", 1);
app.listen(PORT, HOST, () => {
  console.log(`🚀 Rezzy API dinlemede: http://${HOST}:${PORT}`);
});

// graceful shutdown
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
