// src/scripts/assign-dima-categories.mjs
// ─────────────────────────────────────────────────────────────
//  Dima Discount Market kataloğunu (CSV) ana kategori + alt kategoriye ayırır.
//
//  CSV kolonları: kategori, urun_adi, fiyat, indirimli_fiyat, barkod
//
//  Kullanım:
//    Dry-run (DB'ye YAZMAZ, sadece istatistik basar):
//      node src/scripts/assign-dima-categories.mjs --csv ~/Downloads/kibris-full.csv
//
//    Kalite raporu (atama detay CSV'si stdout'a):
//      node src/scripts/assign-dima-categories.mjs --csv ... --report > report.csv
//
//    Uygula (DB'ye yazar — alt kategorileri upsert eder, ürünlerin category'sini set eder):
//      node src/scripts/assign-dima-categories.mjs --csv ... --apply
//      node src/scripts/assign-dima-categories.mjs --csv ... --apply --org <orgId>
// ─────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import { readFileSync } from "node:fs";

dotenv.config();

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  if (i === -1) return d;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const CSV = String(flag("csv", "kibris-full.csv")).replace(/^~/, process.env.HOME || "~");
const ORG = String(flag("org", "6a35b44c85b09f8304557aed")); // Dima org
const APPLY = Boolean(flag("apply", false));
const REPORT = Boolean(flag("report", false));

