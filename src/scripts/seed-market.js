// src/scripts/seed-market.js
// ─────────────────────────────────────────────────────────────
//  Kıbrıs marketleri + ürün kategorileri + ürünler seed scripti
//  Çalıştır: node --experimental-vm-modules src/scripts/seed-market.js
//  veya:     npx tsx src/scripts/seed-market.js
// ─────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import CoreCategory from "../models/CoreCategory.js";
import MarketStore from "../models/MarketStore.js";
import MarketProduct from "../models/MarketProduct.js";

dotenv.config();

// ─── 1. MARKET ÜRÜN KATEGORİLERİ ────────────────────────────────────────────

const MARKET_CATEGORIES = [
  {
    key: "market_meyve_sebze",
    businessTypes: ["market"],
    order: 10,
    i18n: {
      tr: { title: "Meyve & Sebze", description: "Taze meyveler ve sebzeler" },
      en: { title: "Fruits & Vegetables", description: "Fresh fruits and vegetables" },
      ru: { title: "Фрукты и Овощи", description: "Свежие фрукты и овощи" },
      el: { title: "Φρούτα & Λαχανικά", description: "Φρέσκα φρούτα και λαχανικά" },
    },
  },
  {
    key: "market_sut_urunleri",
    businessTypes: ["market"],
    order: 20,
    i18n: {
      tr: { title: "Süt & Süt Ürünleri", description: "Süt, peynir, yoğurt, tereyağı" },
      en: { title: "Dairy & Eggs", description: "Milk, cheese, yogurt, butter" },
      ru: { title: "Молочные продукты", description: "Молоко, сыр, йогурт, масло" },
      el: { title: "Γαλακτοκομικά & Αυγά", description: "Γάλα, τυρί, γιαούρτι, βούτυρο" },
    },
  },
  {
    key: "market_et_tavuk",
    businessTypes: ["market"],
    order: 30,
    i18n: {
      tr: { title: "Et & Tavuk", description: "Taze et, tavuk, şarküteri" },
      en: { title: "Meat & Poultry", description: "Fresh meat, chicken, deli" },
      ru: { title: "Мясо и Птица", description: "Свежее мясо, курица, деликатесы" },
      el: { title: "Κρέας & Πουλερικά", description: "Φρέσκο κρέας, κοτόπουλο" },
    },
  },
  {
    key: "market_balik_deniz",
    businessTypes: ["market"],
    order: 35,
    i18n: {
      tr: { title: "Balık & Deniz Ürünleri", description: "Taze ve dondurulmuş balıklar" },
      en: { title: "Fish & Seafood", description: "Fresh and frozen fish" },
      ru: { title: "Рыба и Морепродукты", description: "Свежая и замороженная рыба" },
      el: { title: "Ψάρια & Θαλασσινά", description: "Φρέσκα και κατεψυγμένα ψάρια" },
    },
  },
  {
    key: "market_ekmek_firinda",
    businessTypes: ["market"],
    order: 40,
    i18n: {
      tr: { title: "Ekmek & Fırın Ürünleri", description: "Taze ekmek, simit, poğaça" },
      en: { title: "Bread & Bakery", description: "Fresh bread, rolls, pastries" },
      ru: { title: "Хлеб и Выпечка", description: "Свежий хлеб, булочки, пироги" },
      el: { title: "Ψωμί & Αρτοποιία", description: "Φρέσκο ψωμί, κουλούρια" },
    },
  },
  {
    key: "market_icecekler",
    businessTypes: ["market"],
    order: 50,
    i18n: {
      tr: { title: "İçecekler", description: "Su, meyve suyu, gazlı içecekler" },
      en: { title: "Beverages", description: "Water, juice, soft drinks" },
      ru: { title: "Напитки", description: "Вода, соки, газированные напитки" },
      el: { title: "Ροφήματα", description: "Νερό, χυμοί, αναψυκτικά" },
    },
  },
  {
    key: "market_atistirmalik",
    businessTypes: ["market"],
    order: 60,
    i18n: {
      tr: { title: "Atıştırmalıklar & Kuruyemiş", description: "Cips, bisküvi, kuruyemiş" },
      en: { title: "Snacks & Nuts", description: "Chips, biscuits, nuts" },
      ru: { title: "Снеки и Орехи", description: "Чипсы, печенье, орехи" },
      el: { title: "Σνακ & Ξηροί Καρποί", description: "Τσιπς, μπισκότα, ξηροί καρποί" },
    },
  },
  {
    key: "market_kuru_gida",
    businessTypes: ["market"],
    order: 70,
    i18n: {
      tr: { title: "Kuru Gıda & Bakliyat", description: "Makarna, pirinç, mercimek, un" },
      en: { title: "Dry Goods & Pulses", description: "Pasta, rice, lentils, flour" },
      ru: { title: "Бакалея", description: "Макароны, рис, чечевица, мука" },
      el: { title: "Ξηρά Τρόφιμα", description: "Ζυμαρικά, ρύζι, φακές, αλεύρι" },
    },
  },
  {
    key: "market_konserve_hazir",
    businessTypes: ["market"],
    order: 80,
    i18n: {
      tr: { title: "Konserve & Hazır Gıda", description: "Konserveler, hazır yemekler" },
      en: { title: "Canned & Ready Meals", description: "Canned goods, ready meals" },
      ru: { title: "Консервы и Готовые Блюда", description: "Консервы, готовые блюда" },
      el: { title: "Κονσέρβες & Έτοιμα Γεύματα", description: "Κονσέρβες, έτοιμα γεύματα" },
    },
  },
  {
    key: "market_dondurulmus",
    businessTypes: ["market"],
    order: 90,
    i18n: {
      tr: { title: "Dondurulmuş Ürünler", description: "Donmuş sebzeler, dondurma" },
      en: { title: "Frozen Foods", description: "Frozen vegetables, ice cream" },
      ru: { title: "Замороженные Продукты", description: "Замороженные овощи, мороженое" },
      el: { title: "Κατεψυγμένα", description: "Κατεψυγμένα λαχανικά, παγωτό" },
    },
  },
  {
    key: "market_temizlik",
    businessTypes: ["market"],
    order: 100,
    i18n: {
      tr: { title: "Temizlik & Deterjan", description: "Çamaşır suyu, deterjan, sünger" },
      en: { title: "Cleaning & Detergents", description: "Bleach, detergent, sponges" },
      ru: { title: "Чистящие Средства", description: "Отбеливатель, стиральный порошок" },
      el: { title: "Καθαριστικά & Απορρυπαντικά", description: "Χλωρίνη, απορρυπαντικά" },
    },
  },
  {
    key: "market_kisisel_bakim",
    businessTypes: ["market"],
    order: 110,
    i18n: {
      tr: { title: "Kişisel Bakım & Kozmetik", description: "Şampuan, sabun, diş macunu" },
      en: { title: "Personal Care & Cosmetics", description: "Shampoo, soap, toothpaste" },
      ru: { title: "Личная Гигиена и Косметика", description: "Шампунь, мыло, зубная паста" },
      el: { title: "Προσωπική Φροντίδα", description: "Σαμπουάν, σαπούνι, οδοντόπαστα" },
    },
  },
  {
    key: "market_bebek_cocuk",
    businessTypes: ["market"],
    order: 120,
    i18n: {
      tr: { title: "Bebek & Çocuk", description: "Bebek bezi, mama, oyuncak" },
      en: { title: "Baby & Kids", description: "Diapers, baby food, toys" },
      ru: { title: "Для Детей и Малышей", description: "Подгузники, детское питание" },
      el: { title: "Βρέφη & Παιδιά", description: "Πάνες, βρεφικές τροφές" },
    },
  },
  {
    key: "market_ev_gerecler",
    businessTypes: ["market"],
    order: 130,
    i18n: {
      tr: { title: "Ev Gereçleri & Mutfak", description: "Mutfak malzemeleri, plastik ürünler" },
      en: { title: "Household & Kitchen", description: "Kitchen supplies, plastic items" },
      ru: { title: "Товары для Дома", description: "Кухонные принадлежности" },
      el: { title: "Οικιακά & Κουζίνα", description: "Κουζινικά σκεύη" },
    },
  },
];

