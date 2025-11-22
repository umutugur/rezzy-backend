// src/config/db.js
import "dotenv/config";
import mongoose from "mongoose";

const DEFAULT_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

export async function connectDB(uri = DEFAULT_URI) {
  if (!uri) {
    console.error("❌ MONGODB_URI / MONGO_URI bulunamadı (.env yüklenmemiş olabilir)");
    process.exit(1);
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    autoIndex: true,
    maxPoolSize: 10,
  });

  console.log("✅ MongoDB connected (autoIndex ON)");
}