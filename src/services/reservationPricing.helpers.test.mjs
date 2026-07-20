import assert from "node:assert";
import { computeDepositPure, revenueBaseOf } from "./reservationPricing.helpers.js";

// ─── computeDepositPure ───────────────────────────────────────────────────

// 1) Flat kapora varsa, yüzde/min ne olursa olsun flat kullanılır
{
  const cfg = { flat: 500, ratePercent: 50, minAmount: 100 };
  assert.strictEqual(computeDepositPure(cfg, 1000), 500);
}

// 2) Flat 0/yok, yüzde varsa yüzdeye göre hesaplanır (yuvarlanmış)
{
  const cfg = { flat: 0, ratePercent: 20, minAmount: 0 };
  assert.strictEqual(computeDepositPure(cfg, 1000), 200);
}

// 3) Yüzde hesaplanan tutar minAmount'ın altındaysa taban uygulanır
{
  const cfg = { flat: 0, ratePercent: 5, minAmount: 100 };
  // %5 * 1000 = 50 < 100 -> 100'e yükseltilir
  assert.strictEqual(computeDepositPure(cfg, 1000), 100);
}

// 4) minAmount yalnızca ratePercent > 0 iken taban olur (ratePercent 0 iken minAmount yoksayılır)
{
  const cfg = { flat: 0, ratePercent: 0, minAmount: 100 };
  assert.strictEqual(computeDepositPure(cfg, 1000), 0);
}

// 5) HİÇBİR ŞEY yapılandırılmamışsa (flat yok, ratePercent yok/0) sonuç 0 — %20 SESSİZ FALLBACK YOK
{
  const cfg = { flat: 0, ratePercent: 0, minAmount: 0 };
  assert.strictEqual(computeDepositPure(cfg, 1000), 0);
}
{
  // cfg hiç verilmeden de (undefined alanlar) 0 dönmeli
  assert.strictEqual(computeDepositPure({}, 1000), 0);
}

// 6) Depozito totalPrice'ı geçemez
{
  const cfg = { flat: 0, ratePercent: 200, minAmount: 0 };
  assert.strictEqual(computeDepositPure(cfg, 100), 100);
}

// 7) totalPrice 0 iken flat > 0 olsa da... spec: flat mevcut restoran davranışında totalPrice'tan
//    bağımsız sabit bir tutar olarak kullanılıyor (mevcut computeDeposit ile birebir davranış).
{
  const cfg = { flat: 300, ratePercent: 0, minAmount: 0 };
  assert.strictEqual(computeDepositPure(cfg, 0), 300);
}

// 7b) Flat, totalPrice'ı aşsa da kırpılmaz (mevcut computeDeposit ile birebir davranış)
{
  const cfg = { flat: 500, ratePercent: 0, minAmount: 0 };
  assert.strictEqual(computeDepositPure(cfg, 100), 500);
}

// 8) Negatif / NaN girişler güvenli şekilde 0'a düşer
{
  const cfg = { flat: 0, ratePercent: -10, minAmount: 0 };
  assert.strictEqual(computeDepositPure(cfg, 1000), 0);
}

// ─── revenueBaseOf ─────────────────────────────────────────────────────────

// commissionBase set edilmişse (0 dahil) o kullanılır — totalPrice'a bakılmaz
{
  assert.strictEqual(revenueBaseOf({ commissionBase: 750, totalPrice: 1000 }), 750);
}
{
  // commissionBase === 0 GEÇERLİ bir değerdir, totalPrice'a düşülmez
  assert.strictEqual(revenueBaseOf({ commissionBase: 0, totalPrice: 1000 }), 0);
}

// commissionBase null/undefined (eski kayıt) ise totalPrice'a düşülür
{
  assert.strictEqual(revenueBaseOf({ commissionBase: null, totalPrice: 1000 }), 1000);
}
{
  assert.strictEqual(revenueBaseOf({ totalPrice: 1000 }), 1000);
}

// Hiçbiri yoksa 0
{
  assert.strictEqual(revenueBaseOf({}), 0);
}
{
  assert.strictEqual(revenueBaseOf({ commissionBase: null, totalPrice: null }), 0);
}

console.log("reservationPricing.helpers ok");
