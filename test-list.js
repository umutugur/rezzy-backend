import mongoose from "mongoose";
import Restaurant from "./src/models/Restaurant.js"; // path'i projene göre düzelt

async function main() {
  const uri = process.env.MONGO_URI;

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri);
  console.log("✅ connected", {
    host: mongoose.connection.host,
    db: mongoose.connection.name,
    user: mongoose.connection.user,
  });

  const filter = { isActive: true, region: "CY" };

  console.time("q");
  const docs = await Restaurant.find(filter)
    .select("name city priceRange rating photos description location mapAddress")
    .sort({ rating: -1, name: 1 })
    .lean();
  console.timeEnd("q");

  const size = JSON.stringify(docs).length;
  console.log("count:", docs.length, "size:", size);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});