// ─────────────────────────────────────────────────────────────
// CSV parse (RFC-4180, tırnaklı alanlar dahil)
// ─────────────────────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* yoksay */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Türkçe normalizasyon (büyük/küçük harf + aksan bağımsız arama için)
// ─────────────────────────────────────────────────────────────
function normalizeTr(s) {
  return String(s || "")
    .replace(/İ/g, "I").replace(/I/g, "I")
    .replace(/ı/g, "i")
    .toUpperCase()
    .replace(/Ç/g, "C").replace(/Ğ/g, "G").replace(/Ö/g, "O")
    .replace(/Ş/g, "S").replace(/Ü/g, "U")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s) {
  return normalizeTr(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// helper: kelime bazlı içerir kontrolü (kelime sınırına duyarlı, kısmi eşleşmeleri de yakalar
// çünkü ürün adlarında bitişik yazımlar sık — bu yüzden basit "includes" kullanıyoruz)
function has(title, ...words) {
  return words.some((w) => title.includes(w));
}

// ─────────────────────────────────────────────────────────────
// 1) ANA KATEGORİ TAKSONOMİSİ (CoreCategory.key referansları — seed-market.js ile birebir)
// ─────────────────────────────────────────────────────────────
const MAIN_KEYS = {
  MEYVE_SEBZE: "market_meyve_sebze",
  SUT_URUNLERI: "market_sut_urunleri",
  ET_TAVUK: "market_et_tavuk",
  BALIK_DENIZ: "market_balik_deniz",
  EKMEK_FIRINDA: "market_ekmek_firinda",
  ICECEKLER: "market_icecekler",
  ATISTIRMALIK: "market_atistirmalik",
  KURU_GIDA: "market_kuru_gida",
  KONSERVE_HAZIR: "market_konserve_hazir",
  DONDURULMUS: "market_dondurulmus",
  TEMIZLIK: "market_temizlik",
  KISISEL_BAKIM: "market_kisisel_bakim",
  BEBEK_COCUK: "market_bebek_cocuk",
  EV_GERECLER: "market_ev_gerecler",
  KAHVALTILIK: "market_kahvaltilik",
  ALKOL_TUTUN: "market_alkol_tutun",
  TATLI_SEKERLEME: "market_tatli_sekerleme",
  SAGLIKLI_ORGANIK: "market_saglikli_organik",
  EVCIL_HAYVAN: "market_evcil_hayvan",
  CINSEL_SAGLIK: "market_cinsel_saglik",
};

// businessTypes ana kategorilerle birebir aynı olmalı (seed-market.js'teki gibi)
const MAIN_BUSINESS_TYPES = ["market"];

// ─────────────────────────────────────────────────────────────
// 2) ALT KATEGORİ TAKSONOMİSİ
//    Her ana key için alt kategori listesi: { key, order, i18n }
//    key'ler: `${ana_key}_${alt_slug}` şeklinde otomatik türetilecek (bkz SUBCATS altında "slug" alanı)
// ─────────────────────────────────────────────────────────────
const SUBCATS = {
  [MAIN_KEYS.KAHVALTILIK]: [
    { slug: "peynir", order: 10, i18n: {
      tr: { title: "Peynir", description: "Beyaz peynir, kaşar, hellim ve diğer peynir çeşitleri" },
      en: { title: "Cheese", description: "White cheese, kashkaval, halloumi and more" },
      ru: { title: "Сыр", description: "Белый сыр, кашкавал, халуми и другие сорта" },
      el: { title: "Τυρί", description: "Λευκό τυρί, κασέρι, χαλούμι και άλλα" },
    }},
    { slug: "zeytin", order: 20, i18n: {
      tr: { title: "Zeytin", description: "Siyah ve yeşil zeytin çeşitleri" },
      en: { title: "Olives", description: "Black and green olive varieties" },
      ru: { title: "Оливки", description: "Чёрные и зелёные оливки" },
      el: { title: "Ελιές", description: "Μαύρες και πράσινες ελιές" },
    }},
    { slug: "sarkuteri", order: 30, i18n: {
      tr: { title: "Şarküteri", description: "Sucuk, salam, sosis, pastırma" },
      en: { title: "Deli Meats", description: "Sausage, salami, pastrami" },
      ru: { title: "Колбасные изделия", description: "Колбаса, салями, бастурма" },
      el: { title: "Αλλαντικά", description: "Λουκάνικο, σαλάμι, παστουρμάς" },
    }},
    { slug: "yumurta", order: 40, i18n: {
      tr: { title: "Yumurta", description: "Yumurta çeşitleri" },
      en: { title: "Eggs", description: "Egg varieties" },
      ru: { title: "Яйца", description: "Виды яиц" },
      el: { title: "Αυγά", description: "Ποικιλίες αυγών" },
    }},
    { slug: "bal_recel_ezme", order: 50, i18n: {
      tr: { title: "Bal, Reçel & Ezme", description: "Bal, reçel, fıstık ezmesi, pekmez" },
      en: { title: "Honey, Jam & Spreads", description: "Honey, jam, peanut butter, molasses" },
      ru: { title: "Мёд, Варенье и Пасты", description: "Мёд, варенье, арахисовая паста" },
      el: { title: "Μέλι, Μαρμελάδα & Πάστες", description: "Μέλι, μαρμελάδα, φυστικοβούτυρο" },
    }},
    { slug: "tereyagi_margarin", order: 60, i18n: {
      tr: { title: "Tereyağı & Margarin", description: "Tereyağı, margarin, kaymak" },
      en: { title: "Butter & Margarine", description: "Butter, margarine, clotted cream" },
      ru: { title: "Масло и Маргарин", description: "Сливочное масло, маргарин, каймак" },
      el: { title: "Βούτυρο & Μαργαρίνη", description: "Βούτυρο, μαργαρίνη, καϊμάκι" },
    }},
    { slug: "gevrek_musli", order: 70, i18n: {
      tr: { title: "Kahvaltılık Gevrek & Müsli", description: "Mısır gevreği, müsli, granola" },
      en: { title: "Cereal & Muesli", description: "Corn flakes, muesli, granola" },
      ru: { title: "Хлопья и Мюсли", description: "Кукурузные хлопья, мюсли, гранола" },
      el: { title: "Δημητριακά & Μούσλι", description: "Κορν φλέικς, μούσλι, γκρανόλα" },
    }},
    { slug: "tahin_pekmez_macun", order: 80, i18n: {
      tr: { title: "Tahin, Pekmez & Meyve Macunu", description: "Tahin, pekmez, meyve macunları" },
      en: { title: "Tahini, Molasses & Fruit Paste", description: "Tahini, molasses, fruit pastes" },
      ru: { title: "Тахини, Пекмез и Фруктовая Паста", description: "Тахини, пекмез, фруктовые пасты" },
      el: { title: "Ταχίνι, Πετιμέζι & Πάστα Φρούτων", description: "Ταχίνι, πετιμέζι, πάστες φρούτων" },
    }},
  ],

  [MAIN_KEYS.ATISTIRMALIK]: [
    { slug: "cips_cerez", order: 10, i18n: {
      tr: { title: "Cips & Çerezler", description: "Patates cipsi ve tuzlu çerezler" },
      en: { title: "Chips & Savory Snacks", description: "Potato chips and salty snacks" },
      ru: { title: "Чипсы и Снеки", description: "Картофельные чипсы и солёные снеки" },
      el: { title: "Τσιπς & Αλμυρά Σνακ", description: "Πατατάκια και αλμυρά σνακ" },
    }},
    { slug: "cikolata", order: 20, i18n: {
      tr: { title: "Çikolata", description: "Sütlü, bitter ve beyaz çikolatalar" },
      en: { title: "Chocolate", description: "Milk, dark and white chocolate" },
      ru: { title: "Шоколад", description: "Молочный, тёмный и белый шоколад" },
      el: { title: "Σοκολάτα", description: "Σοκολάτα γάλακτος, μαύρη και λευκή" },
    }},
    { slug: "biskuvi_gofret", order: 30, i18n: {
      tr: { title: "Bisküvi & Gofret", description: "Bisküvi, gofret, kraker" },
      en: { title: "Biscuits & Wafers", description: "Biscuits, wafers, crackers" },
      ru: { title: "Печенье и Вафли", description: "Печенье, вафли, крекеры" },
      el: { title: "Μπισκότα & Γκοφρέτες", description: "Μπισκότα, γκοφρέτες, κράκερ" },
    }},
    { slug: "kek_kruvasan", order: 40, i18n: {
      tr: { title: "Kek & Kruvasan", description: "Paketli kek, kruvasan, pasta" },
      en: { title: "Cakes & Croissants", description: "Packaged cake, croissant, pastry" },
      ru: { title: "Кексы и Круассаны", description: "Кексы, круассаны, выпечка" },
      el: { title: "Κέικ & Κρουασάν", description: "Συσκευασμένο κέικ, κρουασάν" },
    }},
    { slug: "sekerleme_sakiz", order: 50, i18n: {
      tr: { title: "Şekerleme & Sakız", description: "Şeker, jelibon, sakız, lolipop" },
      en: { title: "Candy & Gum", description: "Candy, gummies, gum, lollipops" },
      ru: { title: "Конфеты и Жвачка", description: "Конфеты, мармелад, жвачка" },
      el: { title: "Καραμέλες & Τσίχλες", description: "Καραμέλες, ζελεδάκια, τσίχλες" },
    }},
    { slug: "kuruyemis", order: 60, i18n: {
      tr: { title: "Kuruyemiş", description: "Fıstık, badem, ceviz ve karışık kuruyemiş" },
      en: { title: "Nuts & Dried Fruit", description: "Peanuts, almonds, walnuts, mixed nuts" },
      ru: { title: "Орехи и Сухофрукты", description: "Арахис, миндаль, грецкий орех" },
      el: { title: "Ξηροί Καρποί", description: "Φιστίκια, αμύγδαλα, καρύδια" },
    }},
    { slug: "cerez_misir", order: 70, i18n: {
      tr: { title: "Patlamış Mısır & Tuzlu Çerezler", description: "Patlamış mısır, mini gevrek, cheetos" },
      en: { title: "Popcorn & Corn Snacks", description: "Popcorn, corn snacks, cheetos" },
      ru: { title: "Попкорн и Кукурузные Снеки", description: "Попкорн, кукурузные снеки" },
      el: { title: "Ποπ Κορν & Σνακ Καλαμποκιού", description: "Ποπ κορν, σνακ καλαμποκιού" },
    }},
    { slug: "protein_bar", order: 80, i18n: {
      tr: { title: "Protein & Tahıl Barları", description: "Protein bar, müsli bar, tahıl barı" },
      en: { title: "Protein & Cereal Bars", description: "Protein bars, muesli bars, cereal bars" },
      ru: { title: "Протеиновые и Злаковые Батончики", description: "Протеиновые батончики, мюсли" },
      el: { title: "Μπάρες Πρωτεΐνης & Δημητριακών", description: "Μπάρες πρωτεΐνης, μούσλι" },
    }},
  ],

  [MAIN_KEYS.ICECEKLER]: [
    { slug: "gazli_icecekler", order: 10, i18n: {
      tr: { title: "Gazlı İçecekler", description: "Kola, gazoz ve diğer gazlı içecekler" },
      en: { title: "Carbonated Drinks", description: "Cola, soda and other fizzy drinks" },
      ru: { title: "Газированные Напитки", description: "Кола, лимонад и другие" },
      el: { title: "Αναψυκτικά", description: "Κόλα, σόδα και άλλα αναψυκτικά" },
    }},
    { slug: "su_maden_suyu", order: 20, i18n: {
      tr: { title: "Su & Maden Suyu", description: "Doğal kaynak suyu, maden suyu, soda" },
      en: { title: "Water & Sparkling Water", description: "Spring water, mineral water, soda" },
      ru: { title: "Вода и Минеральная Вода", description: "Родниковая, минеральная вода, содовая" },
      el: { title: "Νερό & Ανθρακούχο Νερό", description: "Εμφιαλωμένο νερό, σόδα" },
    }},
    { slug: "meyve_suyu", order: 30, i18n: {
      tr: { title: "Meyve Suyu", description: "Meyve suları ve nektarlar" },
      en: { title: "Fruit Juice", description: "Fruit juices and nectars" },
      ru: { title: "Фруктовый Сок", description: "Соки и нектары" },
      el: { title: "Χυμός Φρούτων", description: "Χυμοί και νέκταρ φρούτων" },
    }},
    { slug: "hazir_kahve_cay", order: 40, i18n: {
      tr: { title: "Hazır Kahve & Çay", description: "İçime hazır soğuk çay ve kahve" },
      en: { title: "Ready-to-drink Coffee & Tea", description: "Ready-to-drink iced tea and coffee" },
      ru: { title: "Готовый Кофе и Чай", description: "Готовый холодный чай и кофе" },
      el: { title: "Έτοιμος Καφές & Τσάι", description: "Έτοιμο παγωμένο τσάι και καφές" },
    }},
    { slug: "enerji_sporcu", order: 50, i18n: {
      tr: { title: "Enerji & Sporcu İçecekleri", description: "Enerji içecekleri ve izotonik içecekler" },
      en: { title: "Energy & Sports Drinks", description: "Energy drinks and isotonic drinks" },
      ru: { title: "Энергетики и Спортивные Напитки", description: "Энергетики и изотоники" },
      el: { title: "Ενεργειακά & Αθλητικά Ποτά", description: "Ενεργειακά και ισοτονικά ποτά" },
    }},
    { slug: "bitki_cayi_demlik", order: 60, i18n: {
      tr: { title: "Çay & Kahve (Demlik/Paket)", description: "Poşet çay, demlik çay, bitki çayı, kahve" },
      en: { title: "Tea & Coffee (Packaged)", description: "Tea bags, loose tea, herbal tea, coffee" },
      ru: { title: "Чай и Кофе (Пакетированный)", description: "Пакетированный чай, травяной чай, кофе" },
      el: { title: "Τσάι & Καφές (Συσκευασμένο)", description: "Φακελάκια τσαγιού, βότανα, καφές" },
    }},
    { slug: "bitki_sutu", order: 70, i18n: {
      tr: { title: "Bitkisel Süt & İçecek", description: "Badem, soya, yulaf sütü" },
      en: { title: "Plant-based Milk", description: "Almond, soy, oat milk" },
      ru: { title: "Растительное Молоко", description: "Миндальное, соевое, овсяное молоко" },
      el: { title: "Φυτικό Γάλα", description: "Γάλα αμυγδάλου, σόγιας, βρώμης" },
    }},
  ],

  [MAIN_KEYS.KURU_GIDA]: [
    { slug: "makarna_seriyye", order: 10, i18n: {
      tr: { title: "Makarna & Şehriye", description: "Makarna, şehriye, erişte" },
      en: { title: "Pasta & Noodles", description: "Pasta, noodles, vermicelli" },
      ru: { title: "Макароны и Лапша", description: "Макароны, лапша, вермишель" },
      el: { title: "Ζυμαρικά & Νούντλς", description: "Ζυμαρικά, νούντλς, χυλοπίτες" },
    }},
    { slug: "pirinc_bakliyat", order: 20, i18n: {
      tr: { title: "Pirinç & Bakliyat", description: "Pirinç, mercimek, nohut, fasulye" },
      en: { title: "Rice & Pulses", description: "Rice, lentils, chickpeas, beans" },
      ru: { title: "Рис и Бобовые", description: "Рис, чечевица, нут, фасоль" },
      el: { title: "Ρύζι & Όσπρια", description: "Ρύζι, φακές, ρεβίθια, φασόλια" },
    }},
    { slug: "un_irmik", order: 30, i18n: {
      tr: { title: "Un & İrmik", description: "Buğday unu, mısır unu, irmik" },
      en: { title: "Flour & Semolina", description: "Wheat flour, corn flour, semolina" },
      ru: { title: "Мука и Манка", description: "Пшеничная мука, кукурузная мука, манка" },
      el: { title: "Αλεύρι & Σιμιγδάλι", description: "Αλεύρι σίτου, καλαμποκάλευρο, σιμιγδάλι" },
    }},
    { slug: "sivi_yag", order: 40, i18n: {
      tr: { title: "Sıvı Yağ", description: "Ayçiçek yağı, zeytinyağı, kanola yağı" },
      en: { title: "Cooking Oil", description: "Sunflower oil, olive oil, canola oil" },
      ru: { title: "Растительное Масло", description: "Подсолнечное, оливковое, масло канолы" },
      el: { title: "Μαγειρικό Λάδι", description: "Ηλιέλαιο, ελαιόλαδο, λάδι κανόλα" },
    }},
    { slug: "salca_sos", order: 50, i18n: {
      tr: { title: "Salça & Sos", description: "Domates salçası, biber salçası, hazır soslar" },
      en: { title: "Tomato Paste & Sauces", description: "Tomato paste, pepper paste, ready sauces" },
      ru: { title: "Томатная Паста и Соусы", description: "Томатная паста, перечная паста, соусы" },
      el: { title: "Πάστα Ντομάτας & Σάλτσες", description: "Πάστα ντομάτας, πιπεριάς, σάλτσες" },
    }},
    { slug: "ketcap_mayonez", order: 55, i18n: {
      tr: { title: "Ketçap & Mayonez", description: "Ketçap, mayonez, hardal ve diğer soslar" },
      en: { title: "Ketchup & Mayonnaise", description: "Ketchup, mayonnaise, mustard and other sauces" },
      ru: { title: "Кетчуп и Майонез", description: "Кетчуп, майонез, горчица и другие соусы" },
      el: { title: "Κέτσαπ & Μαγιονέζα", description: "Κέτσαπ, μαγιονέζα, μουστάρδα" },
    }},
    { slug: "baharat_tuz", order: 60, i18n: {
      tr: { title: "Baharat & Tuz", description: "Baharatlar, tuz çeşitleri" },
      en: { title: "Spices & Salt", description: "Spices, salt varieties" },
      ru: { title: "Специи и Соль", description: "Специи, виды соли" },
      el: { title: "Μπαχαρικά & Αλάτι", description: "Μπαχαρικά, είδη αλατιού" },
    }},
    { slug: "seker", order: 70, i18n: {
      tr: { title: "Şeker", description: "Toz şeker, kesme şeker, pudra şekeri" },
      en: { title: "Sugar", description: "Granulated sugar, cube sugar, powdered sugar" },
      ru: { title: "Сахар", description: "Сахарный песок, кусковой, сахарная пудра" },
      el: { title: "Ζάχαρη", description: "Κρυσταλλική ζάχαρη, ζάχαρη σε κύβους" },
    }},
    { slug: "corba", order: 80, i18n: {
      tr: { title: "Çorba", description: "Paket çorbalar, bulyon" },
      en: { title: "Soup", description: "Packaged soups, bouillon" },
      ru: { title: "Суп", description: "Пакетированные супы, бульон" },
      el: { title: "Σούπα", description: "Συσκευασμένες σούπες, ζωμός" },
    }},
    { slug: "cay_kahve_paket", order: 90, i18n: {
      tr: { title: "Çay & Kahve (Paket)", description: "Demlik çay, kahve, çay/kahve ürünleri" },
      en: { title: "Tea & Coffee", description: "Loose tea, coffee products" },
      ru: { title: "Чай и Кофе", description: "Чай, кофе" },
      el: { title: "Τσάι & Καφές", description: "Τσάι, καφές" },
    }},
  ],

  [MAIN_KEYS.TEMIZLIK]: [
    { slug: "camasir_deterjani", order: 10, i18n: {
      tr: { title: "Çamaşır Deterjanı & Yumuşatıcı", description: "Çamaşır deterjanı, yumuşatıcı, leke çıkarıcı" },
      en: { title: "Laundry Detergent & Softener", description: "Laundry detergent, fabric softener, stain remover" },
      ru: { title: "Стиральный Порошок и Кондиционер", description: "Стиральный порошок, кондиционер, пятновыводитель" },
      el: { title: "Απορρυπαντικό Πλυντηρίου", description: "Απορρυπαντικό, μαλακτικό, αφαιρετικό λεκέδων" },
    }},
    { slug: "bulasik", order: 20, i18n: {
      tr: { title: "Bulaşık Ürünleri", description: "Bulaşık deterjanı, makinesi tableti, parlatıcı" },
      en: { title: "Dishwashing", description: "Dish soap, dishwasher tablets, rinse aid" },
      ru: { title: "Средства для Посуды", description: "Средство для мытья посуды, таблетки, ополаскиватель" },
      el: { title: "Πλυντήριο Πιάτων", description: "Υγρό πιάτων, ταμπλέτες, γυαλιστικό" },
    }},
    { slug: "yuzey_temizleyici", order: 30, i18n: {
      tr: { title: "Yüzey & Genel Temizlik", description: "Yüzey temizleyiciler, çamaşır suyu, cam bezi" },
      en: { title: "Surface & General Cleaning", description: "Surface cleaners, bleach, cleaning cloths" },
      ru: { title: "Чистка Поверхностей", description: "Чистящие средства, отбеливатель, тряпки" },
      el: { title: "Καθαρισμός Επιφανειών", description: "Καθαριστικά επιφανειών, χλωρίνη, πανιά" },
    }},
    { slug: "kagit_urunleri", order: 40, i18n: {
      tr: { title: "Kağıt Ürünleri", description: "Tuvalet kağıdı, kağıt havlu, peçete" },
      en: { title: "Paper Products", description: "Toilet paper, paper towels, napkins" },
      ru: { title: "Бумажная Продукция", description: "Туалетная бумага, бумажные полотенца, салфетки" },
      el: { title: "Χάρτινα Προϊόντα", description: "Χαρτί υγείας, χαρτί κουζίνας, χαρτοπετσέτες" },
    }},
    { slug: "cop_posetleri", order: 50, i18n: {
      tr: { title: "Çöp Poşeti & Sünger", description: "Çöp poşeti, sünger, mikrofiber bez" },
      en: { title: "Trash Bags & Sponges", description: "Trash bags, sponges, microfiber cloths" },
      ru: { title: "Мусорные Мешки и Губки", description: "Мусорные пакеты, губки, микрофибра" },
      el: { title: "Σακούλες Σκουπιδιών & Σφουγγάρια", description: "Σακούλες σκουπιδιών, σφουγγάρια" },
    }},
  ],

  [MAIN_KEYS.KISISEL_BAKIM]: [
    { slug: "sac_bakim", order: 10, i18n: {
      tr: { title: "Saç Bakım", description: "Şampuan, saç kremi, saç bakım ürünleri" },
      en: { title: "Hair Care", description: "Shampoo, conditioner, hair care products" },
      ru: { title: "Уход за Волосами", description: "Шампунь, кондиционер, средства для волос" },
      el: { title: "Φροντίδα Μαλλιών", description: "Σαμπουάν, μαλακτικό, προϊόντα μαλλιών" },
    }},
    { slug: "agiz_bakim", order: 20, i18n: {
      tr: { title: "Ağız Bakım", description: "Diş macunu, diş fırçası, ağız bakım ürünleri" },
      en: { title: "Oral Care", description: "Toothpaste, toothbrush, oral care products" },
      ru: { title: "Уход за Полостью Рта", description: "Зубная паста, зубная щётка" },
      el: { title: "Στοματική Φροντίδα", description: "Οδοντόπαστα, οδοντόβουρτσα" },
    }},
    { slug: "dus_sabun", order: 30, i18n: {
      tr: { title: "Duş & Sabun", description: "Duş jeli, sabun, banyo ürünleri" },
      en: { title: "Shower & Soap", description: "Shower gel, soap, bath products" },
      ru: { title: "Душ и Мыло", description: "Гель для душа, мыло" },
      el: { title: "Ντους & Σαπούνι", description: "Αφρόλουτρο, σαπούνι" },
    }},
    { slug: "deodorant_parfum", order: 40, i18n: {
      tr: { title: "Deodorant & Parfüm", description: "Deodorant, roll-on, parfüm" },
      en: { title: "Deodorant & Perfume", description: "Deodorant, roll-on, perfume" },
      ru: { title: "Дезодорант и Парфюм", description: "Дезодорант, ролик, парфюм" },
      el: { title: "Αποσμητικό & Άρωμα", description: "Αποσμητικό, roll-on, άρωμα" },
    }},
    { slug: "tiras", order: 50, i18n: {
      tr: { title: "Tıraş Ürünleri", description: "Tıraş makinesi, jilet, tıraş köpüğü" },
      en: { title: "Shaving", description: "Razors, blades, shaving foam" },
      ru: { title: "Бритьё", description: "Станки, лезвия, пена для бритья" },
      el: { title: "Ξύρισμα", description: "Ξυραφάκια, αφρός ξυρίσματος" },
    }},
    { slug: "kadin_hijyen", order: 60, i18n: {
      tr: { title: "Kadın Hijyeni", description: "Kadın hijyen ürünleri" },
      en: { title: "Feminine Hygiene", description: "Feminine hygiene products" },
      ru: { title: "Женская Гигиена", description: "Средства женской гигиены" },
      el: { title: "Γυναικεία Υγιεινή", description: "Προϊόντα γυναικείας υγιεινής" },
    }},
    { slug: "cilt_bakim", order: 70, i18n: {
      tr: { title: "Cilt Bakım & Kozmetik", description: "Krem, makyaj temizleme, kozmetik ürünler" },
      en: { title: "Skin Care & Cosmetics", description: "Cream, makeup remover, cosmetics" },
      ru: { title: "Уход за Кожей и Косметика", description: "Крем, средство для снятия макияжа" },
      el: { title: "Φροντίδα Δέρματος & Καλλυντικά", description: "Κρέμα, ντεμακιγιάζ, καλλυντικά" },
    }},
  ],

  [MAIN_KEYS.ALKOL_TUTUN]: [
    { slug: "bira", order: 10, i18n: {
      tr: { title: "Bira", description: "Şişe ve kutu bira çeşitleri" },
      en: { title: "Beer", description: "Bottled and canned beer" },
      ru: { title: "Пиво", description: "Пиво в бутылках и банках" },
      el: { title: "Μπύρα", description: "Μπύρα σε φιάλη και κουτί" },
    }},
    { slug: "sarap", order: 20, i18n: {
      tr: { title: "Şarap", description: "Kırmızı, beyaz ve roze şaraplar" },
      en: { title: "Wine", description: "Red, white and rosé wine" },
      ru: { title: "Вино", description: "Красное, белое и розовое вино" },
      el: { title: "Κρασί", description: "Κόκκινο, λευκό και ροζέ κρασί" },
    }},
    { slug: "yuksek_alkollu", order: 30, i18n: {
      tr: { title: "Yüksek Alkollü İçkiler", description: "Rakı, viski, votka, likör, gin" },
      en: { title: "Spirits", description: "Raki, whisky, vodka, liqueur, gin" },
      ru: { title: "Крепкий Алкоголь", description: "Раки, виски, водка, ликёр, джин" },
      el: { title: "Ποτά Υψηλής Περιεκτικότητας", description: "Ρακί, ουίσκι, βότκα, λικέρ, τζιν" },
    }},
    { slug: "sigara_tutun", order: 40, i18n: {
      tr: { title: "Sigara & Tütün", description: "Sigara, puro, tütün ürünleri" },
      en: { title: "Cigarettes & Tobacco", description: "Cigarettes, cigars, tobacco products" },
      ru: { title: "Сигареты и Табак", description: "Сигареты, сигары, табачная продукция" },
      el: { title: "Τσιγάρα & Καπνός", description: "Τσιγάρα, πούρα, καπνικά προϊόντα" },
    }},
  ],

  [MAIN_KEYS.SUT_URUNLERI]: [
    { slug: "sut", order: 10, i18n: {
      tr: { title: "Süt", description: "Günlük süt, uzun ömürlü süt, konsantre süt" },
      en: { title: "Milk", description: "Fresh milk, UHT milk, condensed milk" },
      ru: { title: "Молоко", description: "Свежее молоко, длительного хранения, сгущённое" },
      el: { title: "Γάλα", description: "Φρέσκο γάλα, γάλα μακράς διαρκείας" },
    }},
    { slug: "yogurt_ayran", order: 20, i18n: {
      tr: { title: "Yoğurt & Ayran", description: "Yoğurt, ayran, kefir" },
      en: { title: "Yogurt & Ayran", description: "Yogurt, ayran, kefir" },
      ru: { title: "Йогурт и Айран", description: "Йогурт, айран, кефир" },
      el: { title: "Γιαούρτι & Αϊράνι", description: "Γιαούρτι, αϊράνι, κεφίρ" },
    }},
    { slug: "kaymak_krema", order: 30, i18n: {
      tr: { title: "Kaymak & Krema", description: "Kaymak, krema ürünleri" },
      en: { title: "Clotted Cream & Cream", description: "Clotted cream, cream products" },
      ru: { title: "Каймак и Сливки", description: "Каймак, сливочные продукты" },
      el: { title: "Καϊμάκι & Κρέμα", description: "Καϊμάκι, κρέμα γάλακτος" },
    }},
  ],

  [MAIN_KEYS.KONSERVE_HAZIR]: [
    { slug: "konserve", order: 10, i18n: {
      tr: { title: "Konserve", description: "Ton balığı, fasulye, sebze konserveleri" },
      en: { title: "Canned Goods", description: "Canned tuna, beans, vegetables" },
      ru: { title: "Консервы", description: "Тунец, фасоль, овощные консервы" },
      el: { title: "Κονσέρβες", description: "Τόνος, φασόλια, λαχανικά σε κονσέρβα" },
    }},
    { slug: "hazir_yemek", order: 20, i18n: {
      tr: { title: "Hazır Yemek", description: "Dondurulmuş hazır yemek, pizza, dolma-sarma" },
      en: { title: "Ready Meals", description: "Ready meals, pizza, stuffed vegetables" },
      ru: { title: "Готовые Блюда", description: "Готовые блюда, пицца, долма" },
      el: { title: "Έτοιμα Γεύματα", description: "Έτοιμα γεύματα, πίτσα, ντολμάδες" },
    }},
    { slug: "tursu", order: 30, i18n: {
      tr: { title: "Turşu", description: "Turşu çeşitleri" },
      en: { title: "Pickles", description: "Pickled vegetables" },
      ru: { title: "Соленья", description: "Маринованные овощи" },
      el: { title: "Τουρσί", description: "Τουρσί λαχανικών" },
    }},
  ],

  [MAIN_KEYS.DONDURULMUS]: [
    { slug: "dondurma", order: 10, i18n: {
      tr: { title: "Dondurma", description: "Dondurma çeşitleri" },
      en: { title: "Ice Cream", description: "Ice cream varieties" },
      ru: { title: "Мороженое", description: "Виды мороженого" },
      el: { title: "Παγωτό", description: "Ποικιλίες παγωτού" },
    }},
    { slug: "dondurulmus_gida", order: 20, i18n: {
      tr: { title: "Dondurulmuş Gıda", description: "Dondurulmuş sebze, patates, hamur işi" },
      en: { title: "Frozen Food", description: "Frozen vegetables, potatoes, pastry" },
      ru: { title: "Замороженные Продукты", description: "Замороженные овощи, картофель" },
      el: { title: "Κατεψυγμένα Τρόφιμα", description: "Κατεψυγμένα λαχανικά, πατάτες" },
    }},
  ],

  [MAIN_KEYS.BEBEK_COCUK]: [
    { slug: "bebek_bezi", order: 10, i18n: {
      tr: { title: "Bebek Bezi", description: "Bebek bezi ve ıslak mendil" },
      en: { title: "Diapers & Wipes", description: "Diapers and baby wipes" },
      ru: { title: "Подгузники и Салфетки", description: "Подгузники и влажные салфетки" },
      el: { title: "Πάνες & Μωρομάντηλα", description: "Πάνες και μωρομάντηλα" },
    }},
    { slug: "bebek_mamasi", order: 20, i18n: {
      tr: { title: "Bebek Maması", description: "Bebek maması ve devam sütü" },
      en: { title: "Baby Food", description: "Baby food and formula" },
      ru: { title: "Детское Питание", description: "Детское питание и смеси" },
      el: { title: "Βρεφικές Τροφές", description: "Βρεφικές τροφές και γάλα" },
    }},
    { slug: "bebek_bakim", order: 30, i18n: {
      tr: { title: "Bebek Bakım", description: "Bebek yağı, pişik kremi, kolonya" },
      en: { title: "Baby Care", description: "Baby oil, diaper cream, cologne" },
      ru: { title: "Уход за Малышом", description: "Детское масло, крем от опрелостей" },
      el: { title: "Φροντίδα Μωρού", description: "Βρεφικό λάδι, κρέμα, κολόνια" },
    }},
  ],

  [MAIN_KEYS.EVCIL_HAYVAN]: [
    { slug: "kedi", order: 10, i18n: {
      tr: { title: "Kedi Ürünleri", description: "Kedi maması ve kedi kumu" },
      en: { title: "Cat Products", description: "Cat food and cat litter" },
      ru: { title: "Товары для Кошек", description: "Корм для кошек и наполнитель" },
      el: { title: "Προϊόντα Γάτας", description: "Τροφή γάτας και άμμος υγιεινής" },
    }},
    { slug: "kopek", order: 20, i18n: {
      tr: { title: "Köpek Ürünleri", description: "Köpek maması ve bakım ürünleri" },
      en: { title: "Dog Products", description: "Dog food and care products" },
      ru: { title: "Товары для Собак", description: "Корм для собак и уход" },
      el: { title: "Προϊόντα Σκύλου", description: "Τροφή σκύλου και φροντίδα" },
    }},
  ],

  [MAIN_KEYS.MEYVE_SEBZE]: [
    { slug: "meyve", order: 10, i18n: {
      tr: { title: "Meyve", description: "Taze ve dondurulmuş meyveler" },
      en: { title: "Fruit", description: "Fresh and frozen fruit" },
      ru: { title: "Фрукты", description: "Свежие и замороженные фрукты" },
      el: { title: "Φρούτα", description: "Φρέσκα και κατεψυγμένα φρούτα" },
    }},
    { slug: "sebze", order: 20, i18n: {
      tr: { title: "Sebze", description: "Taze ve dondurulmuş sebzeler" },
      en: { title: "Vegetables", description: "Fresh and frozen vegetables" },
      ru: { title: "Овощи", description: "Свежие и замороженные овощи" },
      el: { title: "Λαχανικά", description: "Φρέσκα και κατεψυγμένα λαχανικά" },
    }},
  ],

  [MAIN_KEYS.ET_TAVUK]: [
    { slug: "kirmizi_et", order: 10, i18n: {
      tr: { title: "Kırmızı Et", description: "Dana ve kuzu eti ürünleri" },
      en: { title: "Red Meat", description: "Beef and lamb products" },
      ru: { title: "Красное Мясо", description: "Говядина и баранина" },
      el: { title: "Κόκκινο Κρέας", description: "Μοσχάρι και αρνί" },
    }},
    { slug: "tavuk", order: 20, i18n: {
      tr: { title: "Tavuk", description: "Tavuk eti ürünleri" },
      en: { title: "Chicken", description: "Chicken products" },
      ru: { title: "Курица", description: "Куриные продукты" },
      el: { title: "Κοτόπουλο", description: "Προϊόντα κοτόπουλου" },
    }},
  ],

  [MAIN_KEYS.BALIK_DENIZ]: [
    { slug: "balik", order: 10, i18n: {
      tr: { title: "Balık", description: "Taze ve dondurulmuş balık çeşitleri" },
      en: { title: "Fish", description: "Fresh and frozen fish" },
      ru: { title: "Рыба", description: "Свежая и замороженная рыба" },
      el: { title: "Ψάρι", description: "Φρέσκο και κατεψυγμένο ψάρι" },
    }},
    { slug: "deniz_urunleri", order: 20, i18n: {
      tr: { title: "Deniz Ürünleri", description: "Karides, kalamar, midye ve diğer deniz ürünleri" },
      en: { title: "Seafood", description: "Shrimp, squid, mussels and other seafood" },
      ru: { title: "Морепродукты", description: "Креветки, кальмары, мидии" },
      el: { title: "Θαλασσινά", description: "Γαρίδες, καλαμάρι, μύδια" },
    }},
  ],

  [MAIN_KEYS.EV_GERECLER]: [
    { slug: "mutfak_gerecleri", order: 10, i18n: {
      tr: { title: "Mutfak Gereçleri", description: "Folyo, streç film, pişirme kağıdı, karton bardak, kağıt tabak" },
      en: { title: "Kitchen Supplies", description: "Foil, cling film, baking paper, paper cups, paper plates" },
      ru: { title: "Кухонные Принадлежности", description: "Фольга, плёнка, бумага для выпечки, стаканы, тарелки" },
      el: { title: "Είδη Κουζίνας", description: "Αλουμινόχαρτο, μεμβράνη, χαρτί ψησίματος, χάρτινα ποτήρια" },
    }},
    { slug: "temizlik_aletleri", order: 15, i18n: {
      tr: { title: "Temizlik Aletleri", description: "Süpürge, faraş, mop, ovma teli, temizlik jelleri" },
      en: { title: "Cleaning Tools", description: "Broom, dustpan, mop, scourer, cleaning gels" },
      ru: { title: "Инвентарь для Уборки", description: "Веник, совок, швабра, губки, чистящие гели" },
      el: { title: "Εργαλεία Καθαρισμού", description: "Σκούπα, φαράσι, σφουγγαρίστρα, συρματάκια" },
    }},
    { slug: "aydinlatma_pil", order: 25, i18n: {
      tr: { title: "Aydınlatma & Pil", description: "Ampul, LED lamba, pil" },
      en: { title: "Lighting & Batteries", description: "Bulbs, LED lamps, batteries" },
      ru: { title: "Освещение и Батарейки", description: "Лампочки, светодиодные лампы, батарейки" },
      el: { title: "Φωτισμός & Μπαταρίες", description: "Λάμπες, LED, μπαταρίες" },
    }},
    { slug: "ev_gerecleri_diger", order: 30, i18n: {
      tr: { title: "Ev Gereçleri", description: "Mum, çakmak, oyuncak ve diğer ev ürünleri" },
      en: { title: "Household Items", description: "Candles, lighters, toys and other items" },
      ru: { title: "Товары для Дома", description: "Свечи, зажигалки, игрушки" },
      el: { title: "Οικιακά Είδη", description: "Κεριά, αναπτήρες, παιχνίδια" },
    }},
  ],

  [MAIN_KEYS.TATLI_SEKERLEME]: [
    { slug: "puding_muhallebi", order: 10, i18n: {
      tr: { title: "Puding & Muhallebi", description: "Hazır puding, muhallebi, tatlı karışımları" },
      en: { title: "Pudding & Custard", description: "Ready pudding, custard, dessert mixes" },
      ru: { title: "Пудинг и Пудинги", description: "Готовый пудинг, десертные смеси" },
      el: { title: "Πουτίγκα & Κρέμα", description: "Έτοιμη πουτίγκα, μείγματα επιδορπίων" },
    }},
    { slug: "kek_karisim", order: 20, i18n: {
      tr: { title: "Kek Karışımı & Kurabiye", description: "Hazır kek karışımı, kurabiye" },
      en: { title: "Cake Mix & Cookies", description: "Ready cake mix, cookies" },
      ru: { title: "Смесь для Кекса и Печенье", description: "Смесь для выпечки, печенье" },
      el: { title: "Μείγμα Κέικ & Μπισκότα", description: "Έτοιμο μείγμα κέικ, μπισκότα" },
    }},
  ],
};

// ─────────────────────────────────────────────────────────────
// 3) ANA KATEGORİ EŞLEME: CSV `kategori` → CoreCategory.key
// ─────────────────────────────────────────────────────────────
const CSV_CATEGORY_MAP = {
  "ATISTIRMALIK": MAIN_KEYS.ATISTIRMALIK,
  "TEMEL GIDA": MAIN_KEYS.KURU_GIDA,
  "ICECEKLER": MAIN_KEYS.ICECEKLER,
  "KISISEL BAKIM": MAIN_KEYS.KISISEL_BAKIM,
  "EV YASAM & BAKIM": MAIN_KEYS.EV_GERECLER, // keyword ile temizlik/ev_gerecler'e bölünecek
  "PEYNIR - YOGURT - KAHVALTILIK": MAIN_KEYS.KAHVALTILIK, // keyword ile sut_urunleri'ne de dağılacak
  "ALKOL VE SIGARA": MAIN_KEYS.ALKOL_TUTUN,
  "YIYECEK & KONSERVE": MAIN_KEYS.KONSERVE_HAZIR,
  "MEYVE VE SEBZE": MAIN_KEYS.MEYVE_SEBZE,
  "SU-BUZ / DONDURMA": MAIN_KEYS.ICECEKLER, // keyword ile dondurulmus'a da dağılacak
  "TATLI": MAIN_KEYS.TATLI_SEKERLEME,
  "ET / TAVUK / DENIZ URUNLERI": MAIN_KEYS.ET_TAVUK, // keyword ile balik_deniz'e de dağılacak
  "BEBEK": MAIN_KEYS.BEBEK_COCUK,
  "EVCIL HAYVAN": MAIN_KEYS.EVCIL_HAYVAN,
  "TEREYAG / MARGARIN / KAYMAK": MAIN_KEYS.KAHVALTILIK,
  "CINSEL SAGLIK": MAIN_KEYS.CINSEL_SAGLIK,
  "CIKOLATA": MAIN_KEYS.ATISTIRMALIK,
  "GUNLUK SUT & AYRAN": MAIN_KEYS.SUT_URUNLERI,
  "GLUTENSIZ URUNLER": MAIN_KEYS.SAGLIKLI_ORGANIK,
};

// ─────────────────────────────────────────────────────────────
// 4) SINIFLANDIRMA KURALLARI (ürün adı anahtar kelimeleri)
//    Her kural: { mainOverride?: ana key override, sub: alt slug, words: [...] }
//    Kurallar CSV ana kategorisi bağlamında sırayla denenir; ilk eşleşen kazanır.
// ─────────────────────────────────────────────────────────────

function classify(csvCategoryRaw, titleRaw) {
  const csvCat = normalizeTr(csvCategoryRaw);
  const title = normalizeTr(titleRaw);
  const mainKeyDefault = CSV_CATEGORY_MAP[csvCat] || null;

  // ── EV YASAM & BAKIM → temizlik vs ev_gerecler ──
  if (csvCat === "EV YASAM & BAKIM") {
    if (has(title, "BULASIK", "FAIRY", "FINISH", "PARLATICI MAKINE", "PARLATICI", "BULASIK MAKINESI")) {
      return { main: MAIN_KEYS.TEMIZLIK, sub: "bulasik" };
    }
    if (has(title, "DETERJAN", "YUMUSATICI", "ARIEL", "BINGO", "OMO", "PERSIL", "PERWOLL")) {
      return { main: MAIN_KEYS.TEMIZLIK, sub: "camasir_deterjani" };
    }
    if (has(title, "TUVALET KAGIDI", "KAGIT HAVLU", "PECETE", "MENDIL", "HAVLU CEP")) {
      return { main: MAIN_KEYS.TEMIZLIK, sub: "kagit_urunleri" };
    }
    if (has(title, "COP TORBASI", "COP POSETI", "SUNGER", "MIKROFIBER", "CAM BEZI", "TEMIZLIK BEZI", "OVMA TELI", "IZGARA TELI")) {
      return { main: MAIN_KEYS.TEMIZLIK, sub: "cop_posetleri" };
    }
    if (has(title, "CIF", "DOMESTOS", "GLADE", "AIR WICK", "YUZEY TEMIZLEYICI", "YUZEY TEMIZLIK", "KLOZET", "TUVALET UZMANI", "ODA SPREYI", "SPREY")) {
      return { main: MAIN_KEYS.TEMIZLIK, sub: "yuzey_temizleyici" };
    }
    if (has(title, "AMPUL", "LED LAMBA", "LED BURGU", "LUMAR")) {
      return { main: MAIN_KEYS.EV_GERECLER, sub: "aydinlatma_pil" };
    }
    if (has(title, "PIL", "KODAK", "DURACELL")) {
      return { main: MAIN_KEYS.EV_GERECLER, sub: "aydinlatma_pil" };
    }
    if (has(title, "MOP", "FARAS", "SUPURGE", "OVMA TELI", "IZGARA TELI", "ACE POWER", "FLUETEX", "KARINCA GRANULU")) {
      return { main: MAIN_KEYS.EV_GERECLER, sub: "temizlik_aletleri" };
    }
    if (has(title, "PISIRME KAGIDI", "SAR PISIR", "STREC FILM", "FOLYO", "KARTON BARDAK", "KARTON TABAK", "KURDAN")) {
      return { main: MAIN_KEYS.EV_GERECLER, sub: "mutfak_gerecleri" };
    }
    if (has(title, "MUM", "CAKMAK", "KIBRIT", "KOLI BANDI", "BALON", "TUTUSTURUCU", "BUZ TORBASI", "BUZDOLABI POSETI", "FIRIN TORBASI", "FUTBOL TOPU", "OYUNCAK")) {
      return { main: MAIN_KEYS.EV_GERECLER, sub: "ev_gerecleri_diger" };
    }
    if (has(title, "FERRY") && has(title, "BEEF", "POULTRY", "VENISON")) {
      return { main: MAIN_KEYS.EVCIL_HAYVAN, sub: "kopek" };
    }
    if (has(title, "KARTON", "BARDAK", "TABAK", "POSET", "TORBA")) {
      return { main: MAIN_KEYS.EV_GERECLER, sub: "mutfak_gerecleri" };
    }
    return { main: MAIN_KEYS.EV_GERECLER, sub: "ev_gerecleri_diger" };
  }

  // ── SU-BUZ / DONDURMA → dondurma vs su ──
  if (csvCat === "SU-BUZ / DONDURMA") {
    if (has(title, "DONDURMA", "ALGIDA", "CORNETTO", "MAGNUM", "MARAS", "PLOMBIR", "NOGGER", "MASSIMO")) {
      return { main: MAIN_KEYS.DONDURULMUS, sub: "dondurma" };
    }
    if (has(title, "SU", "BUZ")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "su_maden_suyu" };
    }
    return { main: MAIN_KEYS.ICECEKLER, sub: "su_maden_suyu" };
  }

  // ── PEYNIR - YOGURT - KAHVALTILIK → sut_urunleri vs kahvaltilik alt ──
  if (csvCat === "PEYNIR - YOGURT - KAHVALTILIK" || csvCat === "TEREYAG / MARGARIN / KAYMAK") {
    if (has(title, "YOGURT", "AYRAN", "KEFIR")) {
      return { main: MAIN_KEYS.SUT_URUNLERI, sub: "yogurt_ayran" };
    }
    if (has(title, "SUT")) {
      return { main: MAIN_KEYS.SUT_URUNLERI, sub: "sut" };
    }
    if (has(title, "KAYMAK")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "tereyagi_margarin" };
    }
    if (has(title, "TEREYAG", "MARGARIN", "MARGRIN", "BECEL", "SANA", "ONA ", "KERRYGOLD")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "tereyagi_margarin" };
    }
    if (has(title, "PEYNIR", "HELLIM", "KASAR", "CHEESE", "LABNE", "MOZZARELLA", "CHEDDAR", "EMMENTALER", "DANABLU", "EDAM", "GOUDA", "CECIL", "DIL PEYNIRI", "ORGU PEYNIRI", "TAHSILDAROGLU", "EZINE")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "peynir" };
    }
    if (has(title, "ZEYTIN", "MARMARABIRLIK")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "zeytin" };
    }
    if (has(title, "SUCUK", "SALAM", "SOSIS", "PASTIRMA", "LUNCHEON", "KANGAL", "JAMBON", "FUME", "MARET", "ZWAN")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "sarkuteri" };
    }
    if (has(title, "COKOKREM")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "bal_recel_ezme" };
    }
    if (has(title, "YUMURTA")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "yumurta" };
    }
    if (has(title, "BAL", "RECEL", "PEKMEZ", "TAHIN", "MACUN", "HELVA")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: has(title, "TAHIN", "PEKMEZ", "MACUN", "HELVA") ? "tahin_pekmez_macun" : "bal_recel_ezme" };
    }
    if (has(title, "EZME")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "bal_recel_ezme" };
    }
    if (has(title, "KELLOGS", "GEVREK", "GRANOLA", "MUSLI", "CORN FLAKES", "CHOCOS", "FROSTIES", "KRAVE", "CHEERIOS", "GOLD FLAKES", "NESFIT", "NESQUIK", "TAM TAHIL")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "gevrek_musli" };
    }
    if (has(title, "NUTELLA", "NUT MASTER", "PEANUT BUTTER", "SUN-PAT")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "bal_recel_ezme" };
    }
    if (has(title, "QUARK", "SEK ")) {
      return { main: MAIN_KEYS.SUT_URUNLERI, sub: "yogurt_ayran" };
    }
    if (has(title, "MANGAL KEYFI")) {
      return { main: MAIN_KEYS.KAHVALTILIK, sub: "sarkuteri" };
    }
    if (has(title, "PECETE")) {
      return { main: MAIN_KEYS.TEMIZLIK, sub: "kagit_urunleri" };
    }
    if (has(title, "DEODORANT")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "deodorant_parfum" };
    }
    if (has(title, "LIFALIF", "KURUYEMISLI")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "protein_bar" };
    }
    if (has(title, "SOS")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "salca_sos" };
    }
    return { main: MAIN_KEYS.KAHVALTILIK, sub: null };
  }

  // ── TEMEL GIDA → kuru_gida altları + cay/kahve ayrımı ──
  if (csvCat === "TEMEL GIDA") {
    if (has(title, "CAY", "KAHVE", "NESCAFE", "CAYKUR", "DOGADAN")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "cay_kahve_paket" };
    }
    if (has(title, "MAKARNA", "SEHRIYE", "ERISTE", "BARILLA", "ARBELLA", "SPAGETTI", "SPAGHETTI", "TAGLIATELLE", "LASAGNE", "FILIZ TAM BUGDAY")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "makarna_seriyye" };
    }
    if (has(title, "PESOTTI KEDI DILI")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
    }
    if (has(title, "PIRINC", "MERCIMEK", "NOHUT", "FASULYE", "BAKLIYAT", "BULGUR", "BEZELYE", "BAKLA", "BORULCE", "ASURELIK BUGDAY", "BARBUNYA", "KARA BUGDAY", "GLUTENSIZ")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "pirinc_bakliyat" };
    }
    if (has(title, "MISIR UNU", "UN ", "IRMIK", "GALETA UNU") || title.endsWith(" UN") || has(title, "KEK UN")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "un_irmik" };
    }
    if (has(title, "YAG", "ZEYTINYAGI", "AYCICEK")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "sivi_yag" };
    }
    if (has(title, "KETCAP", "MAYONEZ")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "ketcap_mayonez" };
    }
    if (has(title, "SALCA", "SOS", "CALVE", "DOMATES")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "salca_sos" };
    }
    if (has(
      title,
      "BAHARAT", "TUZ", "KIMYON", "KEKIK", "NANE", "TARCIN", "KARABIBER", "PULBIBER", "ZERDECAL",
      "SUMAK", "DEFNE", "ANASON", "KARANFIL", "BAHARYOLU", "BIBER", "ASPIR", "BIBERIYE", "BIRYANI",
      "CHIA TOHUMU", "COREKOTU", "DOLMABAHARI", "GOLYANDRO", "HINDISTAN CEVIZI", "IHLAMUR", "ISOT",
      "KARBONAT", "KENDIR TOHUMU", "KETEN TOHUMU", "KOFTEBAHARI", "KORI", "H CEVIZI", "KUSUZUMU",
      "MEZLEKI", "REZENE", "SARIMSAK", "SINEMAKI", "YESILCAY", "ZENCEFIL", "FAJITA", "CAJUN"
    )) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "baharat_tuz" };
    }
    if (has(title, "SEKER")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "seker" };
    }
    if (has(title, "CORBA", "BULYON", "KNORR", "CESNI", "HARCI")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "corba" };
    }
    if (has(title, "EKMEK", "KARDESLER", "PIDESI", "LAVAS", "YUFKA", "TORTILLA")) {
      return { main: MAIN_KEYS.EKMEK_FIRINDA, sub: null };
    }
    if (has(title, "SIRKE", "CHIPOTLE", "HEINZ KETCHUP")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: has(title, "SIRKE") ? "salca_sos" : "ketcap_mayonez" };
    }
    if (has(title, "NISASTA", "KABARTMA TOZU", "KAKAO", "JEL CILEK", "JEL VISNE")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "un_irmik" };
    }
    if (has(title, "KREMA")) {
      return { main: MAIN_KEYS.SUT_URUNLERI, sub: "kaymak_krema" };
    }
    return { main: MAIN_KEYS.KURU_GIDA, sub: null };
  }

  // ── ICECEKLER alt kırılım ──
  if (csvCat === "ICECEKLER") {
    if (has(title, "COCACOLA", "PEPSI", "FANTA", "SPRITE", "7 UP", "7UP", "BARR", "GAZOZ", "SODA", "COLA")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "gazli_icecekler" };
    }
    if (has(title, " SU ", "MADEN SUYU") || title.endsWith(" SU") || has(title, "EVSU", "HAYAT SU", "ERIKLI", "GOKSUN SU")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "su_maden_suyu" };
    }
    if (has(title, "MEYVE SUYU", "CAPPY", "DEL MONTE", "NEKTAR", "CORDIAL", "BLOOM", "CAPRI SUN", "KOOP", "PORTAKAL SUYU", "GREYFURT")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "meyve_suyu" };
    }
    if (has(title, "ALPRO", "BADEM SUTU", "SOYA SUTU", "YULAF SUTU")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "bitki_sutu" };
    }
    if (has(title, "ENERGY", "ENERJI", "BURN", "RED BULL", "SPORCU", "DARK BLUE")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "enerji_sporcu" };
    }
    if (has(title, "SOGUK CAY", "FUSE TEA", "ICE BREAK", "ICE TEA", "ICIM FIT")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "hazir_kahve_cay" };
    }
    if (has(title, "KAHVE", "CAFE", "NESCAFE", "CAPPUCCINO", "LATTE", "MOCHA", "ESPRESSO", "MR.BROWN", "MR BROWN", "SICAK CIKOLATA", "DAVIDOFF")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "hazir_kahve_cay" };
    }
    if (has(title, "CAY", "IHLAMUR", "PAPATYA", "BITKI CAYI", "LIPTON", "LONDON BRIDGE", "TWININGS")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "bitki_cayi_demlik" };
    }
    if (has(title, "SUT", "KEFIR")) {
      return { main: MAIN_KEYS.SUT_URUNLERI, sub: "sut" };
    }
    if (has(title, "COFFEE MATE", "NESQUIK STICK", "SALEP", "OZA ", "OZERLAT", "POKKA", "TCHIBO")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "hazir_kahve_cay" };
    }
    if (has(title, "PINAR", "TANGO")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "meyve_suyu" };
    }
    if (has(title, "SCHWEPPES", "TONIK", "TONIC", "SALGAM")) {
      return { main: MAIN_KEYS.ICECEKLER, sub: "gazli_icecekler" };
    }
    return { main: MAIN_KEYS.ICECEKLER, sub: null };
  }

  // ── ATISTIRMALIK alt kırılım (+ CIKOLATA CSV kategorisi de burada işlenir) ──
  if (csvCat === "ATISTIRMALIK" || csvCat === "CIKOLATA") {
    if (has(title, "KURABIYE", "KURABIY", "COOKIE")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
    }
    if (has(title, "CIPS", "LAYS", "DORITOS", "CHEETOS", "MARETTI CHIPS", "PRINGLES")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "cips_cerez" };
    }
    if (has(title, "PATLAMIS MISIR", "MISIR CUBUK")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "cerez_misir" };
    }
    if (has(title, "PROTEIN BAR", "MUSLI BAR", "YULAF BAR", "TAHIL BAR", "LIFALIF", "NESFIT")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "protein_bar" };
    }
    if (has(title, "SAKIZ", "ORBIT", "FALIM", "MENTOS SAKIZ", "OLIPS")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "sekerleme_sakiz" };
    }
    if (has(title, "SEKER", "SEKERLEME", "JELLY", "JELIBON", "LOLIPOP", "CHUPA CHUPS", "HARIBO", "FINI", "MILLIONS", "GUMMY", "DRAJE")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "sekerleme_sakiz" };
    }
    if (has(title, "KEK", "KRUVASAN", "CIAMBELLA", "PLUM CAKE", "CORNETTO", "RULO PASTA", "SANDVIC", "7 DAYS", "M.MASSIMO", "MAESTRO MASSIMO")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "kek_kruvasan" };
    }
    if (has(title, "BISKUVI", "GOFRET", "KRAKER", "BISCUIT", "CRACKER", "PETIT BEURRE", "DIGESTIVE", "GRISSINI", "WAFER", "PISMANIYE", "CREPE", "MC VITIES", "DEVON", "GOURMET MILK CHOCO", "GOURMET WHITE CHOCO")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
    }
    if (has(title, "CIKOLATA", "CHOCOLATE", "CHOCO", "KITKAT", "KINDER", "MARS", "BOUNTY", "MALTESERS", "M&M", "NESTLE", "CADBURY", "NUTELLA", "BISCOLATA", "GALAXY")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "cikolata" };
    }
    if (has(title, "FISTIK", "BADEM", "CEVIZ", "KURUYEMIS", "CEREZZA")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "kuruyemis" };
    }
    if (has(title, "SAKIZ", "BUBBLEGUM", "BABOL", "VIVIDENT", "MENTOS", "PEZ ")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "sekerleme_sakiz" };
    }
    if (has(title, "SNICKERS", "TWIX", "TAYAS", "TADELLE", "SOLEN", "RITTER SPORT", "SWIZZELS", "TAVENERS", "TOYBOX", "ZUBER CILEK", "ZUBER VANILYA")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "cikolata" };
    }
    if (has(title, "ZUBER")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "kuruyemis" };
    }
    if (has(title, "RUFFLES", "PANPAN", "TAKIS")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "cips_cerez" };
    }
    if (has(title, "TADIM", "TUCCAROGLU", "PEYMAN")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "kuruyemis" };
    }
    if (has(title, "JIMMY TOYS", "JIMMY CORNET", "ORIGINAL GOURMET", "DEV SURPRIZ", "HANIMELLER", "HARRIBO")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "sekerleme_sakiz" };
    }
    // ETI / ULKER geniş ürün gamı — varsayılan bisküvi/gofret hattı, kelime bazlı ince ayrım
    if (has(title, "ETI ", "ULKER")) {
      if (has(title, "SUT BURGER", "GONG", "HOSBES", "CANGA", "CRAX", "PUF", "MAKSIMUS", "MAXIMUS", "WANTED BUMBA", "CIZI", "KRISPI", "COCOSTAR")) {
        return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
      }
      if (has(title, "CIN ", "KOMBO", "PROBIS", "COKOPRENS", "ALBENI", "KARE FINDIK", "SAKLIKOY", "TOFFE", "RULOKAT", "IKRAM", "IKRAM FINDIKLI")) {
        return { main: MAIN_KEYS.ATISTIRMALIK, sub: "cikolata" };
      }
      if (has(title, "TUTKU", "BROWNI", "NERO", "BURCAK", "CICIBEBE", "FORM", "PETITBEURRE", "KREMALI", "AHENK", "BUMBO", "KARAM", "HALLEY", "LAVIVA", "PIKO", "KAT KAT TAT", "MAHLEPLI")) {
        return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
      }
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
    }
    if (has(title, "OZMO")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "cikolata" };
    }
    if (has(title, "WALKERS", "KAHVE DUNYASI GOFRIK")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
    }
    return { main: MAIN_KEYS.ATISTIRMALIK, sub: null };
  }

  // ── YIYECEK & KONSERVE ──
  if (csvCat === "YIYECEK & KONSERVE") {
    if (has(title, "TURSU")) {
      return { main: MAIN_KEYS.KONSERVE_HAZIR, sub: "tursu" };
    }
    if (has(title, "PIZZA", "SARMA", "DOLMA", "PILAV", "DONER", "NUGGET", "KOFTE", "HAZIR YEMEK", "MANTI", "MILFOY", "BOREK", "PIDE", "KISIR", "PILAKI", "HUMUS", "ATOM", "RUS SALATASI", "SIMIT", "POGACA", "KROKET", "PIROHU", "CORNED BEEF")) {
      return { main: MAIN_KEYS.KONSERVE_HAZIR, sub: "hazir_yemek" };
    }
    if (has(title, "TON", "DARDANEL", "SARDALYA", "KONSERVE", "FASULYE", "NOHUT", "BARBUNYA", "BIBER", "PATLICAN", "MISIR", "BEANS", "DURU HASLANMIS", "DURU PRATIK", "BIKLA", "BOGRULCE", "SWEET CORN", "KURUTULMUS DOMATES", "MANTAR", "EZME")) {
      return { main: MAIN_KEYS.KONSERVE_HAZIR, sub: "konserve" };
    }
    if (has(title, "EMBORG") && has(title, "BLUEBERR", "STRAWBERR")) {
      return { main: MAIN_KEYS.DONDURULMUS, sub: "dondurulmus_gida" };
    }
    return { main: MAIN_KEYS.KONSERVE_HAZIR, sub: null };
  }

  // ── ET / TAVUK / DENIZ URUNLERI ──
  if (csvCat === "ET / TAVUK / DENIZ URUNLERI") {
    if (has(title, "PILIC", "TAVUK", "KANAT", "BUT ", "GOGUS", "NUGGET", "SCHNITZEL", "CORDON BLEU", "KEBAP", "SENPILIC", "KIRNI")) {
      return { main: MAIN_KEYS.ET_TAVUK, sub: "tavuk" };
    }
    if (has(title, "BALIK", "SOMON", "USKUMRU", "HAMSI", "KALAMAR", "MIDYE", "YENGEC", "SUSHI", "MAKI", "MEZZEMARIN", "DENIZ")) {
      return { main: MAIN_KEYS.BALIK_DENIZ, sub: has(title, "KALAMAR", "MIDYE", "YENGEC") ? "deniz_urunleri" : "balik" };
    }
    if (has(title, "DANA", "KOFTE", "BONFILE", "DONER", "KASAP")) {
      return { main: MAIN_KEYS.ET_TAVUK, sub: "kirmizi_et" };
    }
    return { main: MAIN_KEYS.ET_TAVUK, sub: null };
  }

  // ── TATLI ──
  if (csvCat === "TATLI") {
    if (has(title, "PUDING", "MUHALLEBI", "KESKUL", "ASURE", "SUPANGLE", "TAVUKGOGSU", "KAZANDIBI", "KREM SANTI", "TIRILECE", "CREME OLE", "SUTLAC", "TAVUK GOGSU")) {
      return { main: MAIN_KEYS.TATLI_SEKERLEME, sub: "puding_muhallebi" };
    }
    if (has(title, "KURABIYE", "KURABIY", "COOKIE")) {
      return { main: MAIN_KEYS.ATISTIRMALIK, sub: "biskuvi_gofret" };
    }
    if (has(title, "KEK KARISIMI", "WAFFLE", "PANCAKE", "KREP", "PROFITEROL", "TIRAMISU", "REVANI", "MUFFIN", "IRMIK HELVASI", "KARAMELIZE")) {
      return { main: MAIN_KEYS.TATLI_SEKERLEME, sub: "kek_karisim" };
    }
    if (has(title, "PUDRA SEKERI")) {
      return { main: MAIN_KEYS.KURU_GIDA, sub: "seker" };
    }
    return { main: MAIN_KEYS.TATLI_SEKERLEME, sub: null };
  }

  // ── ALKOL VE SIGARA ──
  if (csvCat === "ALKOL VE SIGARA") {
    if (has(title, "BIRA", "EFES", "CARLSBERG", "AMSTERDAM", "CORONA", "BUD ", "BOMONTI", "MILLER", "STELLA ARTOIS", "TUBORG") || title.startsWith("BUD ")) {
      return { main: MAIN_KEYS.ALKOL_TUTUN, sub: "bira" };
    }
    if (has(title, "SARAP", "WINE", "CASTEL", "KAVAKLIDERE", "ANGORA", "SANGRIA", "CAPADOKIA", "MATEUS", "ROSE", "TOSCANELLO")) {
      return { main: MAIN_KEYS.ALKOL_TUTUN, sub: "sarap" };
    }
    if (has(title, "VODKA", "WHISKY", "WHISKEY", "GIN", "RAKI", "LIKOR", "BAILEYS", "JACK DANIELS", "JOHNNIE", "CHIVAS", "JAMESON", "GRANTS", "JB ", "ABSOLUT", "HENDRICKS", "BELLS", "CLAN MAC", "LABEL 5", "ANADOLU RAKI", "KULUP RAKI", "EFE GOLD RAKI", "GIBSONS", "CRUISER", "GO ANANAS", "GO KARPUZ", "GO KIRAZ", "GO ORMAN", "ABSENTE", "BALLANTINES", "OLMECA", "TEQUILA", "SARI ZEYBEK", "TEKIRDAG", "FAMOUS GROUSE", "WYBOROWA")) {
      return { main: MAIN_KEYS.ALKOL_TUTUN, sub: "yuksek_alkollu" };
    }
    if (has(title, "SIGARA", "MARLBORO", "KENT", "CAMEL", "DAVIDOFF", "DUNHILL", "GIZEH", "CAPTAIN BLACK", "CRAVEN", "CIGARILLOS", "CAKMAK", "KIBRIT", "TUTUN", "SARMALIK", "PARLIAMENT", "ROTHMANS", "RIZLA", "NUO", "HARVEST", "RAW CLASSIC", "SAMSUN", "SILK CUT", "TEKEL", "TEREA", "WINSTON", "THE DUKES OWN")) {
      return { main: MAIN_KEYS.ALKOL_TUTUN, sub: "sigara_tutun" };
    }
    return { main: MAIN_KEYS.ALKOL_TUTUN, sub: null };
  }

  // ── BEBEK ──
  if (csvCat === "BEBEK") {
    if (has(title, "BEZ", "CANBEBE", "MOLFIX", "ISLAK MENDIL", "PAPILION", "KORUYUCU ORTU")) {
      return { main: MAIN_KEYS.BEBEK_COCUK, sub: "bebek_bezi" };
    }
    if (has(title, "APTAMIL", "MAMA", "PRONUTRA")) {
      return { main: MAIN_KEYS.BEBEK_COCUK, sub: "bebek_mamasi" };
    }
    if (has(title, "DALIN", "KOLONYA", "PISIK", "VAZELIN", "SAMPUAN", "BEBEK YAGI")) {
      return { main: MAIN_KEYS.BEBEK_COCUK, sub: "bebek_bakim" };
    }
    return { main: MAIN_KEYS.BEBEK_COCUK, sub: null };
  }

  // ── EVCIL HAYVAN ──
  if (csvCat === "EVCIL HAYVAN") {
    if (has(title, "KEDI", "KUM")) {
      return { main: MAIN_KEYS.EVCIL_HAYVAN, sub: "kedi" };
    }
    if (has(title, "KOPEK", "DOG ", "FERRY", "CANGO")) {
      return { main: MAIN_KEYS.EVCIL_HAYVAN, sub: "kopek" };
    }
    return { main: MAIN_KEYS.EVCIL_HAYVAN, sub: null };
  }

  // ── MEYVE VE SEBZE ──
  if (csvCat === "MEYVE VE SEBZE") {
    // FEAST = dondurulmuş gıda markası (donuk bezelye/patates/çilek vb.)
    if (has(title, "FEAST", "SUPERFRESH DONUK", "DONDURULMUS")) {
      return { main: MAIN_KEYS.DONDURULMUS, sub: "dondurulmus_gida" };
    }
    const FRUITS = ["ANANAS", "ARMUT", "AVAKADO", "CHERRY DOMATES", "ELMA", "ERIK", "HINDISTAN CEVIZI", "LIMON", "MANGO", "MUZ", "PORTAKAL", "BOGURTLEN", "CILEK", "VISNE", "MIXED BERRIES"];
    const VEGGIES = ["BIBER", "DOMATES", "HAVUC", "KABAK", "LAHANA", "MARUL", "MAYDANOZ", "PANCAR", "PATATES", "PATLICAN", "SALATALIK", "SARIMSAK", "SOGAN", "BEZELYE", "BROKOLI", "ISPANAK", "FASULYE", "GARNITUR", "MISIR", "BAKLA", "BAMYA"];
    if (has(title, ...FRUITS)) return { main: MAIN_KEYS.MEYVE_SEBZE, sub: "meyve" };
    if (has(title, ...VEGGIES)) return { main: MAIN_KEYS.MEYVE_SEBZE, sub: "sebze" };
    return { main: MAIN_KEYS.MEYVE_SEBZE, sub: null };
  }

  // ── CINSEL SAGLIK / GLUTENSIZ / GUNLUK SUT & AYRAN — ana kategoriye direkt ──
  if (csvCat === "CINSEL SAGLIK") {
    return { main: MAIN_KEYS.CINSEL_SAGLIK, sub: null };
  }
  if (csvCat === "GUNLUK SUT & AYRAN") {
    if (has(title, "AYRAN")) return { main: MAIN_KEYS.SUT_URUNLERI, sub: "yogurt_ayran" };
    return { main: MAIN_KEYS.SUT_URUNLERI, sub: "sut" };
  }
  if (csvCat === "GLUTENSIZ URUNLER") {
    return { main: MAIN_KEYS.SAGLIKLI_ORGANIK, sub: null };
  }

  // ── KISISEL BAKIM alt kırılım ──
  if (csvCat === "KISISEL BAKIM") {
    if (has(title, "SAMPUAN", "SAC KREMI", "SAC BAKIM", "ELIDOR", "BATISTE", "DOVE SAMP")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "sac_bakim" };
    }
    if (has(title, "DIS MACUNU", "DIS FIRCASI", "D.FIRCASI", "AGIZ", "COLGATE", "SENSODYNE", "PARADONTAX")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "agiz_bakim" };
    }
    if (has(title, "DUS JELI", "DUS KOPUGU", "SIVI SABUN", "BAR SABUN", "SABUN", "HACI SAKIR", "HOBBY", "IMPERIAL LEATHER", "BANYO LIFI")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "dus_sabun" };
    }
    if (has(title, "DEODORANT", "ROLL-ON", "ROLL ON", "PARFUM", "CEP PARFUM", "EDT")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "deodorant_parfum" };
    }
    if (has(title, "TIRAS", "JILET", "GILLETTE", "BICAK", "MAKINE")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "tiras" };
    }
    if (has(title, "HASTA BEZI", "KULOT", "HIJYEN", "ORKI", "KOTEX", "MOLPED", "PED ", "TAMPON")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "kadin_hijyen" };
    }
    if (has(title, "MAKYAJ", "KREM", "PAMUK", "KULAK CUBUGU", "KOLONYA", "GARNIER", "ISLAK MENDIL", "FRESHN SOFT")) {
      return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "cilt_bakim" };
    }
    return { main: MAIN_KEYS.KISISEL_BAKIM, sub: "cilt_bakim" };
  }

  // ── Fallback: eşleşmeyen CSV kategorileri ──
  if (mainKeyDefault) return { main: mainKeyDefault, sub: null };
  return { main: null, sub: null };
}

