// Seed default ServiceCategory docs (market + delivery chips) — idempotent, upsert by {surface,key}.
// Mirrors the current hardcoded chip lists in MarketHomeScreen / DeliveryHomeScreen.
//   node src/scripts/seed-service-categories.js          (dry-run)
//   node src/scripts/seed-service-categories.js --apply
import dotenv from "dotenv"; dotenv.config();
import mongoose from "mongoose";
import ServiceCategory from "../models/ServiceCategory.js";
import CoreCategory from "../models/CoreCategory.js";

const APPLY = process.argv.includes("--apply");

const PEX = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=200&h=200`;
const UNS = (id) => `https://images.unsplash.com/photo-${id}?w=200&h=200&fit=crop&q=80&auto=format`;
const ALL = ["TR", "CY", "UK"], TRCY = ["TR", "CY"];

const MARKET = [
  { key: "supermarket", tr: "Süpermarket", en: "Supermarket",  emoji: "🏪", img: PEX(7420502),  storeCategory: "supermarket", regions: ALL, order: 0 },
  { key: "greengrocer", tr: "Manav",        en: "Greengrocer",  emoji: "🥦", img: PEX(12974968), storeCategory: "greengrocer", regions: ALL, order: 1 },
  { key: "bakery",      tr: "Fırın",        en: "Bakery",       emoji: "🥖", img: PEX(3341067),  storeCategory: "bakery",      regions: ALL, order: 2 },
  { key: "organic",     tr: "Organik",      en: "Organic",      emoji: "🌿", img: PEX(7879960),  storeCategory: "organic",     regions: ALL, order: 3 },
  { key: "water",       tr: "Su & Damacana",en: "Water",        emoji: "💧", img: PEX(327090),   coreKeys: ["water", "su", "su-damacana"], regions: ALL, order: 4 },
  { key: "tup",         tr: "Tüp",          en: "Gas Bottle",   emoji: "🔥", img: PEX(16271901), coreKeys: ["tup", "tüp", "gaz"],          regions: TRCY, order: 5 },
  { key: "pharmacy",    tr: "Eczane",       en: "Pharmacy",     emoji: "💊", img: PEX(3873150),  storeCategory: "pharmacy",    regions: ALL, order: 6 },
];

const DELIVERY = [
  { key: "burger",   tr: "Hamburger",       en: "Burger",          emoji: "🍔", img: UNS("1568901346375-23c9450c58cd"), kw: ["burger","hamburger","smash"], regions: ALL },
  { key: "doner",    tr: "Döner",           en: "Doner",           emoji: "🌯", img: UNS("1529006557810-274b9b2fc783"), kw: ["döner","dürüm","wrap","kokoreç"], regions: ALL },
  { key: "pizza",    tr: "Pizza",           en: "Pizza",           emoji: "🍕", img: UNS("1565299624946-b28f40a0ae38"), kw: ["pizza","pizzacı"], regions: ALL },
  { key: "cigkofte", tr: "Çiğ Köfte",       en: "Cig Kofte",       emoji: "🫔", img: PEX(10027451), kw: ["çiğ köfte","cigkofte","çiğköfte"], regions: TRCY },
  { key: "tavuk",    tr: "Tavuk",           en: "Chicken",         emoji: "🍗", img: PEX(9872916),  kw: ["tavuk","chicken","kanat","piliç"], regions: ALL },
  { key: "kofte",    tr: "Köfte",           en: "Meatballs",       emoji: "🥩", img: PEX(18824002), kw: ["köfte","kofteci","izgara"], regions: ALL },
  { key: "kebap",    tr: "Kebap",           en: "Kebab",           emoji: "🍢", img: UNS("1529692236671-f1f6cf9683ba"), kw: ["kebap","adana","urfa","şiş","cağ"], regions: ALL },
  { key: "pide",     tr: "Pide & Lahmacun", en: "Pide & Lahmacun", emoji: "🥙", img: UNS("1593560708920-61dd98c46a4e"), kw: ["pide","lahmacun","fırın"], regions: ALL },
  { key: "sandvic",  tr: "Tost & Sandviç",  en: "Toast & Sandwich",emoji: "🥪", img: UNS("1528735602780-2552fd46c7af"), kw: ["sandviç","sandwich","tost","toast"], regions: ALL },
  { key: "tantuni",  tr: "Tantuni",         en: "Tantuni",         emoji: "🌮", img: PEX(34106235), kw: ["tantuni"], regions: TRCY },
  { key: "manti",    tr: "Mantı & Makarna", en: "Pasta",           emoji: "🥟", img: UNS("1555949258-eb67b1ef0ceb"),   kw: ["mantı","makarna","pasta","risotto"], regions: ALL },
  { key: "ev",       tr: "Ev Yemekleri",    en: "Home Cooking",    emoji: "🍲", img: UNS("1547592180-85f173990554"),   kw: ["ev yemeği","ev yemek","ana yemek","geleneksel"], regions: ALL },
  { key: "pastane",  tr: "Pastane & Fırın", en: "Bakery & Pastry", emoji: "🥐", img: PEX(3341067), kw: ["pastane","fırın","börek","hamur","simit","poğaça","gözleme"], regions: ALL },
  { key: "corba",    tr: "Çorba",           en: "Soup",            emoji: "🍜", img: UNS("1547592166-23ac45744acd"),   kw: ["çorba","soup"], regions: ALL },
  { key: "salata",   tr: "Salata & Sağlık", en: "Salad & Healthy", emoji: "🥗", img: UNS("1512621776951-a57141f2eefd"), kw: ["salata","salad","bowl","vegan","vejetaryen","organik","sağlıklı"], regions: ALL },
  { key: "tatli",    tr: "Tatlı",           en: "Dessert",         emoji: "🍰", img: UNS("1551024601-bec78aea704b"),   kw: ["tatlı","pasta","kek","baklava","dondurma","dessert","waffle"], regions: ALL },
  { key: "kahve",    tr: "Kahve & İçecek",  en: "Coffee & Drinks", emoji: "☕", img: UNS("1509042239860-f550ce710b93"), kw: ["cafe","kafe","kahve","coffee","espresso","içecek","drink","juice","smoothie"], regions: ALL },
  { key: "sushi",    tr: "Uzak Doğu",       en: "Asian",           emoji: "🍣", img: UNS("1579871494447-9811cf80d66c"), kw: ["sushi","japon","ramen","bento","çin","asya","wok","noodle","tayland"], regions: ALL },
  { key: "dunya",    tr: "Dünya Mutfağı",   en: "World Cuisine",   emoji: "🌍", img: UNS("1414235077428-338989a2e8c0"), kw: ["italyan","meksika","taco","burrito","dünya","world"], regions: ALL },
  { key: "balik",    tr: "Balık & Deniz",   en: "Seafood",         emoji: "🐟", img: UNS("1519708227418-c8fd9a32b7a2"), kw: ["balık","deniz","seafood","levrek","çipura"], regions: ALL },
  { key: "sokak",    tr: "Sokak Lezzetleri",en: "Street Food",     emoji: "🍡", img: PEX(29714906), kw: ["sokak","street","simit","midye","balık ekmek","fast food","fastfood"], regions: ALL },
];

