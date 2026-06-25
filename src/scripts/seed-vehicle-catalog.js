import dotenv from "dotenv";
dotenv.config();
import { connectDB } from "../config/db.js";
import VehicleMake from "../models/VehicleMake.js";
import VehicleModel from "../models/VehicleModel.js";

const COUNTRY = "CY";

const CATALOG = {
  "Toyota": ["Corolla", "Yaris", "Auris", "Avensis", "RAV4", "Hilux", "C-HR", "Camry"],
  "Honda": ["Civic", "Jazz", "Accord", "CR-V", "HR-V"],
  "Nissan": ["Micra", "Qashqai", "Juke", "X-Trail", "Note", "Almera"],
  "Ford": ["Fiesta", "Focus", "Mondeo", "Kuga", "Transit", "Ranger", "Puma"],
  "Volkswagen": ["Golf", "Polo", "Passat", "Tiguan", "Touran", "Caddy", "T-Roc"],
  "BMW": ["1 Series", "3 Series", "5 Series", "X1", "X3", "X5"],
  "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "GLA", "GLC", "Vito", "Sprinter"],
  "Audi": ["A1", "A3", "A4", "A6", "Q3", "Q5"],
  "Hyundai": ["i10", "i20", "i30", "Tucson", "Santa Fe", "Accent"],
  "Kia": ["Picanto", "Rio", "Ceed", "Sportage", "Sorento"],
  "Renault": ["Clio", "Megane", "Captur", "Kadjar", "Symbol", "Trafic"],
  "Peugeot": ["208", "308", "2008", "3008", "Partner"],
  "Fiat": ["Egea", "Panda", "500", "Doblo", "Tipo"],
  "Opel": ["Corsa", "Astra", "Insignia", "Mokka", "Combo"],
  "Citroen": ["C1", "C3", "C4", "Berlingo"],
  "Mazda": ["2", "3", "6", "CX-3", "CX-5"],
  "Mitsubishi": ["Colt", "Lancer", "ASX", "Outlander", "L200"],
  "Suzuki": ["Swift", "Vitara", "S-Cross", "Jimny"],
  "Skoda": ["Fabia", "Octavia", "Superb", "Kodiaq"],
  "Seat": ["Ibiza", "Leon", "Arona", "Ateca"],
  "Dacia": ["Sandero", "Duster", "Logan"],
  "Volvo": ["XC40", "XC60", "S60", "V40"],
  "Land Rover": ["Defender", "Discovery", "Range Rover Evoque"],
  "Mini": ["Cooper", "Countryman"],
  "Jeep": ["Renegade", "Compass", "Wrangler"],
  "Tesla": ["Model 3", "Model Y"],
};

async function main() {
  await connectDB();

  let makesInserted = 0;
  let modelsInserted = 0;

  const makeEntries = Object.entries(CATALOG);
  for (let makeIdx = 0; makeIdx < makeEntries.length; makeIdx++) {
    const [make, models] = makeEntries[makeIdx];
    const makeOrder = makeIdx * 10;

    const makeResult = await VehicleMake.updateOne(
      { countryCode: COUNTRY, name: make },
      { $setOnInsert: { order: makeOrder, isActive: true } },
      { upsert: true }
    );
    if (makeResult.upsertedCount) makesInserted++;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const modelResult = await VehicleModel.updateOne(
        { countryCode: COUNTRY, make, name: model },
        { $setOnInsert: { order: i * 10, isActive: true } },
        { upsert: true }
      );
      if (modelResult.upsertedCount) modelsInserted++;
    }
  }

  console.log(`Seed tamamlandı — Markalar: ${makesInserted} yeni, Modeller: ${modelsInserted} yeni`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed hatası:", err);
  process.exit(1);
});
