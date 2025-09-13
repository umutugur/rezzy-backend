// src/seed.js
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import mongoose from "mongoose";

dotenv.config();
await connectDB(process.env.MONGO_URI);

// mevcut koleksiyon adlarını burada tek tek tutuyoruz
const collections = ["users", "restaurants", "menus", "reservations", "sessions"];

for (const name of collections) {
  const exists = await mongoose.connection.db.listCollections({ name }).hasNext();
  if (exists) {
    await mongoose.connection.db.collection(name).deleteMany({});
    console.log(`✔ cleared: ${name}`);
  } else {
    console.log(`ℹ skipped (not found): ${name}`);
  }
}

console.log("✅ database cleared");
process.exit(0);
