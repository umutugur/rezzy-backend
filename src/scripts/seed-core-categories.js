// src/scripts/seed-core-categories.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import CoreCategory from "../models/CoreCategory.js";
import { connectDB } from "../config/db.js";

dotenv.config();

/**
 * İşletme tipleri
 * RestaurantSchema enum ile uyumlu olmalı.
 */
const BT = {
  restaurant: "restaurant",
  meyhane: "meyhane",
  bar: "bar",
  cafe: "cafe",
  kebapci: "kebapci",
  fast_food: "fast_food",
  coffee_shop: "coffee_shop",
  pub: "pub",
  other: "other",
};

/**
 * PROD CORE CATEGORY SET
 * - key: sabit slug
 * - businessTypes: hangi tiplerde otomatik gelsin
 * - i18n: 4 dil zorunlu
 * - order: global sıralama
 */
const CORE = [
  // -------------------- YEMEK - GENEL --------------------
  {
    key: "kahvalti_brunch",
    businessTypes: [BT.restaurant, BT.cafe, BT.coffee_shop, BT.other],
    i18n: {
      tr: { title: "Kahvaltı / Brunch", description: "" },
      en: { title: "Breakfast / Brunch", description: "" },
      ru: { title: "Завтрак / Бранч", description: "" },
      el: { title: "Πρωινό / Brunch", description: "" },
    },
    order: 10,
  },
  {
    key: "baslangiclar",
    businessTypes: [BT.restaurant, BT.pub, BT.other],
    i18n: {
      tr: { title: "Başlangıçlar", description: "" },
      en: { title: "Starters", description: "" },
      ru: { title: "Закуски", description: "" },
      el: { title: "Ορεκτικά", description: "" },
    },
    order: 15,
  },
  {
    key: "mezeler_soguk",
    businessTypes: [BT.restaurant, BT.meyhane, BT.pub, BT.other],
    i18n: {
      tr: { title: "Soğuk Mezeler", description: "" },
      en: { title: "Cold Appetizers", description: "" },
      ru: { title: "Холодные закуски", description: "" },
      el: { title: "Κρύα Ορεκτικά", description: "" },
    },
    order: 20,
  },
  {
    key: "mezeler_sicak",
    businessTypes: [BT.restaurant, BT.meyhane, BT.pub, BT.other],
    i18n: {
      tr: { title: "Sıcak Mezeler / Ara Sıcaklar", description: "" },
      en: { title: "Hot Appetizers / Small Plates", description: "" },
      ru: { title: "Горячие закуски", description: "" },
      el: { title: "Ζεστά Ορεκτικά", description: "" },
    },
    order: 25,
  },
  {
    key: "corbalar",
    businessTypes: [BT.restaurant, BT.kebapci, BT.other],
    i18n: {
      tr: { title: "Çorbalar", description: "" },
      en: { title: "Soups", description: "" },
      ru: { title: "Супы", description: "" },
      el: { title: "Σούπες", description: "" },
    },
    order: 30,
  },
  {
    key: "salatalar",
    businessTypes: [BT.restaurant, BT.meyhane, BT.kebapci, BT.cafe, BT.pub, BT.other],
    i18n: {
      tr: { title: "Salatalar", description: "" },
      en: { title: "Salads", description: "" },
      ru: { title: "Салаты", description: "" },
      el: { title: "Σαλάτες", description: "" },
    },
    order: 35,
  },
  {
    key: "makarnalar_risotto",
    businessTypes: [BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Makarnalar / Risotto", description: "" },
      en: { title: "Pasta / Risotto", description: "" },
      ru: { title: "Паста / Ризотто", description: "" },
      el: { title: "Ζυμαρικά / Ριζότο", description: "" },
    },
    order: 40,
  },
  {
    key: "et_yemekleri",
    businessTypes: [BT.restaurant, BT.kebapci, BT.pub, BT.other],
    i18n: {
      tr: { title: "Et Yemekleri", description: "" },
      en: { title: "Meat Dishes", description: "" },
      ru: { title: "Мясные блюда", description: "" },
      el: { title: "Κρεατικά", description: "" },
    },
    order: 45,
  },
  {
    key: "izgara",
    businessTypes: [BT.restaurant, BT.kebapci, BT.meyhane, BT.pub, BT.other],
    i18n: {
      tr: { title: "Izgara", description: "" },
      en: { title: "Grill", description: "" },
      ru: { title: "Гриль", description: "" },
      el: { title: "Ψητά", description: "" },
    },
    order: 50,
  },
  {
    key: "deniz_urunleri",
    businessTypes: [BT.restaurant, BT.meyhane, BT.other],
    i18n: {
      tr: { title: "Deniz Ürünleri", description: "" },
      en: { title: "Seafood", description: "" },
      ru: { title: "Морепродукты", description: "" },
      el: { title: "Θαλασσινά", description: "" },
    },
    order: 55,
  },
  {
    key: "tavuk_yemekleri",
    businessTypes: [BT.restaurant, BT.fast_food, BT.kebapci, BT.pub, BT.other],
    i18n: {
      tr: { title: "Tavuk Yemekleri", description: "" },
      en: { title: "Chicken Dishes", description: "" },
      ru: { title: "Блюда из курицы", description: "" },
      el: { title: "Κοτόπουλο", description: "" },
    },
    order: 60,
  },
  {
    key: "burgerler",
    businessTypes: [BT.restaurant, BT.fast_food, BT.pub, BT.bar, BT.other],
    i18n: {
      tr: { title: "Burgerler", description: "" },
      en: { title: "Burgers", description: "" },
      ru: { title: "Бургеры", description: "" },
      el: { title: "Μπέργκερ", description: "" },
    },
    order: 65,
  },
  {
    key: "pizzalar",
    businessTypes: [BT.restaurant, BT.fast_food, BT.pub, BT.other],
    i18n: {
      tr: { title: "Pizzalar", description: "" },
      en: { title: "Pizzas", description: "" },
      ru: { title: "Пицца", description: "" },
      el: { title: "Πίτσες", description: "" },
    },
    order: 70,
  },
  {
    key: "pideler_lahmacun",
    businessTypes: [BT.restaurant, BT.kebapci, BT.fast_food, BT.other],
    i18n: {
      tr: { title: "Pideler / Lahmacun", description: "" },
      en: { title: "Pide / Lahmacun", description: "" },
      ru: { title: "Пиде / Лахмаджун", description: "" },
      el: { title: "Πίδε / Λαχματζούν", description: "" },
    },
    order: 75,
  },
  {
    key: "doner_durum",
    businessTypes: [BT.kebapci, BT.fast_food, BT.other],
    i18n: {
      tr: { title: "Döner / Dürüm", description: "" },
      en: { title: "Doner / Wraps", description: "" },
      ru: { title: "Донер / Роллы", description: "" },
      el: { title: "Ντονέρ / Τυλιχτά", description: "" },
    },
    order: 80,
  },
  {
    key: "vegan_vejetaryen",
    businessTypes: [BT.restaurant, BT.cafe, BT.coffee_shop, BT.other],
    i18n: {
      tr: { title: "Vegan / Vejetaryen", description: "" },
      en: { title: "Vegan / Vegetarian", description: "" },
      ru: { title: "Веган / Вегетарианское", description: "" },
      el: { title: "Vegan / Χορτοφαγικά", description: "" },
    },
    order: 82,
  },
  {
    key: "glutensiz_fit",
    businessTypes: [BT.restaurant, BT.cafe, BT.coffee_shop, BT.other],
    i18n: {
      tr: { title: "Glutensiz / Fit", description: "" },
      en: { title: "Gluten-Free / Fit", description: "" },
      ru: { title: "Без глютена / Фитнес", description: "" },
      el: { title: "Χωρίς γλουτένη / Fit", description: "" },
    },
    order: 83,
  },
  {
    key: "cocuk_menusu",
    businessTypes: [BT.restaurant, BT.fast_food, BT.cafe, BT.other],
    i18n: {
      tr: { title: "Çocuk Menüsü", description: "" },
      en: { title: "Kids Menu", description: "" },
      ru: { title: "Детское меню", description: "" },
      el: { title: "Παιδικό Μενού", description: "" },
    },
    order: 84,
  },
  {
    key: "yan_urunler",
    businessTypes: [BT.restaurant, BT.fast_food, BT.kebapci, BT.pub, BT.bar, BT.other],
    i18n: {
      tr: { title: "Yan Ürünler / Garnitür", description: "" },
      en: { title: "Sides", description: "" },
      ru: { title: "Гарниры", description: "" },
      el: { title: "Συνοδευτικά", description: "" },
    },
    order: 85,
  },
  {
    key: "tatlilar",
    businessTypes: [BT.restaurant, BT.meyhane, BT.cafe, BT.coffee_shop, BT.pub, BT.other],
    i18n: {
      tr: { title: "Tatlılar", description: "" },
      en: { title: "Desserts", description: "" },
      ru: { title: "Десерты", description: "" },
      el: { title: "Επιδόρπια", description: "" },
    },
    order: 90,
  },
  {
    key: "pastalar_kekler",
    businessTypes: [BT.cafe, BT.coffee_shop, BT.other],
    i18n: {
      tr: { title: "Pastalar / Kekler", description: "" },
      en: { title: "Cakes / Pastries", description: "" },
      ru: { title: "Торты / Выпечка", description: "" },
      el: { title: "Γλυκά / Κέικ", description: "" },
    },
    order: 92,
  },
  {
    key: "dondurma",
    businessTypes: [BT.restaurant, BT.cafe, BT.coffee_shop, BT.other],
    i18n: {
      tr: { title: "Dondurma", description: "" },
      en: { title: "Ice Cream", description: "" },
      ru: { title: "Мороженое", description: "" },
      el: { title: "Παγωτό", description: "" },
    },
    order: 94,
  },

  // -------------------- İÇECEK - ALKOLSÜZ --------------------
  {
    key: "alkolsuz_icecekler",
    businessTypes: [BT.restaurant, BT.meyhane, BT.bar, BT.cafe, BT.kebapci, BT.fast_food, BT.coffee_shop, BT.pub, BT.other],
    i18n: {
      tr: { title: "Alkolsüz İçecekler", description: "" },
      en: { title: "Non-Alcoholic Drinks", description: "" },
      ru: { title: "Безалкогольные напитки", description: "" },
      el: { title: "Μη αλκοολούχα ποτά", description: "" },
    },
    order: 100,
  },
  {
    key: "kahveler_sicak",
    businessTypes: [BT.cafe, BT.coffee_shop, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Sıcak Kahveler", description: "" },
      en: { title: "Hot Coffees", description: "" },
      ru: { title: "Горячий кофе", description: "" },
      el: { title: "Ζεστοί καφέδες", description: "" },
    },
    order: 105,
  },
  {
    key: "kahveler_soguk",
    businessTypes: [BT.cafe, BT.coffee_shop, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Soğuk Kahveler", description: "" },
      en: { title: "Cold Coffees", description: "" },
      ru: { title: "Холодный кофе", description: "" },
      el: { title: "Κρύοι καφέδες", description: "" },
    },
    order: 106,
  },
  {
    key: "caylar_bitki",
    businessTypes: [BT.cafe, BT.coffee_shop, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Çaylar / Bitki Çayları", description: "" },
      en: { title: "Teas / Herbal Teas", description: "" },
      ru: { title: "Чай / Травяной чай", description: "" },
      el: { title: "Τσάγια / Βότανα", description: "" },
    },
    order: 110,
  },
  {
    key: "fresh_juice_smoothie",
    businessTypes: [BT.cafe, BT.coffee_shop, BT.restaurant, BT.fast_food, BT.other],
    i18n: {
      tr: { title: "Fresh Juice / Smoothie", description: "" },
      en: { title: "Fresh Juice / Smoothies", description: "" },
      ru: { title: "Фреш / Смузи", description: "" },
      el: { title: "Φρέσκοι χυμοί / Smoothies", description: "" },
    },
    order: 115,
  },

  // -------------------- İÇECEK - ALKOLLÜ (GENEL) --------------------
  {
    key: "bira_fici",
    businessTypes: [BT.bar, BT.pub, BT.meyhane, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Fıçı Biralar", description: "" },
      en: { title: "Draft Beers", description: "" },
      ru: { title: "Разливное пиво", description: "" },
      el: { title: "Μπύρες Βαρελιού", description: "" },
    },
    order: 120,
  },
  {
    key: "bira_sise_kutu",
    businessTypes: [BT.bar, BT.pub, BT.meyhane, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Şişe / Kutu Biralar", description: "" },
      en: { title: "Bottled / Canned Beers", description: "" },
      ru: { title: "Бутылочное пиво", description: "" },
      el: { title: "Μπύρες Μπουκάλι/Κουτί", description: "" },
    },
    order: 121,
  },
  {
    key: "craft_bira",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Craft / Özel Biralar", description: "" },
      en: { title: "Craft Beers", description: "" },
      ru: { title: "Крафтовое пиво", description: "" },
      el: { title: "Craft Μπύρες", description: "" },
    },
    order: 122,
  },
  {
    key: "sarap_beyaz",
    businessTypes: [BT.bar, BT.pub, BT.meyhane, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Beyaz Şarap", description: "" },
      en: { title: "White Wine", description: "" },
      ru: { title: "Белое вино", description: "" },
      el: { title: "Λευκό Κρασί", description: "" },
    },
    order: 130,
  },
  {
    key: "sarap_kirmizi",
    businessTypes: [BT.bar, BT.pub, BT.meyhane, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Kırmızı Şarap", description: "" },
      en: { title: "Red Wine", description: "" },
      ru: { title: "Красное вино", description: "" },
      el: { title: "Κόκκινο Κρασί", description: "" },
    },
    order: 131,
  },
  {
    key: "sarap_rose",
    businessTypes: [BT.bar, BT.pub, BT.meyhane, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Rose Şarap", description: "" },
      en: { title: "Rosé Wine", description: "" },
      ru: { title: "Розе", description: "" },
      el: { title: "Ροζέ Κρασί", description: "" },
    },
    order: 132,
  },
  {
    key: "kopuklu_sampanya",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Köpüklü / Şampanya", description: "" },
      en: { title: "Sparkling / Champagne", description: "" },
      ru: { title: "Игристое / Шампанское", description: "" },
      el: { title: "Αφρώδη / Σαμπάνια", description: "" },
    },
    order: 135,
  },
  {
    key: "raki",
    businessTypes: [BT.meyhane, BT.restaurant, BT.pub, BT.other],
    i18n: {
      tr: { title: "Rakılar", description: "" },
      en: { title: "Raki", description: "" },
      ru: { title: "Ракы", description: "" },
      el: { title: "Ρακί", description: "" },
    },
    order: 140,
  },
  {
    key: "vodka",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Vodka", description: "" },
      en: { title: "Vodka", description: "" },
      ru: { title: "Водка", description: "" },
      el: { title: "Βότκα", description: "" },
    },
    order: 145,
  },
  {
    key: "gin",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Gin", description: "" },
      en: { title: "Gin", description: "" },
      ru: { title: "Джин", description: "" },
      el: { title: "Τζιν", description: "" },
    },
    order: 146,
  },
  {
    key: "viski",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Viski / Whisky", description: "" },
      en: { title: "Whisky", description: "" },
      ru: { title: "Виски", description: "" },
      el: { title: "Ουίσκι", description: "" },
    },
    order: 147,
  },
  {
    key: "rom",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Rom", description: "" },
      en: { title: "Rum", description: "" },
      ru: { title: "Ром", description: "" },
      el: { title: "Ρούμι", description: "" },
    },
    order: 148,
  },
  {
    key: "tekila",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Tekila", description: "" },
      en: { title: "Tequila", description: "" },
      ru: { title: "Текила", description: "" },
      el: { title: "Τεκίλα", description: "" },
    },
    order: 149,
  },
  {
    key: "likorler",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Likörler", description: "" },
      en: { title: "Liqueurs", description: "" },
      ru: { title: "Ликёры", description: "" },
      el: { title: "Λικέρ", description: "" },
    },
    order: 150,
  },

  // -------------------- KOKTEYL / SHOT --------------------
  {
    key: "kokteyller_klasik",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Klasik Kokteyller", description: "" },
      en: { title: "Classic Cocktails", description: "" },
      ru: { title: "Классические коктейли", description: "" },
      el: { title: "Κλασικά Κοκτέιλ", description: "" },
    },
    order: 160,
  },
  {
    key: "kokteyller_signature",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Signature Kokteyller", description: "" },
      en: { title: "Signature Cocktails", description: "" },
      ru: { title: "Авторские коктейли", description: "" },
      el: { title: "Signature Κοκτέιλ", description: "" },
    },
    order: 161,
  },
  {
    key: "shotlar",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Shotlar", description: "" },
      en: { title: "Shots", description: "" },
      ru: { title: "Шоты", description: "" },
      el: { title: "Σφηνάκια", description: "" },
    },
    order: 165,
  },
  {
    key: "long_drink_highball",
    businessTypes: [BT.bar, BT.pub, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Long Drink / Highball", description: "" },
      en: { title: "Long Drinks / Highballs", description: "" },
      ru: { title: "Лонгдринки", description: "" },
      el: { title: "Long Drinks", description: "" },
    },
    order: 166,
  },

  // -------------------- BAR / PUB YEMEK --------------------
  {
    key: "bar_snack",
    businessTypes: [BT.bar, BT.pub, BT.other],
    i18n: {
      tr: { title: "Bar Atıştırmalıkları", description: "" },
      en: { title: "Bar Snacks", description: "" },
      ru: { title: "Закуски к напиткам", description: "" },
      el: { title: "Σνακ Μπαρ", description: "" },
    },
    order: 180,
  },
  {
    key: "kanat_nugget",
    businessTypes: [BT.bar, BT.pub, BT.fast_food, BT.other],
    i18n: {
      tr: { title: "Kanat / Nugget", description: "" },
      en: { title: "Wings / Nuggets", description: "" },
      ru: { title: "Крылышки / Наггетсы", description: "" },
      el: { title: "Φτερούγες / Nuggets", description: "" },
    },
    order: 181,
  },
  {
    key: "nachos_cips",
    businessTypes: [BT.bar, BT.pub, BT.other],
    i18n: {
      tr: { title: "Nachos / Cips", description: "" },
      en: { title: "Nachos / Chips", description: "" },
      ru: { title: "Начос / Чипсы", description: "" },
      el: { title: "Nachos / Πατατάκια", description: "" },
    },
    order: 182,
  },
  {
    key: "tost_sandvic_wrap",
    businessTypes: [BT.cafe, BT.coffee_shop, BT.bar, BT.pub, BT.fast_food, BT.other],
    i18n: {
      tr: { title: "Tost / Sandviç / Wrap", description: "" },
      en: { title: "Toasts / Sandwiches / Wraps", description: "" },
      ru: { title: "Тосты / Сэндвичи / Роллы", description: "" },
      el: { title: "Τοστ / Σάντουιτς / Wraps", description: "" },
    },
    order: 190,
  },

  // -------------------- KEBAPÇI ÖZEL --------------------
  {
    key: "kebaplar",
    businessTypes: [BT.kebapci, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Kebaplar", description: "" },
      en: { title: "Kebabs", description: "" },
      ru: { title: "Кебабы", description: "" },
      el: { title: "Κεμπάπ", description: "" },
    },
    order: 200,
  },
  {
    key: "ocakbasi_izgara",
    businessTypes: [BT.kebapci, BT.restaurant, BT.other],
    i18n: {
      tr: { title: "Ocakbaşı / Şiş Izgara", description: "" },
      en: { title: "Charcoal Grill / Skewers", description: "" },
      ru: { title: "Шашлык / Мангал", description: "" },
      el: { title: "Σουβλάκια / Ψησταριά", description: "" },
    },
    order: 205,
  },

  // -------------------- FAST FOOD ÖZEL --------------------
  {
    key: "fastfood_menu",
    businessTypes: [BT.fast_food, BT.other],
    i18n: {
      tr: { title: "Menüler", description: "" },
      en: { title: "Combos / Menus", description: "" },
      ru: { title: "Комбо-меню", description: "" },
      el: { title: "Μενού", description: "" },
    },
    order: 210,
  },

  // -------------------- EKSTRA / OLABİLİR GENEL --------------------
  {
    key: "gunun_menusu",
    businessTypes: [BT.restaurant, BT.meyhane, BT.kebapci, BT.other],
    i18n: {
      tr: { title: "Günün Menüsü", description: "" },
      en: { title: "Menu of the Day", description: "" },
      ru: { title: "Блюдо дня", description: "" },
      el: { title: "Μενού Ημέρας", description: "" },
    },
    order: 300,
  },
  {
    key: "sef_onerileri",
    businessTypes: [BT.restaurant, BT.meyhane, BT.other],
    i18n: {
      tr: { title: "Şef Önerileri", description: "" },
      en: { title: "Chef’s Specials", description: "" },
      ru: { title: "Специальное от шефа", description: "" },
      el: { title: "Προτάσεις Σεφ", description: "" },
    },
    order: 301,
  },
  {
    key: "sezonluk",
    businessTypes: [BT.restaurant, BT.meyhane, BT.bar, BT.cafe, BT.pub, BT.other],
    i18n: {
      tr: { title: "Sezonluk / Özel", description: "" },
      en: { title: "Seasonal / Special", description: "" },
      ru: { title: "Сезонное / Специальное", description: "" },
      el: { title: "Εποχιακά / Ειδικά", description: "" },
    },
    order: 302,
  },
];

async function seed() {
  await connectDB();

  for (const c of CORE) {
    await CoreCategory.updateOne(
      { key: c.key },
      {
        $set: {
          key: c.key,
          i18n: c.i18n,
          order: c.order || 0,
          isActive: true,
          businessTypes: c.businessTypes || [BT.other],
        },
      },
      { upsert: true }
    );
  }

  console.log(`[seed-core] ok. count=${CORE.length}`);
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error("[seed-core] error", e);
  process.exit(1);
});