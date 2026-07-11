// Örnek kampanya seed'i — market / restoran / taksi (idempotent, title+surface+region ile upsert).
// Çalıştır: node src/scripts/seed-campaigns.js   (SEED_REGION env ile bölge değiştirilebilir, vars. CY)
//
// FİYATLANDIRMA GERÇEK VERİYE DAYALI (Temmuz 2026, KKTC):
//   Market (Dima): medyan ürün ₺105, gerçek sepetler ₺1.000–1.500
//   Paket servis (Kraliçe Kokoreç): ürünler ₺420–510, min. sepet ₺300 → tipik sipariş ₺450–900
//   Taksi (CY, admin panel tarifesi): açılış ₺500 + ₺80/km (gündüz, standart); gece ₺88/km; XL ₺100–150/km
//     → 5 km ≈ ₺900 · 10 km ≈ ₺1.300 · havalimanı (~40 km) ≈ ₺3.700
import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "../config/db.js";
import Campaign from "../models/Campaign.js";
import Organization from "../models/Organization.js";

const REGION = (process.env.SEED_REGION || "CY").toUpperCase();
const CURRENCY = REGION === "UK" ? "GBP" : "TRY";
const now = new Date();
const in60 = new Date(now.getTime() + 60 * 864e5);

const base = {
  region: REGION,
  currency: CURRENCY,
  validFrom: now,
  validTo: in60,
  isActive: true,
};

// Kısayol: ortak condition/audience kalıpları
const PLATFORM = { scope: "platform", categoryKeys: [], storeIds: [], organizationId: null };
const PUBLIC_COLLECT = { kind: "public", trigger: null, winBackDays: null, collectible: true };
const FIRST_ORDER = { kind: "targeted", trigger: "first_order", winBackDays: null, collectible: false };
const winBack = (days) => ({ kind: "targeted", trigger: "win_back", winBackDays: days, collectible: false });

