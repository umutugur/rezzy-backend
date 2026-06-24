import dotenv from "dotenv";
import mongoose from "mongoose";
import ApplicationDocRequirement from "../models/ApplicationDocRequirement.js";
import { connectDB } from "../config/db.js";
dotenv.config();

const L = (tr, en) => ({ tr, en, ru: en, el: en });
const KKTC = [
  { key: "id_card",              order: 10, file: true, number: true,  numberLabel: L("Kimlik No","ID No"),          i18n: L("Kimlik Kartı","ID Card") },
  { key: "driving_license",      order: 20, file: true, number: true,  expiry: true, numberLabel: L("Ehliyet No","Licence No"), i18n: L("Sürücü Ehliyeti","Driving Licence") },
  { key: "psv_permit",           order: 30, file: true, number: true,  expiry: true, numberLabel: L("İzin No","Permit No"),     i18n: L("Umumi Hizmet (PSV) İzni","PSV Permit") },
  { key: "vehicle_registration", order: 40, file: true, number: true,  numberLabel: L("Koçan No","Reg. No"),          i18n: L("Araç Ruhsatı (Koçan)","Vehicle Registration") },
  { key: "taxi_permit",          order: 50, file: true, number: true,  numberLabel: L("Plaka/İzin","Plate/Permit"),   i18n: L("Taksi Çalışma İzni (T Plaka)","Taxi Operating Permit") },
  { key: "insurance",            order: 60, file: true, expiry: true,  i18n: L("Yolcu Taşıma Sigortası","Passenger Insurance") },
  { key: "inspection",           order: 70, file: true, expiry: true,  i18n: L("Araç Muayene","Vehicle Inspection") },
  { key: "criminal_record",      order: 80, file: true,                i18n: L("Sabıka Kaydı","Criminal Record") },
  { key: "health_report",        order: 90, file: true, expiry: true, required: false, i18n: L("Sağlık Raporu","Health Report") },
];

async function run() {
  await connectDB();
  for (const r of KKTC) {
    await ApplicationDocRequirement.updateOne(
      { appType: "driver", countryCode: "KKTC", key: r.key },
      { $set: { appType: "driver", countryCode: "KKTC", required: r.required !== false, isActive: true, ...r } },
      { upsert: true }
    );
  }
  console.log(`[seed-partner-docs] KKTC driver ok (${KKTC.length})`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
