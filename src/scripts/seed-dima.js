// src/scripts/seed-dima.js
// ─────────────────────────────────────────────────────────────
//  Dima Discount Market — gerçek zincir: organizasyon + 7 şube
//  Veri kaynağı: Google My Maps (KML) — koordinat + çalışma saatleri
//  Çalıştır: node src/scripts/seed-dima.js
//  Idempotent: tekrar çalıştırılabilir (varsa günceller, yoksa oluşturur)
// ─────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import MarketStore from "../models/MarketStore.js";

dotenv.config();

const ORG = {
  name: "Dima Discount Market",
  legalName: "Dima Discount Market",
  region: "CY",
  defaultLanguage: "tr",
  description: "Kıbrıs'ın en ucuz discount marketi",
};

const OWNER = {
  name: "Dima Discount Market",
  email: "dima.owner@rezvix.com",
  password: "Dima1234!",
  role: "market_owner",
};

// KML'den çıkarılan şubeler — [lng, lat] GeoJSON sırası
const BRANCHES = [
  { name: "Dima Discount Göçmenköy",     city: "Lefkoşa",     lng: 33.3323773, lat: 35.2121204, open: "07:30", close: "23:00" },
  { name: "Dima Discount Kızılbaş",      city: "Lefkoşa",     lng: 33.3604679, lat: 35.1999668, open: "07:30", close: "23:00" },
  { name: "Dima Discount Karaoğlanoğlu", city: "Girne",       lng: 33.2856129, lat: 35.3401631, open: "07:30", close: "23:00" },
  { name: "Dima Discount Alsancak",      city: "Girne",       lng: 33.2080562, lat: 35.3465616, open: "07:30", close: "22:00" },
  { name: "Dima Discount Çatalköy",      city: "Girne",       lng: 33.3633432, lat: 35.3307090, open: "08:00", close: "21:00" },
  { name: "Dima Discount Esentepe",      city: "Girne",       lng: 33.5249213, lat: 35.3375530, open: "07:30", close: "22:00" },
  { name: "Dima Discount Mağusa",        city: "Gazimağusa",  lng: 33.9262703, lat: 35.1138766, open: "07:00", close: "23:00" },
];

// Dima haftanın 7 günü açık
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

async function run() {
  await connectDB();
  console.log("\n🛒 Dima Discount Market seed başlıyor...\n");

  // ─ 1. Organizasyon ────────────────────────────────────────────────────────
  let org = await Organization.findOne({ name: ORG.name });
  if (!org) {
    org = await Organization.create(ORG);
    console.log(`  ✅ Organizasyon oluşturuldu: ${ORG.name} (${org._id})`);
  } else {
    console.log(`  ℹ️  Organizasyon zaten var: ${ORG.name} (${org._id})`);
  }

  // ─ 2. Sahip kullanıcı ─────────────────────────────────────────────────────
  let owner = await User.findOne({ email: OWNER.email }).select("+password");
  if (!owner) {
    owner = new User({
      name: OWNER.name,
      email: OWNER.email,
      password: OWNER.password,
      role: OWNER.role,
      providers: [{ name: "password", sub: OWNER.email }],
    });
    await owner.save({ validateBeforeSave: false });
    console.log(`  ✅ Sahip oluşturuldu: ${OWNER.email}`);
  } else {
    if (owner.role !== OWNER.role) {
      await User.updateOne({ _id: owner._id }, { $set: { role: OWNER.role } });
    }
    console.log(`  ℹ️  Sahip zaten var: ${OWNER.email}`);
  }

  // ─ 2b. org_owner üyeliği ──────────────────────────────────────────────────
  await User.updateOne(
    { _id: owner._id, "organizations.organization": { $ne: org._id } },
    { $push: { organizations: { organization: org._id, role: "org_owner" } } }
  );
  console.log("  ✅ Sahibe org_owner üyeliği verildi (idempotent)");

  // ─ 3. Şubeler ─────────────────────────────────────────────────────────────
  console.log("\n🏪 Şubeler:");
  let created = 0;
  let updated = 0;
  for (const b of BRANCHES) {
    const doc = {
      name: b.name,
      description: ORG.description,
      category: "supermarket",
      location: { type: "Point", coordinates: [b.lng, b.lat] },
      city: b.city,
      workingHours: { open: b.open, close: b.close, days: ALL_DAYS },
      pickupEnabled: true,
      isActive: true,
      owner: owner._id,
      organization: org._id,
    };

    const existing = await MarketStore.findOne({ name: b.name, organization: org._id });
    if (!existing) {
      await MarketStore.create(doc);
      created++;
      console.log(`  ✅ ${b.name} (${b.city})`);
    } else {
      await MarketStore.updateOne(
        { _id: existing._id },
        {
          $set: {
            location: doc.location,
            city: doc.city,
            workingHours: doc.workingHours,
            owner: owner._id,
            organization: org._id,
            category: "supermarket",
          },
        }
      );
      updated++;
      console.log(`  ♻️  Güncellendi: ${b.name} (${b.city})`);
    }
  }

  console.log(`\n✨ Bitti — organizasyon: ${ORG.name}, şube: ${created} yeni / ${updated} güncellenen.\n`);
  await mongoose.connection.close();
  process.exit(0);
}

run().catch(async (e) => {
  console.error("❌ Seed hatası:", e);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