// organizationId çalışma anında bulunur (ör. Dima) — bulunamazsa zincir kampanyası atlanır.
function buildCampaigns({ dimaOrgId }) {
  const list = [
    // ═══ MARKET ═══════════════════════════════════════════════════════════
    // Edinim
    {
      title: "Markette İlk Siparişe ₺200 İndirim",
      description: "İlk market siparişine özel ₺200 indirim. ₺750 ve üzeri sepetlerde geçerli.",
      surface: "market",
      discount: { kind: "fixed", value: 200, maxDiscount: null },
      conditions: { minSubtotal: 750, ...PLATFORM, paymentMethods: ["all"] },
      audience: FIRST_ORDER,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 400000, basis: "platform", spent: 0 },
    },
    // Geri kazanım
    {
      title: "Seni Özledik — Markette ₺150 İndirim",
      description: "3 haftadır sipariş vermedin! ₺500 üzeri market sepetine ₺150 indirim.",
      surface: "market",
      discount: { kind: "fixed", value: 150, maxDiscount: null },
      conditions: { minSubtotal: 500, ...PLATFORM, paymentMethods: ["all"] },
      audience: winBack(21),
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 150000, basis: "platform", spent: 0 },
    },
    // Sepet büyütme
    {
      title: "Market Sepetinde %10 İndirim",
      description: "Katılan marketlerde ₺600 üzeri sepete %10 indirim (en fazla ₺150).",
      surface: "market",
      discount: { kind: "percent", value: 10, maxDiscount: 150 },
      conditions: { minSubtotal: 600, scope: "category", categoryKeys: ["supermarket"], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 50 },
      requiresOptIn: true,
      usageLimit: { perUser: 3, total: 2000, showRemaining: true },
      budget: { cap: 150000, basis: "platform", spent: 0 },
    },
    {
      title: "Dev Sepete ₺300 İndirim",
      description: "₺2.000 ve üzeri market alışverişine ₺300 indirim — haftalık alışverişini tek seferde yap.",
      surface: "market",
      discount: { kind: "fixed", value: 300, maxDiscount: null },
      conditions: { minSubtotal: 2000, ...PLATFORM, paymentMethods: ["all"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 50 },
      requiresOptIn: true,
      usageLimit: { perUser: 2, total: 1000, showRemaining: true },
      budget: { cap: 200000, basis: "platform", spent: 0 },
    },
    // Ödeme yönlendirme
    {
      title: "Online Ödemeye %5 İndirim",
      description: "Market siparişini online öde, ₺400 üzeri sepette %5 indirim kazan (en fazla ₺100).",
      surface: "market",
      discount: { kind: "percent", value: 5, maxDiscount: 100 },
      conditions: { minSubtotal: 400, ...PLATFORM, paymentMethods: ["online"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 10, total: null, showRemaining: false },
      budget: { cap: 100000, basis: "platform", spent: 0 },
    },
    // Dikey destek (küçük esnaf)
    {
      title: "Manav & Fırında %10 İndirim",
      description: "Katılan manav ve fırınlarda ₺250 üzeri sepete %10 indirim (en fazla ₺75).",
      surface: "market",
      discount: { kind: "percent", value: 10, maxDiscount: 75 },
      conditions: { minSubtotal: 250, scope: "category", categoryKeys: ["greengrocer", "bakery"], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 70 },
      requiresOptIn: true,
      usageLimit: { perUser: 4, total: null, showRemaining: false },
      budget: { cap: 60000, basis: "platform", spent: 0 },
    },

    // ═══ RESTORAN / PAKET SERVİS ══════════════════════════════════════════
    // Edinim
    {
      title: "İlk Yemek Siparişine ₺125 İndirim",
      description: "İlk paket servis siparişine özel ₺125 indirim. ₺400 ve üzeri siparişlerde.",
      surface: "restaurant",
      discount: { kind: "fixed", value: 125, maxDiscount: null },
      conditions: { minSubtotal: 400, ...PLATFORM, paymentMethods: ["all"] },
      audience: FIRST_ORDER,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 250000, basis: "platform", spent: 0 },
    },
    // Geri kazanım
    {
      title: "Mutfak Seni Bekliyor — ₺100 İndirim",
      description: "3 haftadır yemek söylemedin! ₺350 üzeri paket servis siparişine ₺100 indirim.",
      surface: "restaurant",
      discount: { kind: "fixed", value: 100, maxDiscount: null },
      conditions: { minSubtotal: 350, ...PLATFORM, paymentMethods: ["all"] },
      audience: winBack(21),
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 120000, basis: "platform", spent: 0 },
    },
    // Sepet büyütme / sadakat
    {
      title: "Restoranlarda %15 İndirim",
      description: "Katılan restoranlarda ₺450 üzeri siparişe %15 indirim (en fazla ₺120).",
      surface: "restaurant",
      discount: { kind: "percent", value: 15, maxDiscount: 120 },
      conditions: { minSubtotal: 450, ...PLATFORM, paymentMethods: ["all"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 50 },
      requiresOptIn: true,
      usageLimit: { perUser: 2, total: null, showRemaining: false },
      budget: { cap: 200000, basis: "platform", spent: 0 },
    },
    {
      title: "Aile Sofrasına ₺150 İndirim",
      description: "₺900 ve üzeri paket servis siparişlerine ₺150 indirim — kalabalık sofralara.",
      surface: "restaurant",
      discount: { kind: "fixed", value: 150, maxDiscount: null },
      conditions: { minSubtotal: 900, ...PLATFORM, paymentMethods: ["all"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 50 },
      requiresOptIn: true,
      usageLimit: { perUser: 3, total: null, showRemaining: false },
      budget: { cap: 120000, basis: "platform", spent: 0 },
    },
    // Teslimat teşviki
    {
      title: "Teslimat Bizden",
      description: "₺350 üzeri paket servis siparişlerinde teslimat ücreti bizden.",
      surface: "restaurant",
      discount: { kind: "free_delivery", value: 0, maxDiscount: null },
      conditions: { minSubtotal: 350, ...PLATFORM, paymentMethods: ["all"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 5, total: 5000, showRemaining: true },
      budget: { cap: 100000, basis: "platform", spent: 0 },
    },
    // Ödeme yönlendirme
    {
      title: "Yemekte Online Ödemeye %10",
      description: "Paket servisi online öde, ₺300 üzeri siparişte %10 indirim (en fazla ₺100).",
      surface: "restaurant",
      discount: { kind: "percent", value: 10, maxDiscount: 100 },
      conditions: { minSubtotal: 300, ...PLATFORM, paymentMethods: ["online"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 10, total: null, showRemaining: false },
      budget: { cap: 100000, basis: "platform", spent: 0 },
    },

    // ═══ TAKSİ (₺500 açılış + ₺80-150/km — 5 km ≈ ₺900, 10 km ≈ ₺1.300) ═══
    // Edinim
    {
      title: "İlk Yolculuğa ₺300 İndirim",
      description: "İlk taksi yolculuğuna ₺300 indirim. ₺800 üzeri yolculuklarda, online ödemede.",
      surface: "taxi",
      discount: { kind: "fixed", value: 300, maxDiscount: null },
      conditions: { minSubtotal: 800, ...PLATFORM, paymentMethods: ["online"] },
      audience: FIRST_ORDER,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: 3000, showRemaining: true },
      budget: { cap: 900000, basis: "platform", spent: 0 },
    },
    // Geri kazanım
    {
      title: "Taksiye Dönüşe %20 İndirim",
      description: "Bir aydır yolculuk yapmadın — sonraki yolculuğuna %20 indirim (en fazla ₺500, online ödeme).",
      surface: "taxi",
      discount: { kind: "percent", value: 20, maxDiscount: 500 },
      conditions: { minSubtotal: 0, ...PLATFORM, paymentMethods: ["online"] },
      audience: winBack(30),
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 250000, basis: "platform", spent: 0 },
    },
    // Ödeme yönlendirme
    {
      title: "Online Ödemeli Yolculuğa %10",
      description: "Taksi ücretini uygulamadan öde, her yolculukta %10 indirim kazan (en fazla ₺250).",
      surface: "taxi",
      discount: { kind: "percent", value: 10, maxDiscount: 250 },
      conditions: { minSubtotal: 0, ...PLATFORM, paymentMethods: ["online"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 8, total: null, showRemaining: false },
      budget: { cap: 300000, basis: "platform", spent: 0 },
    },
    // Uzun yol / havalimanı
    {
      title: "Uzun Yola ₺400 İndirim",
      description: "₺3.000 ve üzeri yolculuklara (ör. havalimanı transferi) ₺400 indirim, online ödemede.",
      surface: "taxi",
      discount: { kind: "fixed", value: 400, maxDiscount: null },
      conditions: { minSubtotal: 3000, ...PLATFORM, paymentMethods: ["online"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 2, total: 1500, showRemaining: true },
      budget: { cap: 600000, basis: "platform", spent: 0 },
    },
  ];

  if (dimaOrgId) {
    list.push({
      title: "Dima'da ₺1.000 Üzerine ₺120 İndirim",
      description: "Dima Discount Market şubelerinde ₺1.000 ve üzeri sepete ₺120 indirim.",
      surface: "market",
      discount: { kind: "fixed", value: 120, maxDiscount: null },
      conditions: { minSubtotal: 1000, scope: "chain", categoryKeys: [], storeIds: [], organizationId: dimaOrgId, paymentMethods: ["all"] },
      audience: PUBLIC_COLLECT,
      funding: { platformSharePct: 30 }, // zincir kampanyası — ağırlık işletmede
      requiresOptIn: true,
      usageLimit: { perUser: 4, total: null, showRemaining: false },
      budget: { cap: 120000, basis: "platform", spent: 0 },
    });
  }
  return list;
}

async function main() {
  await connectDB();

  const dima = await Organization.findOne({ name: /dima/i }).select("_id name").lean();
  if (dima) console.log(`[seed-campaigns] Dima org bulundu: ${dima.name} (${dima._id})`);
  else console.log("[seed-campaigns] Dima org bulunamadı — zincir kampanyası atlanacak");

  const CAMPAIGNS = buildCampaigns({ dimaOrgId: dima?._id || null });

  let created = 0, skipped = 0;
  for (const c of CAMPAIGNS) {
    const doc = { ...base, ...c };
    const res = await Campaign.updateOne(
      { title: c.title, surface: c.surface, region: REGION },
      { $setOnInsert: doc },
      { upsert: true }
    );
    if (res.upsertedCount) created++; else skipped++;
  }
  console.log(`[seed-campaigns] region=${REGION} — created ${created}, already-exists ${skipped}`);

  // Eski (bu seed'de olmayan) aktif kampanyaları raporla — düşük fiyatlı eskiler manuel kapatılabilir
  const titles = CAMPAIGNS.map((c) => c.title);
  const stale = await Campaign.find({ region: REGION, isActive: true, title: { $nin: titles } })
    .select("title surface").lean();
  if (stale.length) {
    console.log(`\n[seed-campaigns] Bu seed'de OLMAYAN ${stale.length} aktif kampanya var (eski fiyatlı olabilir — admin panelden gözden geçir):`);
    for (const s of stale) console.log(`  - [${s.surface}] ${s.title}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("[seed-campaigns] error:", e); process.exit(1); });
