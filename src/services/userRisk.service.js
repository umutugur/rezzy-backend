// services/userRisk.service.js
import User from "../models/User.js";

/** -------------------- Ağırlıklar ve sabitler -------------------- **/
const WEIGHTS = {
  NO_SHOW:       1.00,   // tam no-show
  LATE_CANCEL:   0.50,   // rezervasyona yakın iptal
  UNDER_ATTEND:  0.25,   // eşik altı katılım
  GOOD_ATTEND:  -0.10,   // sorunsuz katılım (riski azaltır)
};

const RISK_MULTIPLIER = 25;    // 1.0 ağırlık ≈ +25 puan
const WINDOW_DAYS     = 180;   // risk penceresi (gün)

/** -------------------- Yardımcılar -------------------- **/
function cutoffDate(days = WINDOW_DAYS) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function trimIncidents(userDoc) {
  const cut = cutoffDate();
  userDoc.riskIncidents = (userDoc.riskIncidents || []).filter(x => x.at >= cut);
}

function sumIncidentWeights(userDoc) {
  return (userDoc.riskIncidents || []).reduce((acc, it) => acc + (Number(it.weight) || 0), 0);
}

/** Eksik katılım ağırlığı: eşik altına düşülen orana göre 0..1 */
export function computeUnderAttendWeight({ partySize, arrivedCount, thresholdPercent }) {
  const ratio = partySize > 0 ? (arrivedCount / partySize) * 100 : 100;
  const deficit = Math.max(0, thresholdPercent - ratio); // kaç puan eksiğiz
  const normalized = thresholdPercent > 0 ? deficit / thresholdPercent : 0; // 0..1
  const w = Math.max(0, Math.min(1, normalized)); // 0..1 kırp
  // İstersen global UNDER_ATTEND katsayısı ile çarpıp kırpabilirsin; şimdilik normalize kullanıyoruz.
  return Number(w.toFixed(2));
}

/** -------------------- Ana giriş: olay ekle -------------------- **/
/**
 * @param {{ userId: string, type: "NO_SHOW"|"LATE_CANCEL"|"UNDER_ATTEND"|"GOOD_ATTEND", baseWeight?: number, reservationId?: string }} param0
 */
export async function addIncident({ userId, type, baseWeight, reservationId }) {
  const u = await User.findById(userId);
  if (!u) throw new Error("User not found");

  trimIncidents(u);

  // ağırlık hesapla
  const configured = WEIGHTS[type];
  const weight = typeof baseWeight === "number" ? baseWeight : configured;

  // olay ekle
  u.riskIncidents.push({
    type,
    weight,
    reservationId: reservationId || undefined,
    at: new Date(),
  });

  // sayaçlar / seriler
  if (type === "NO_SHOW") {
    u.noShowCount = (u.noShowCount || 0) + 1;
    u.consecutiveGoodShows = 0;
  } else if (type === "GOOD_ATTEND") {
    u.consecutiveGoodShows = (u.consecutiveGoodShows || 0) + 1;
  } else {
    u.consecutiveGoodShows = 0;
  }

  // risk yeniden hesapla (penceredeki toplam ağırlık * multiplier)
  const totalWeight = sumIncidentWeights(u);
  u.riskScore = Math.round(Math.max(0, Math.min(100, totalWeight * RISK_MULTIPLIER)));

  // otomatik ban kontrolü
  u._autobanIfNeeded();
  await u.save();

  return { ok: true, userId: String(u._id), riskScore: u.riskScore, noShowCount: u.noShowCount };
}

/** Periyodik risk azaltımı (cron ile çağır) */
export async function monthlyRiskDecay({ points = 5 } = {}) {
  const users = await User.find({ riskScore: { $gt: 0 } }).select("_id riskScore");
  if (!users.length) return { ok: true, updated: 0 };

  const bulk = users.map(u => ({
    updateOne: {
      filter: { _id: u._id },
      update: { $set: { riskScore: Math.max(0, (u.riskScore || 0) - points) } },
    },
  }));

  const r = await User.bulkWrite(bulk);
  return { ok: true, updated: r.modifiedCount || 0 };
}