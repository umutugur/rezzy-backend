// src/scripts/diagnose-dima-skips.mjs
// ─────────────────────────────────────────────────────────────
//  assign-dima-categories --apply sonrası atlanan ürünlerin nedenini teşhis eder.
//  DB'ye SADECE OKUMA yapar, hiçbir şey yazmaz.
//
//  Çalıştır: node src/scripts/diagnose-dima-skips.mjs --csv ~/Downloads/kibris-full.csv
// ─────────────────────────────────────────────────────────────

import dotenv from "dotenv";
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import MarketOrgProduct from "../models/MarketOrgProduct.js";
import { connectDB } from "../config/db.js";

dotenv.config();

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); if (i === -1) return d; const v = args[i + 1]; return v && !v.startsWith("--") ? v : true; };
const CSV = String(flag("csv", `${process.env.HOME}/Downloads/kibris-full.csv`));
const ORG = String(flag("org", "6a35b44c85b09f8304557aed"));

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

const normTitle = (s) =>
  String(s || "")
    .toLocaleUpperCase("tr")
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G")
    .replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

async function run() {
  await connectDB();
  const orgId = new mongoose.Types.ObjectId(ORG);

  const rows = parseCsv(readFileSync(CSV, "utf8"));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const ti = header.indexOf("urun_adi");
  const bi = header.indexOf("barkod");

  const csvByBarcode = new Map();
  const csvTitles = new Map(); // normTitle -> raw
  for (const r of rows) {
    const t = (r[ti] || "").trim();
    const b = (r[bi] || "").trim();
    if (b) csvByBarcode.set(b, t);
    if (t) csvTitles.set(normTitle(t), t);
  }

  const dbProducts = await MarketOrgProduct.find({ organizationId: orgId })
    .select("title barcode category").lean();

  const dbBarcodes = new Set(dbProducts.map((p) => (p.barcode || "").trim()).filter(Boolean));
  const dbTitleSet = new Set(dbProducts.map((p) => normTitle(p.title)));
  const noBarcode = dbProducts.filter((p) => !(p.barcode || "").trim());

  console.log(`\n[DB] Dima org ürün sayısı           : ${dbProducts.length}`);
  console.log(`[DB] barkodu BOŞ ürün                : ${noBarcode.length}`);
  console.log(`[CSV] satır sayısı                   : ${rows.length}`);

  // CSV'de olup DB'de barkodla VE başlıkla bulunamayanlar = gerçekten DB'de yok
  let missingBoth = 0, barcodeMismatchTitleMatch = 0;
  const missingSamples = [];
  for (const r of rows) {
    const t = (r[ti] || "").trim();
    const b = (r[bi] || "").trim();
    const barcodeHit = b && dbBarcodes.has(b);
    const titleHit = dbTitleSet.has(normTitle(t));
    if (!barcodeHit && !titleHit) {
      missingBoth++;
      if (missingSamples.length < 15) missingSamples.push(t);
    } else if (!barcodeHit && titleHit) {
      barcodeMismatchTitleMatch++;
    }
  }
  console.log(`\n[CSV→DB] barkod+başlık hiç eşleşmeyen (DB'de YOK): ${missingBoth}`);
  console.log(`[CSV→DB] barkod tutmayıp başlıkla bulunan          : ${barcodeMismatchTitleMatch}`);

  // DB'de olup CSV'de olmayanlar (ters yön — merak için)
  let dbNotInCsv = 0;
  const dbNotInCsvSamples = [];
  for (const p of dbProducts) {
    const b = (p.barcode || "").trim();
    if ((b && csvByBarcode.has(b)) || csvTitles.has(normTitle(p.title))) continue;
    dbNotInCsv++;
    if (dbNotInCsvSamples.length < 10) dbNotInCsvSamples.push(p.title);
  }
  console.log(`[DB→CSV] DB'de olup CSV'de olmayan                 : ${dbNotInCsv}`);

  console.log(`\nDB'de bulunamayan CSV ürünlerinden örnekler:`);
  for (const s of missingSamples) console.log(`  - ${s}`);
  if (dbNotInCsvSamples.length) {
    console.log(`\nDB'de olup CSV'de olmayanlardan örnekler:`);
    for (const s of dbNotInCsvSamples) console.log(`  - ${s}`);
  }

  // Atlanan örneklerden bilinenleri DB'de gevşek regex ile ara
  const probes = ["GULGUN", "EKER", "EMBORG", "AVAKADO", "DOMATES"];
  console.log(`\nGevşek arama (DB'de bu markalardan kaç ürün var):`);
  for (const probe of probes) {
    const n = dbProducts.filter((p) => normTitle(p.title).includes(probe)).length;
    console.log(`  ${probe}: ${n}`);
  }

  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