// ─────────────────────────────────────────────────────────────
// 5) CSV oku + sınıflandır
// ─────────────────────────────────────────────────────────────
function loadCsv(path) {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const ci = header.indexOf("kategori");
  const ti = header.indexOf("urun_adi");
  const bi = header.indexOf("barkod");
  if (ci === -1 || ti === -1) {
    throw new Error(`CSV'de 'kategori' ve 'urun_adi' kolonu gerekli (bulundu: ${header.join(",")})`);
  }
  return rows
    .filter((r) => r.length && (r[ti] || "").trim())
    .map((r) => ({
      kategori: (r[ci] || "").trim(),
      urun_adi: (r[ti] || "").trim(),
      barkod: bi !== -1 ? (r[bi] || "").trim() : "",
    }));
}

function buildSubcatKey(mainKey, slug) {
  return `${mainKey}_${slug}`;
}

async function main() {
  const products = loadCsv(CSV);
  console.log(`[csv] okunan ürün sayısı: ${products.length}`);

  // Sınıflandır
  const assignments = products.map((p) => {
    const { main, sub } = classify(p.kategori, p.urun_adi);
    return { ...p, main, sub };
  });

  const noMain = assignments.filter((a) => !a.main);
  if (noMain.length) {
    console.log(`\n[UYARI] Ana kategori bulunamayan ${noMain.length} ürün (ilk 15):`);
    noMain.slice(0, 15).forEach((a) => console.log(`  - [${a.kategori}] ${a.urun_adi}`));
  }

  // ── İstatistikler: ana → alt → sayı ──
  const stats = new Map(); // mainKey -> { total, subs: Map(sub -> count), fallback: [] }
  for (const a of assignments) {
    if (!a.main) continue;
    if (!stats.has(a.main)) stats.set(a.main, { total: 0, subs: new Map(), fallback: [] });
    const s = stats.get(a.main);
    s.total++;
    if (a.sub) {
      s.subs.set(a.sub, (s.subs.get(a.sub) || 0) + 1);
    } else {
      s.fallback.push(a.urun_adi);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`TAKSONOMİ ÖZETİ (ana kategori → alt kategoriler)`);
  console.log(`═══════════════════════════════════════════════════════`);

  let totalProducts = 0;
  let totalFallback = 0;
  const subcatCreationList = [];

  for (const [mainKey, s] of [...stats.entries()].sort((a, b) => b[1].total - a[1].total)) {
    totalProducts += s.total;
    totalFallback += s.fallback.length;
    console.log(`\n${mainKey}  (toplam: ${s.total})`);
    const subEntries = [...s.subs.entries()].sort((a, b) => b[1] - a[1]);
    for (const [sub, count] of subEntries) {
      const subKey = buildSubcatKey(mainKey, sub);
      console.log(`  ├─ ${subKey.padEnd(45)} ${count}`);
      subcatCreationList.push({ mainKey, sub, subKey, count });
    }
    if (s.fallback.length) {
      const pct = ((s.fallback.length / s.total) * 100).toFixed(1);
      console.log(`  └─ (alt yok / ana kategoride kalan)          ${s.fallback.length}  (${pct}%)`);
    }
  }

  const fallbackPct = ((totalFallback / totalProducts) * 100).toFixed(2);
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`GENEL FALLBACK ORANI: ${totalFallback}/${totalProducts} = ${fallbackPct}%`);
  console.log(`═══════════════════════════════════════════════════════`);

  console.log(`\nİLK 15 FALLBACK ÜRÜN (alt kategori atanamayan):`);
  const allFallback = assignments.filter((a) => a.main && !a.sub);
  allFallback.slice(0, 15).forEach((a) => console.log(`  - [${a.kategori}] ${a.urun_adi}`));

  console.log(`\nOLUŞTURULACAK ALT KATEGORİ SAYISI: ${subcatCreationList.length}`);

  // ── --report: detay CSV çıktısı ──
  if (REPORT) {
    console.log(`\n--- REPORT CSV ---`);
    console.log(`barkod,urun_adi,ana_key,alt_key`);
    for (const a of assignments) {
      const altKey = a.main && a.sub ? buildSubcatKey(a.main, a.sub) : "";
      const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      console.log(`${esc(a.barkod)},${esc(a.urun_adi)},${esc(a.main || "")},${esc(altKey)}`);
    }
  }

  // ── Barkod kontrolü (DB varsa) ──
  const barcodesInCsv = assignments.filter((a) => a.barkod).length;
  console.log(`\n[barkod] CSV'de barkodu dolu ürün: ${barcodesInCsv}/${assignments.length}`);

  if (!APPLY) {
    console.log(`\n[DRY-RUN] DB'ye bağlanılmadı, hiçbir şey yazılmadı.`);
    console.log(`Uygulamak için: node src/scripts/assign-dima-categories.mjs --csv ${CSV} --apply`);
    return;
  }

  // ── --apply: DB'ye yaz ──
  const mongoose = (await import("mongoose")).default;
  const { connectDB } = await import("../config/db.js");
  const CoreCategory = (await import("../models/CoreCategory.js")).default;
  const MarketOrgProduct = (await import("../models/MarketOrgProduct.js")).default;

  await connectDB();
  const orgId = new mongoose.Types.ObjectId(ORG);

  // ana kategorilerin _id'lerini çek
  const mainDocs = await CoreCategory.find({ key: { $in: Object.values(MAIN_KEYS) } }).lean();
  const mainIdByKey = new Map(mainDocs.map((d) => [d.key, d._id]));

  const missingMains = Object.values(MAIN_KEYS).filter((k) => !mainIdByKey.has(k));
  if (missingMains.length) {
    console.error(`[HATA] Şu ana kategoriler DB'de bulunamadı (önce seed-market.js çalıştırılmalı): ${missingMains.join(", ")}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  let createdSubs = 0, updatedSubs = 0;
  const subIdByKey = new Map();

  for (const { mainKey, sub, subKey } of subcatCreationList) {
    const def = SUBCATS[mainKey]?.find((x) => x.slug === sub);
    if (!def) continue;
    const parentId = mainIdByKey.get(mainKey);
    const existing = await CoreCategory.findOne({ key: subKey });
    if (existing) {
      await CoreCategory.updateOne(
        { key: subKey },
        {
          $set: {
            businessTypes: MAIN_BUSINESS_TYPES,
            parentId,
            i18n: def.i18n,
            order: def.order,
            isActive: true,
          },
        }
      );
      subIdByKey.set(subKey, existing._id);
      updatedSubs++;
    } else {
      const created = await CoreCategory.create({
        key: subKey,
        businessTypes: MAIN_BUSINESS_TYPES,
        parentId,
        i18n: def.i18n,
        order: def.order,
        isActive: true,
      });
      subIdByKey.set(subKey, created._id);
      createdSubs++;
    }
  }
  console.log(`\n[alt kategoriler] oluşturulan=${createdSubs}, güncellenen=${updatedSubs}`);

  // ürünleri barkod / başlık ile eşle ve category set et
  let matchedByBarcode = 0, matchedByTitle = 0, updated = 0, skipped = 0;
  const skippedList = [];

  for (const a of assignments) {
    if (!a.main) { skipped++; skippedList.push(a.urun_adi); continue; }
    const targetKey = a.sub ? buildSubcatKey(a.main, a.sub) : a.main;
    const targetId = a.sub ? subIdByKey.get(targetKey) : mainIdByKey.get(a.main);
    if (!targetId) { skipped++; skippedList.push(a.urun_adi); continue; }

    let doc = null;
    if (a.barkod) {
      doc = await MarketOrgProduct.findOne({ organizationId: orgId, barcode: a.barkod });
      if (doc) matchedByBarcode++;
    }
    if (!doc) {
      doc = await MarketOrgProduct.findOne({ organizationId: orgId, title: a.urun_adi });
      if (doc) matchedByTitle++;
    }
    if (!doc) {
      skipped++;
      skippedList.push(a.urun_adi);
      continue;
    }
    if (String(doc.category) !== String(targetId)) {
      await MarketOrgProduct.updateOne({ _id: doc._id }, { $set: { category: targetId } });
      updated++;
    }
  }

  console.log(`\n[ürünler] barkod eşleşen=${matchedByBarcode}, başlık eşleşen=${matchedByTitle}, güncellenen=${updated}, atlanan(eşleşmeyen)=${skipped}`);
  if (skippedList.length) {
    console.log(`  atlanan örnekler (ilk 15):`);
    skippedList.slice(0, 15).forEach((t) => console.log(`    - ${t}`));
  }

  await mongoose.disconnect();
  console.log(`\n[OK] Uygulama tamamlandı.`);
}

main().catch((e) => {
  console.error("[assign-dima-categories] error", e);
  process.exit(1);
});
