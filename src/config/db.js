import mongoose from "mongoose";

export async function connectDB(uri) {
  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    autoIndex: true, // ⬅️ Prod’da da index’leri oluştur
    maxPoolSize: 10, // bağlantı optimizasyonu
  });

  console.log("✅ MongoDB connected (autoIndex ON)");
}