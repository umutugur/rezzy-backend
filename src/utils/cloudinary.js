// src/utils/cloudinary.js
import { v2 as cloudinary } from "cloudinary";
import stream from "stream";
import dotenv from "dotenv";

// .env'yi BU dosyada da yükle (import sırası sorunlarını bertaraf eder)
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Koruyucu: eksik env varsa erken ve anlaşılır patlat
const missing = ["CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET"]
  .filter(k => !process.env[k]);
if (missing.length) {
  throw new Error("Cloudinary env eksik: " + missing.join(", "));
}

// Buffer'ı stream ile Cloudinary'e yükler
export function uploadBufferToCloudinary(buffer, opts = {}) {
  const { folder = process.env.CLOUDINARY_FOLDER || "rezzy/receipts",
          resource_type = "auto" } = opts;

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      { folder, resource_type },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    upload.end(buffer);
  });
}

export default cloudinary;
