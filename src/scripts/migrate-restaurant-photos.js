// scripts/migrate-restaurant-photos.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Restaurant from "../models/Restaurant.js";
import { uploadBufferToCloudinary } from "../utils/cloudinary.js";

dotenv.config();

const MONGO = process.env.MONGO_URI || process.env.MONGO_URL;

async function run() {
  await mongoose.connect(MONGO);
  console.log("Connected");

  const cursor = Restaurant.find({ photos: { $exists: true, $type: "array", $ne: [] } })
    .select("_id photos")
    .cursor();

  let changed = 0, scanned = 0;

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    scanned++;
    const newPhotos = [];
    let modified = false;

    for (const p of doc.photos) {
      if (typeof p === "string" && (p.startsWith("http://") || p.startsWith("https://"))) {
        newPhotos.push(p);
        continue;
      }
      if (typeof p === "string" && p.startsWith("data:")) {
        const m = p.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!m) continue;
        const base64 = m[2];
        const buffer = Buffer.from(base64, "base64");
        const up = await uploadBufferToCloudinary(buffer, {
          folder: "rezzy/restaurants",
          resource_type: "image",
        });
        newPhotos.push(up.secure_url);
        modified = true;
      }
    }

    if (modified) {
      await Restaurant.updateOne({ _id: doc._id }, { $set: { photos: newPhotos } });
      changed++;
      console.log(`Updated ${doc._id} (photos: ${newPhotos.length})`);
    }
  }

  console.log(`Scanned=${scanned}, Changed=${changed}`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});