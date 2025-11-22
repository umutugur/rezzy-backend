// src/utils/multer.js
import multer from "multer";

const okTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export const receiptUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    console.log("multer got:", file.mimetype);
    if (okTypes.includes(file.mimetype)) {
      cb(null, true); // ✅ KABUL
    } else {
      cb(new Error("invalid file type")); // ❌ RED
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i.test(file.mimetype);
    if (!ok) return cb(new Error("Sadece görüntü dosyalarına izin verilir"));
    cb(null, true);
  },
});

// ✅ Legacy default export (yanlış import kalsa bile patlamasın diye)
// Named importlar (receiptUpload, imageUpload) aynen çalışır.
export default imageUpload;