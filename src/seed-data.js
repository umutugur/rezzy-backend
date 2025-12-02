// src/seed-data.js
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import Restaurant from "./models/Restaurant.js";
import Menu from "./models/Menu.js";

dotenv.config();
await connectDB(process.env.MONGO_URI);

// kullanıcılar
const admin = await User.create({
  name: "Rezvix Admin",
  email: "admin@rezvix.app",
  password: "123456",
  role: "admin",
  providers: [{ name: "password", sub: "admin@rezvix.app" }],
});
const owner = await User.create({
  name: "Mekan Sahibi",
  email: "owner@rezvix.app",
  password: "123456",
  role: "restaurant",
  providers: [{ name: "password", sub: "owner@rezvix.app" }],
});
const customer = await User.create({
  name: "Demo Müşteri",
  email: "demo@rezvix.app",
  password: "123456",
  role: "customer",
  providers: [{ name: "password", sub: "demo@rezvix.app" }],
});

// restoranlar
const restaurants = await Restaurant.insertMany([
  {
    owner: owner._id,
    name: "Ada Meyhane",
    address: "Girne Yat Limanı No:12, Girne",
    city: "Girne",
    phone: "+90 392 000 00 00",
    iban: "TR00 0000 0000 0000 0000 0000",
    priceRange: "₺₺",
    rating: 4.6,
    description: "Deniz esintili meyhane.",
    photos: [
      "https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop"
    ],
    social: ["https://instagram.com/ada_meyhane"],
    depositRate: 10,
    cancelPolicy: "24h_100;3h_50;lt3h_0",
    graceMinutes: 15,
    isActive: true,
    openingHours: {
      "0": { open: "12:00", close: "23:45", isClosed: false },
      "1": { open: "12:00", close: "23:00", isClosed: false },
      "2": { open: "12:00", close: "23:00", isClosed: false },
      "3": { open: "12:00", close: "23:00", isClosed: false },
      "4": { open: "12:00", close: "23:30", isClosed: false },
      "5": { open: "12:00", close: "23:59", isClosed: false },
      "6": { open: "12:00", close: "23:59", isClosed: false },
    },
  },
  {
    owner: owner._id,
    name: "Liman Sofrası",
    address: "Liman Yolu No:34, Gazimağusa",
    city: "Gazimağusa",
    phone: "+90 392 000 00 01",
    iban: "TR00 0000 0000 0000 0000 0001",
    priceRange: "₺₺₺",
    rating: 4.8,
    description: "Meze ağırlıklı, canlı fasıl.",
    photos: [
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?q=80&w=1600&auto=format&fit=crop"
    ],
    social: ["https://instagram.com/liman_sofrasi"],
    depositRate: 12,
    cancelPolicy: "24h_100;3h_50;lt3h_0",
    graceMinutes: 10,
    isActive: true,
    openingHours: {
      "0": { open: "13:00", close: "23:45", isClosed: false },
      "1": { open: "13:00", close: "23:00", isClosed: false },
      "2": { open: "13:00", close: "23:00", isClosed: false },
      "3": { open: "13:00", close: "23:00", isClosed: false },
      "4": { open: "13:00", close: "23:30", isClosed: false },
      "5": { open: "13:00", close: "23:59", isClosed: false },
      "6": { open: "13:00", close: "23:59", isClosed: false },
    },
  },
  {
    owner: owner._id,
    name: "Kuzey Rakı",
    address: "Atatürk Bulvarı No:16, Lefkoşa",
    city: "Lefkoşa",
    phone: "+90 392 000 00 02",
    iban: "TR00 0000 0000 0000 0000 0002",
    priceRange: "₺₺",
    rating: 4.2,
    description: "Arkadaş grubuna ideal, klasik meyhane.",
    photos: [
      "https://images.unsplash.com/photo-1559339367-049613e622d2?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1516684669134-de6f26f8e0b9?q=80&w=1600&auto=format&fit=crop"
    ],
    social: ["https://instagram.com/kuzey_raki"],
    depositRate: 10,
    cancelPolicy: "24h_100;3h_50;lt3h_0",
    graceMinutes: 15,
    isActive: true,
    openingHours: {
      "0": { open: "12:00", close: "23:45", isClosed: false },
      "1": { open: "12:00", close: "23:00", isClosed: false },
      "2": { open: "12:00", close: "23:00", isClosed: false },
      "3": { open: "12:00", close: "23:00", isClosed: false },
      "4": { open: "12:00", close: "23:30", isClosed: false },
      "5": { open: "12:00", close: "23:59", isClosed: false },
      "6": { open: "12:00", close: "23:59", isClosed: false },
    },
  },
  {
    owner: owner._id,
    name: "Ege Meyhanesi",
    address: "Kordonboyu No:8 Alsancak/İzmir",
    city: "İzmir",
    phone: "+90 232 000 00 03",
    iban: "TR00 0000 0000 0000 0000 0003",
    priceRange: "₺₺₺",
    rating: 4.7,
    description: "Ege otları ve deniz ürünleri ön planda.",
    photos: [
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop"
    ],
    social: ["https://instagram.com/egemeyhanesi"],
    depositRate: 12,
    cancelPolicy: "24h_100;3h_50;lt3h_0",
    graceMinutes: 10,
    isActive: true,
    openingHours: {
      "0": { open: "13:00", close: "23:59", isClosed: false },
      "1": { open: "13:00", close: "23:00", isClosed: false },
      "2": { open: "13:00", close: "23:00", isClosed: false },
      "3": { open: "13:00", close: "23:00", isClosed: false },
      "4": { open: "13:00", close: "23:30", isClosed: false },
      "5": { open: "13:00", close: "23:59", isClosed: false },
      "6": { open: "13:00", close: "23:59", isClosed: false },
    },
  },
]);

// fix menüler
await Menu.insertMany([
  { restaurantId: restaurants[0]._id, title: "Fix Menü 1", description: "10 meze + 2 ara sıcak", pricePerPerson: 500 },
  { restaurantId: restaurants[0]._id, title: "Fix Menü 2", description: "10 meze + 3 ara sıcak + 1 içecek", pricePerPerson: 650 },
  { restaurantId: restaurants[1]._id, title: "Ege Sofrası", description: "12 meze + günlük balık", pricePerPerson: 820 },
  { restaurantId: restaurants[1]._id, title: "Fasıl Gecesi", description: "Meze + sınırsız içecek", pricePerPerson: 980 },
  { restaurantId: restaurants[2]._id, title: "Klasik", description: "8 meze + 1 ara sıcak", pricePerPerson: 420 },
  { restaurantId: restaurants[2]._id, title: "Zengin", description: "12 meze + 2 ara sıcak", pricePerPerson: 560 },
  { restaurantId: restaurants[3]._id, title: "Ege Fix", description: "10 meze + deniz ürünü ara sıcak", pricePerPerson: 740 },
  { restaurantId: restaurants[3]._id, title: "Ege Ziyafet", description: "12 meze + balık + tatlı", pricePerPerson: 960 },
]);

console.log("✅ Seed tamam: kullanıcılar, restoranlar (adresler dahil) ve fiks menüler eklendi.");
process.exit(0);