// ─── 2. MARKET SAHİBİ KULLANICI ──────────────────────────────────────────────

const OWNER = {
  name: "Market Sahibi (Demo)",
  email: "market.owner@rezzy.demo",
  password: "MarketDemo1234!",
  role: "market_owner",
};

// ─── 3. MARKETLER (KIBRIS) ───────────────────────────────────────────────────
// GeoJSON: coordinates = [longitude, latitude]

const STORES_DATA = [
  // ── LEFKOŞA (Nicosia) ──────────────────────────────────────────────────────
  {
    name: "SuperMarket Lefkoşa",
    description:
      "Lefkoşa'nın merkezinde, geniş ürün yelpazesiyle hizmet veren güvenilir süpermarket. Taze meyve-sebzeden temizlik ürünlerine her şeyi bulabilirsiniz.",
    category: "supermarket",
    city: "Lefkoşa",
    address: "Atatürk Meydanı No:14, Lefkoşa, KKTC",
    location: { type: "Point", coordinates: [33.3610, 35.1736] },
    workingHours: { open: "07:30", close: "22:00", days: [0, 1, 2, 3, 4, 5, 6] },
    deliveryZoneKm: 7,
    minOrderAmount: 20,
    deliveryFee: 5,
    freeDeliveryThreshold: 80,
    rating: 4.6,
    totalOrders: 312,
  },
  {
    name: "Girne Doğal Market",
    description:
      "Girne limanına yakın, yerel üreticilerden taze ürünler. Organik sebze-meyve, ev yapımı peynirler ve Kıbrıs'a özgü lezzetler.",
    category: "organic",
    city: "Girne",
    address: "Kordon Boyu Cad. No:7, Girne, KKTC",
    location: { type: "Point", coordinates: [33.3167, 35.3397] },
    workingHours: { open: "08:00", close: "21:00", days: [1, 2, 3, 4, 5, 6] },
    deliveryZoneKm: 5,
    minOrderAmount: 30,
    deliveryFee: 6,
    freeDeliveryThreshold: 100,
    rating: 4.8,
    totalOrders: 187,
  },
  {
    name: "Gazimağusa Manav & Market",
    description:
      "Gazimağusa'nın tarihi surları dibinde, her gün sabah taze gelen meyve-sebzeler. Mahalle marketi samimiyetiyle büyük market çeşitliliği.",
    category: "greengrocer",
    city: "Gazimağusa",
    address: "Namık Kemal Meydanı No:3, Gazimağusa, KKTC",
    location: { type: "Point", coordinates: [33.9431, 35.1209] },
    workingHours: { open: "07:00", close: "20:30", days: [0, 1, 2, 3, 4, 5, 6] },
    deliveryZoneKm: 4,
    minOrderAmount: 15,
    deliveryFee: 4,
    freeDeliveryThreshold: 60,
    rating: 4.4,
    totalOrders: 95,
  },
  {
    name: "Lefkoşa Fırın & Pastane",
    description:
      "Her sabah sıcak çıkan ekmekler, açmalar ve geleneksel Kıbrıs tatlıları. Sipariş verip kapıya teslim alın.",
    category: "bakery",
    city: "Lefkoşa",
    address: "Büyük Han Sokak No:9, Lefkoşa, KKTC",
    location: { type: "Point", coordinates: [33.3650, 35.1800] },
    workingHours: { open: "06:00", close: "19:00", days: [1, 2, 3, 4, 5, 6] },
    deliveryZoneKm: 4,
    minOrderAmount: 10,
    deliveryFee: 3,
    freeDeliveryThreshold: 40,
    rating: 4.9,
    totalOrders: 241,
  },
  {
    name: "Girne Eczane & Sağlık Market",
    description:
      "Kişisel bakım, vitamin, medikal ürünler ve sağlıklı gıdaları bir arada sunan Girne'nin güvenilir sağlık marketi.",
    category: "pharmacy",
    city: "Girne",
    address: "Dr. Fazıl Küçük Blv. No:22, Girne, KKTC",
    location: { type: "Point", coordinates: [33.3220, 35.3350] },
    workingHours: { open: "09:00", close: "20:00", days: [1, 2, 3, 4, 5] },
    deliveryZoneKm: 3,
    minOrderAmount: 25,
    deliveryFee: 5,
    freeDeliveryThreshold: 75,
    rating: 4.5,
    totalOrders: 68,
  },
];

