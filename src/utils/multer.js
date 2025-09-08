// src/utils/multer.js
import multer from "multer";

const okTypes = [
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/heic", "image/heif", "application/pdf"
];

export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    console.log("multer got:", file.mimetype);
    if (okTypes.includes(file.mimetype)) {
      cb(null, true);                 // ✅ KABUL
    } else {
      cb(new Error("invalid file type")); // ❌ RED (hata fırlat)
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});
