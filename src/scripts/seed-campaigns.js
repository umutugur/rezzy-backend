// Örnek kampanya seed'i — market / restoran / taksi (idempotent, title+surface+region ile upsert).
// Çalıştır: node src/scripts/seed-campaigns.js   (SEED_REGION env ile bölge değiştirilebilir, vars. CY)
//
// FİYATLANDIRMA GERÇEK VERİYE DAYALI (Temmuz 2026, KKTC):
//   Market (Dima): medyan ürün ₺105, gerçek sepetler ₺1.000–1.500
//   Paket servis (Kraliçe Kokoreç): ürünler ₺420–510, min. sepet ₺300 → tipik sipariş ₺450–900
//   Taksi (CY standart): açılış ₺30 + ₺12/km → 10 km ≈ ₺150, havalimanı ≈ ₺400+
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

// organizationId çalışma anında bulunur (ör. Dima) — bulunamazsa chain kampanyası atlanır.
function buildCampaigns({ dimaOrgId }) {
  const list = [
    // ── MARKET ─────────────────────────────────────────────────────────────
    {
      title: "Markette İlk Siparişe ₺200 İndirim",
      description: "İlk market siparişine özel ₺200 indirim. ₺750 ve üzeri sepetlerde geçerli.",
      surface: "market",
      discount: { kind: "fixed", value: 200, maxDiscount: null },
      conditions: { minSubtotal: 750, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: { kind: "targeted", trigger: "first_order", winBackDays: null, collectible: false },
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 400000, basis: "platform", spent: 0 },
    },
    {
      title: "Market Sepetinde %10 İndirim",
      description: "Katılan marketlerde ₺600 üzeri sepete %10 indirim (en fazla ₺150).",
      surface: "market",
      discount: { kind: "percent", value: 10, maxDiscount: 150 },
      conditions: { minSubtotal: 600, scope: "category", categoryKeys: ["supermarket"], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: { kind: "public", trigger: null, winBackDays: null, collectible: true },
      funding: { platformSharePct: 50 },
      requiresOptIn: true,
      usageLimit: { perUser: 3, total: 2000, showRemaining: true },
      budget: { cap: 150000, basis: "platform", spent: 0 },
    },
    {
      title: "Seni Özledik — Markette ₺150 İndirim",
      description: "3 haftadır sipariş vermedin! ₺500 üzeri market sepetine ₺150 indirim.",
      surface: "market",
      discount: { kind: "fixed", value: 150, maxDiscount: null },
      conditions: { minSubtotal: 500, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: { kind: "targeted", trigger: "win_back", winBackDays: 21, collectible: false },
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 150000, basis: "platform", spent: 0 },
    },
    // ── RESTORAN / PAKET SERVİS ────────────────────────────────────────────
    {
      title: "İlk Yemek Siparişine ₺125 İndirim",
      description: "İlk paket servis siparişine özel ₺125 indirim. ₺400 ve üzeri siparişlerde.",
      surface: "restaurant",
      discount: { kind: "fixed", value: 125, maxDiscount: null },
      conditions: { minSubtotal: 400, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: { kind: "targeted", trigger: "first_order", winBackDays: null, collectible: false },
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 250000, basis: "platform", spent: 0 },
    },
    {
      title: "Restoranlarda %15 İndirim",
      description: "Katılan restoranlarda ₺450 üzeri siparişe %15 indirim (en fazla ₺120).",
      surface: "restaurant",
      discount: { kind: "percent", value: 15, maxDiscount: 120 },
      conditions: { minSubtotal: 450, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: { kind: "public", trigger: null, winBackDays: null, collectible: true },
      funding: { platformSharePct: 50 },
      requiresOptIn: true,
      usageLimit: { perUser: 2, total: null, showRemaining: false },
      budget: { cap: 200000, basis: "platform", spent: 0 },
    },
    {
      title: "Teslimat Bizden",
      description: "₺350 üzeri paket servis siparişlerinde teslimat ücreti bizden.",
      surface: "restaurant",
      discount: { kind: "free_delivery", value: 0, maxDiscount: null },
      conditions: { minSubtotal: 350, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["all"] },
      audience: { kind: "public", trigger: null, winBackDays: null, collectible: true },
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 5, total: 5000, showRemaining: true },
      budget: { cap: 100000, basis: "platform", spent: 0 },
    },
    // ── TAKSİ ──────────────────────────────────────────────────────────────
    {
      title: "İlk Yolculuğa ₺60 İndirim",
      description: "İlk taksi yolculuğuna ₺60 indirim. ₺120 üzeri yolculuklarda, online ödemede.",
      surface: "taxi",
      discount: { kind: "fixed", value: 60, maxDiscount: null },
      conditions: { minSubtotal: 120, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["online"] },
      audience: { kind: "targeted", trigger: "first_order", winBackDays: null, collectible: false },
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: 3000, showRemaining: true },
      budget: { cap: 180000, basis: "platform", spent: 0 },
    },
    {
      title: "Taksiye Dönüşe %20 İndirim",
      description: "Bir aydır yolculuk yapmadın — sonraki yolculuğuna %20 indirim (en fazla ₺80, online ödeme).",
      surface: "taxi",
      discount: { kind: "percent", value: 20, maxDiscount: 80 },
      conditions: { minSubtotal: 0, scope: "platform", categoryKeys: [], storeIds: [], organizationId: null, paymentMethods: ["online"] },
      audience: { kind: "targeted", trigger: "win_back", winBackDays: 30, collectible: false },
      funding: { platformSharePct: 100 },
      requiresOptIn: false,
      usageLimit: { perUser: 1, total: null, showRemaining: false },
      budget: { cap: 80000, basis: "platform", spent: 0 },
    },
  ];

  if (dimaOrgId) {
    list.push({
      title: "Dima'da ₺1.000 Üzerine ₺120 İndirim",
      description: "Dima Discount Market şubelerinde ₺1.000 ve üzeri sepete ₺120 indirim.",
      surface: "market",
      discount: { kind: "fixed", value: 120, maxDiscount: null },
      conditions: { minSubtotal: 1000, scope: "chain", categoryKeys: [], storeIds: [], organizationId: dimaOrgId, paymentMethods: ["all"] },
      audience: { kind: "public", trigger: null, winBackDays: null, collectible: true },
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