// ─── 4. ÜRÜNLER (store index → ürün listesi) ─────────────────────────────────

function makeProducts(storeId, catMap) {
  const c = (key) => catMap[key];

  return [
    // ════════════════════════════════════════════════════════════
    //  STORE 0 — SuperMarket Lefkoşa
    // ════════════════════════════════════════════════════════════
    // Meyve & Sebze
    {
      storeIdx: 0,
      title: "Domates (1 kg)",
      description: "Yerel seradan taze, olgun domatesler.",
      price: 3.5,
      unit: "kg",
      stock: 200,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 0,
      title: "Salatalık (1 kg)",
      description: "Çıtır, taze salatalıklar.",
      price: 2.9,
      unit: "kg",
      stock: 150,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 0,
      title: "Limon (500 g)",
      description: "Kıbrıs limonu, aromalı.",
      price: 2.2,
      unit: "pack",
      stock: 100,
      category: c("market_meyve_sebze"),
    },
    // Süt & Ürünleri
    {
      storeIdx: 0,
      title: "Tam Yağlı Süt (1 L)",
      description: "Günlük pastörize tam yağlı süt.",
      price: 2.5,
      unit: "litre",
      stock: 80,
      category: c("market_sut_urunleri"),
    },
    {
      storeIdx: 0,
      title: "Hellim Peyniri (250 g)",
      description: "Geleneksel Kıbrıs hellimi, ızgaralık.",
      price: 7.9,
      unit: "pack",
      stock: 60,
      category: c("market_sut_urunleri"),
    },
    {
      storeIdx: 0,
      title: "Yoğurt (500 g)",
      description: "Tam yağlı, kültürlü doğal yoğurt.",
      price: 3.2,
      unit: "pack",
      stock: 70,
      category: c("market_sut_urunleri"),
    },
    // İçecekler
    {
      storeIdx: 0,
      title: "Kaynak Suyu (1.5 L)",
      description: "Soğuk, serin kaynak suyu.",
      price: 0.9,
      unit: "piece",
      stock: 300,
      category: c("market_icecekler"),
    },
    {
      storeIdx: 0,
      title: "Portakal Suyu (1 L)",
      description: "Sıkma portakal suyu, şekersiz.",
      price: 3.8,
      unit: "litre",
      stock: 60,
      category: c("market_icecekler"),
    },
    {
      storeIdx: 0,
      title: "Cola (500 ml)",
      description: "Soğutulmuş gazlı içecek.",
      price: 1.5,
      unit: "piece",
      stock: 200,
      category: c("market_icecekler"),
    },
    // Kuru Gıda
    {
      storeIdx: 0,
      title: "Spaghetti (500 g)",
      description: "İtalyan stili makarna.",
      price: 2.1,
      unit: "pack",
      stock: 120,
      category: c("market_kuru_gida"),
    },
    {
      storeIdx: 0,
      title: "Basmati Pirinç (1 kg)",
      description: "Uzun taneli basmati pirinç.",
      price: 4.5,
      unit: "kg",
      stock: 90,
      category: c("market_kuru_gida"),
    },
    // Atıştırmalık
    {
      storeIdx: 0,
      title: "Fıstık (200 g)",
      description: "Kavrulmuş, tuzlu fıstıklar.",
      price: 3.5,
      unit: "pack",
      stock: 80,
      category: c("market_atistirmalik"),
    },
    {
      storeIdx: 0,
      title: "Çips (150 g)",
      description: "Doğal patates çipsi.",
      price: 2.8,
      unit: "pack",
      stock: 100,
      category: c("market_atistirmalik"),
    },
    // Et & Tavuk
    {
      storeIdx: 0,
      title: "Tavuk Göğsü (1 kg)",
      description: "Taze, kemiksiz tavuk göğsü.",
      price: 9.5,
      unit: "kg",
      stock: 50,
      category: c("market_et_tavuk"),
    },
    {
      storeIdx: 0,
      title: "Dana Kıyma (500 g)",
      description: "Çift çekim dana kıyma.",
      price: 8.9,
      unit: "pack",
      stock: 40,
      category: c("market_et_tavuk"),
    },
    // Temizlik
    {
      storeIdx: 0,
      title: "Bulaşık Deterjanı (750 ml)",
      description: "Limon kokulu yoğun bulaşık deterjanı.",
      price: 3.2,
      unit: "piece",
      stock: 60,
      category: c("market_temizlik"),
    },
    {
      storeIdx: 0,
      title: "Çamaşır Suyu (1 L)",
      description: "Koku giderici, beyazlatıcı çamaşır suyu.",
      price: 2.5,
      unit: "litre",
      stock: 55,
      category: c("market_temizlik"),
    },

    // ════════════════════════════════════════════════════════════
    //  STORE 1 — Girne Doğal Market
    // ════════════════════════════════════════════════════════════
    {
      storeIdx: 1,
      title: "Organik Çilek (300 g)",
      description: "Sertifikalı organik, katkısız taze çilek.",
      price: 5.5,
      unit: "pack",
      stock: 40,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 1,
      title: "Avokado",
      description: "Tropik organik avokado, olgunlaşmış.",
      price: 3.2,
      unit: "piece",
      stock: 30,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 1,
      title: "Ispanak (500 g)",
      description: "Köy tarlasından organik ıspanak.",
      price: 2.8,
      unit: "pack",
      stock: 50,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 1,
      title: "Organik Hellim (200 g)",
      description: "Kıbrıs köy sütünden el yapımı organik hellim.",
      price: 10.5,
      unit: "pack",
      stock: 25,
      category: c("market_sut_urunleri"),
    },
    {
      storeIdx: 1,
      title: "Keçi Sütü (500 ml)",
      description: "Taze, doğal keçi sütü.",
      price: 4.8,
      unit: "litre",
      stock: 20,
      category: c("market_sut_urunleri"),
    },
    {
      storeIdx: 1,
      title: "Organik Yumurta (12'li)",
      description: "Serbest dolaşan tavuk yumurtaları.",
      price: 5.9,
      unit: "pack",
      stock: 45,
      category: c("market_sut_urunleri"),
    },
    {
      storeIdx: 1,
      title: "Zeytinyağı (500 ml)",
      description: "Soğuk sıkım Kıbrıs zeytinyağı.",
      price: 12.9,
      unit: "piece",
      stock: 30,
      category: c("market_kuru_gida"),
    },
    {
      storeIdx: 1,
      title: "Organik Bal (300 g)",
      description: "Girne dağlarından çam balı.",
      price: 9.5,
      unit: "pack",
      stock: 20,
      category: c("market_atistirmalik"),
    },
    {
      storeIdx: 1,
      title: "Glutensiz Ekmek (400 g)",
      description: "Pirinç unu bazlı glutensiz ekmek.",
      price: 5.2,
      unit: "pack",
      stock: 15,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 1,
      title: "Kuşburnu Çayı (20 poşet)",
      description: "Kıbrıs dağlarından kurutulmuş kuşburnu.",
      price: 3.8,
      unit: "pack",
      stock: 35,
      category: c("market_icecekler"),
    },
    {
      storeIdx: 1,
      title: "Organik Granola (400 g)",
      description: "Yulaf, bal, fındık karışımı granola.",
      price: 7.5,
      unit: "pack",
      stock: 25,
      category: c("market_atistirmalik"),
    },
    {
      storeIdx: 1,
      title: "Doğal Kıbrıs Sabunu",
      description: "Zeytin bazlı geleneksel kıbrıs sabunu.",
      price: 4.2,
      unit: "piece",
      stock: 40,
      category: c("market_kisisel_bakim"),
    },

    // ════════════════════════════════════════════════════════════
    //  STORE 2 — Gazimağusa Manav & Market
    // ════════════════════════════════════════════════════════════
    {
      storeIdx: 2,
      title: "Karpuz (kg)",
      description: "Gazimağusa yazının gözde karpuzu.",
      price: 1.2,
      unit: "kg",
      stock: 500,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 2,
      title: "İncir (500 g)",
      description: "Ağaçtan toplanmış olgun incirler.",
      price: 4.5,
      unit: "pack",
      stock: 60,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 2,
      title: "Biber (kg)",
      description: "Taze karışık biber çeşitleri.",
      price: 3.8,
      unit: "kg",
      stock: 100,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 2,
      title: "Soğan (1 kg)",
      description: "Kuru soğan, sarımsak yanında.",
      price: 1.9,
      unit: "kg",
      stock: 200,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 2,
      title: "Patates (1 kg)",
      description: "Sarı, kuru patates.",
      price: 2.2,
      unit: "kg",
      stock: 300,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 2,
      title: "Feta Peyniri (200 g)",
      description: "Koyun sütünden yapılmış beyaz peynir.",
      price: 5.5,
      unit: "pack",
      stock: 40,
      category: c("market_sut_urunleri"),
    },
    {
      storeIdx: 2,
      title: "Bal Kavun (adet)",
      description: "Tatlı, aromalı bal kavun.",
      price: 3.5,
      unit: "piece",
      stock: 80,
      category: c("market_meyve_sebze"),
    },
    {
      storeIdx: 2,
      title: "Zeytin (250 g)",
      description: "Kıbrıs usulü yeşil & siyah zeytin karışımı.",
      price: 4.9,
      unit: "pack",
      stock: 55,
      category: c("market_atistirmalik"),
    },
    {
      storeIdx: 2,
      title: "Domates Salçası (700 g)",
      description: "Ev yapımı, katkısız domates salçası.",
      price: 5.8,
      unit: "pack",
      stock: 35,
      category: c("market_konserve_hazir"),
    },
    {
      storeIdx: 2,
      title: "Limonata (1 L)",
      description: "Taze sıkma, soğuk limonata.",
      price: 3.2,
      unit: "litre",
      stock: 40,
      category: c("market_icecekler"),
    },

    // ════════════════════════════════════════════════════════════
    //  STORE 3 — Lefkoşa Fırın & Pastane
    // ════════════════════════════════════════════════════════════
    {
      storeIdx: 3,
      title: "Ekmek (400 g)",
      description: "Sabah taze fırından çıkmış beyaz ekmek.",
      price: 1.5,
      unit: "piece",
      stock: 100,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Tam Buğday Ekmek (400 g)",
      description: "Tam buğday unu, tohumlu ekmek.",
      price: 2.2,
      unit: "piece",
      stock: 60,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Simit",
      description: "Susam, geleneksel simit.",
      price: 0.8,
      unit: "piece",
      stock: 80,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Açma",
      description: "Yumuşak, tereyağlı açma.",
      price: 1.2,
      unit: "piece",
      stock: 70,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Poğaça (Peynirli)",
      description: "İçinde beyaz peynir, çörekotlu poğaça.",
      price: 2.0,
      unit: "piece",
      stock: 50,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Hellimli Börek",
      description: "Kıbrıs hellimi ile hazırlanmış çıtır börek.",
      price: 3.5,
      unit: "piece",
      stock: 40,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Künefe (porsiyon)",
      description: "Kadayıf hamuru, hellim peyniri ve şerbetle.",
      price: 6.5,
      unit: "piece",
      stock: 20,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Fıstıklı Baklava (6'lı)",
      description: "Bol fıstık dolgulu, altın baklava.",
      price: 8.9,
      unit: "pack",
      stock: 25,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Çikolatalı Kek (200 g)",
      description: "Islak kek, bitter çikolata kaplama.",
      price: 5.5,
      unit: "piece",
      stock: 30,
      category: c("market_ekmek_firinda"),
    },
    {
      storeIdx: 3,
      title: "Pişi (6'lı)",
      description: "Geleneksel Kıbrıs pişisi, taze kızartılmış.",
      price: 4.0,
      unit: "pack",
      stock: 35,
      category: c("market_ekmek_firinda"),
    },

    // ════════════════════════════════════════════════════════════
    //  STORE 4 — Girne Eczane & Sağlık Market
    // ════════════════════════════════════════════════════════════
    {
      storeIdx: 4,
      title: "Güneş Koruyucu SPF50 (150 ml)",
      description: "Su geçirmez, geniş spektrum güneş koruyucu.",
      price: 14.9,
      unit: "piece",
      stock: 30,
      category: c("market_kisisel_bakim"),
    },
    {
      storeIdx: 4,
      title: "Şampuan (400 ml)",
      description: "Argan yağlı besleyici şampuan.",
      price: 8.5,
      unit: "piece",
      stock: 40,
      category: c("market_kisisel_bakim"),
    },
    {
      storeIdx: 4,
      title: "El Dezenfektanı (250 ml)",
      description: "%70 alkol, nemlendirici jel.",
      price: 4.9,
      unit: "piece",
      stock: 80,
      category: c("market_kisisel_bakim"),
    },
    {
      storeIdx: 4,
      title: "Diş Macunu (100 ml)",
      description: "Beyazlatıcı, flüorürlü diş macunu.",
      price: 3.8,
      unit: "piece",
      stock: 60,
      category: c("market_kisisel_bakim"),
    },
    {
      storeIdx: 4,
      title: "C Vitamini (30 tablet)",
      description: "1000 mg efervesanlı C vitamini.",
      price: 9.9,
      unit: "pack",
      stock: 45,
      category: c("market_kisisel_bakim"),
    },
    {
      storeIdx: 4,
      title: "Magnezyum Takviyesi (60 kapsül)",
      description: "Kas sağlığı için magnezyum sitrat.",
      price: 15.5,
      unit: "pack",
      stock: 25,
      category: c("market_kisisel_bakim"),
    },
    {
      storeIdx: 4,
      title: "Bebek Bezi (Beden 3, 40'lı)",
      description: "Nefes alan bebek bezi.",
      price: 18.9,
      unit: "pack",
      stock: 30,
      category: c("market_bebek_cocuk"),
    },
    {
      storeIdx: 4,
      title: "Bebek Şampuanı (200 ml)",
      description: "Göz yakmayan, hafif bebek şampuanı.",
      price: 6.5,
      unit: "piece",
      stock: 25,
      category: c("market_bebek_cocuk"),
    },
    {
      storeIdx: 4,
      title: "El Kremi (75 ml)",
      description: "Hızlı emilen, kokusuz nemlendirici.",
      price: 5.9,
      unit: "piece",
      stock: 50,
      category: c("market_kisisel_bakim"),
    },
    {
      storeIdx: 4,
      title: "Protein Bar (60 g)",
      description: "Çikolata kaplama, 20g protein.",
      price: 3.5,
      unit: "piece",
      stock: 70,
      category: c("market_atistirmalik"),
    },
  ];
}

// ─── SEED ÇALIŞTIRICI ─────────────────────────────────────────────────────────

async function seed() {
  await connectDB();
  console.log("\n🌱 Market seed başlıyor...\n");

  // ─ 1. Market kategorilerini upsert et ──────────────────────────────────────
  console.log("📂 Market kategorileri yükleniyor...");
  const catMap = {};
  for (const cat of MARKET_CATEGORIES) {
    const doc = await CoreCategory.findOneAndUpdate(
      { key: cat.key },
      {
        $set: {
          key: cat.key,
          businessTypes: cat.businessTypes,
          i18n: cat.i18n,
          order: cat.order,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
    catMap[cat.key] = doc._id;
    console.log(`  ✅ Kategori: ${cat.i18n.tr.title}`);
  }

  // ─ 2. Market sahibi kullanıcıyı upsert et ──────────────────────────────────
  console.log("\n👤 Market sahibi kullanıcı oluşturuluyor...");
  let owner = await User.findOne({ email: OWNER.email }).select("+password");
  if (!owner) {
    const hashedPw = await bcrypt.hash(OWNER.password, 10);
    owner = new User({
      name: OWNER.name,
      email: OWNER.email,
      password: hashedPw,
      role: OWNER.role,
    });
    await owner.save({ validateBeforeSave: false });
    console.log(`  ✅ Kullanıcı oluşturuldu: ${OWNER.email}`);
  } else {
    await User.updateOne({ _id: owner._id }, { $set: { role: OWNER.role } });
    console.log(`  ℹ️  Kullanıcı zaten var: ${OWNER.email} (rol güncellendi)`);
  }

  // ─ 3. Marketleri oluştur (varsa atla) ─────────────────────────────────────
  console.log("\n🏪 Marketler oluşturuluyor...");
  const stores = [];
  for (const sd of STORES_DATA) {
    let store = await MarketStore.findOne({ name: sd.name, city: sd.city });
    if (!store) {
      store = new MarketStore({
        ...sd,
        owner: owner._id,
      });
      await store.save();
      console.log(`  ✅ Market: ${sd.name} (${sd.city})`);
    } else {
      console.log(`  ℹ️  Zaten var: ${sd.name} (${sd.city})`);
    }
    stores.push(store);
  }

  // ─ 4. Ürünleri oluştur ────────────────────────────────────────────────────
  console.log("\n🛒 Ürünler oluşturuluyor...");
  const products = makeProducts(null, catMap);
  let created = 0;
  let skipped = 0;

  for (const p of products) {
    const store = stores[p.storeIdx];
    if (!store) continue;

    const exists = await MarketProduct.findOne({ title: p.title, store: store._id });
    if (exists) {
      skipped++;
      continue;
    }

    const { storeIdx, ...rest } = p;
    await MarketProduct.create({ ...rest, store: store._id });
    created++;
    console.log(`  ✅ [${store.name}] ${p.title}`);
  }

  // ─ Özet ───────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(55));
  console.log("🎉 SEED TAMAMLANDI");
  console.log("═".repeat(55));
  console.log(`  Kategoriler : ${MARKET_CATEGORIES.length}`);
  console.log(`  Marketler   : ${stores.length}`);
  console.log(`  Ürünler     : ${created} oluşturuldu, ${skipped} atlandı`);
  console.log(`\n  Owner email : ${OWNER.email}`);
  console.log(`  Owner şifre : ${OWNER.password}`);
  console.log("\n  Kıbrıs şehirleri: Lefkoşa, Girne, Gazimağusa");
  console.log("═".repeat(55) + "\n");

  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error("❌ Seed hatası:", e);
  process.exit(1);
});