async function resolveCoreCategoryId(coreKeys) {
  if (!Array.isArray(coreKeys) || !coreKeys.length) return null;
  const doc = await CoreCategory.findOne({ key: { $in: coreKeys } }).select("_id").lean();
  return doc?._id || null;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  let created = 0, skipped = 0;

  for (const m of MARKET) {
    let coreCategoryId = null;
    if (m.coreKeys) {
      coreCategoryId = await resolveCoreCategoryId(m.coreKeys);
      if (!coreCategoryId) console.log(`(filterless — bind in admin) market/${m.key}: no CoreCategory matched ${JSON.stringify(m.coreKeys)}`);
    }
    const doc = {
      surface: "market",
      key: m.key,
      name: { tr: m.tr, en: m.en || "", el: "", ru: "" },
      imageUrl: m.img,
      fallbackEmoji: m.emoji,
      regions: m.regions,
      order: m.order,
      isActive: true,
      storeCategory: m.storeCategory || null,
      coreCategoryId: coreCategoryId || null,
      keywords: [],
    };
    if (!APPLY) {
      const exists = await ServiceCategory.exists({ surface: "market", key: m.key });
      console.log(`${exists ? "SKIP (exists)" : "CREATE"} market/${m.key}`);
      exists ? skipped++ : created++;
      continue;
    }
    const res = await ServiceCategory.updateOne(
      { surface: "market", key: m.key },
      { $setOnInsert: doc },
      { upsert: true }
    );
    if (res.upsertedCount) { created++; console.log(`CREATED market/${m.key}`); } else { skipped++; console.log(`SKIP (exists) market/${m.key}`); }
  }

  for (let i = 0; i < DELIVERY.length; i++) {
    const d = DELIVERY[i];
    const doc = {
      surface: "delivery",
      key: d.key,
      name: { tr: d.tr, en: d.en || "", el: "", ru: "" },
      imageUrl: d.img,
      fallbackEmoji: d.emoji,
      regions: d.regions,
      order: i,
      isActive: true,
      storeCategory: null,
      coreCategoryId: null,
      keywords: d.kw,
    };
    if (!APPLY) {
      const exists = await ServiceCategory.exists({ surface: "delivery", key: d.key });
      console.log(`${exists ? "SKIP (exists)" : "CREATE"} delivery/${d.key}`);
      exists ? skipped++ : created++;
      continue;
    }
    const res = await ServiceCategory.updateOne(
      { surface: "delivery", key: d.key },
      { $setOnInsert: doc },
      { upsert: true }
    );
    if (res.upsertedCount) { created++; console.log(`CREATED delivery/${d.key}`); } else { skipped++; console.log(`SKIP (exists) delivery/${d.key}`); }
  }

  console.log(`[seed-service-categories] ${APPLY ? "created" : "would create"} ${created}, skipped ${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
