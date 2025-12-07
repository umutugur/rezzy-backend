import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow } from "../middlewares/roles.js";
import { validate } from "../middlewares/validate.js";
import { imageUpload } from "../utils/multer.js";

// Şema doğrulama fonksiyonları
import {
  createRestaurantSchema,
  listRestaurantsSchema,
  getRestaurantSchema,
  createMenuSchema,
  updateRestaurantSchema,
  getAvailabilitySchema,
  updateOpeningHoursSchema,
  updateTablesSchema,
  updatePoliciesSchema,
  updateMenusSchema,
  addPhotoSchema,
  removePhotoSchema,
  fetchReservationsByRestaurantSchema,
  updateReservationStatusSchema,
  getReservationQRSchema,
} from "../validators/restaurant.schema.js";

// Controller fonksiyonları
import {
  createRestaurant,
  listRestaurants,
  getRestaurant,
  createMenu,
  updateRestaurant,
  getAvailability,
  updateOpeningHours,
  updateTables,
  updatePolicies,
  updateMenus,
  addPhoto,
  removePhoto,
  fetchReservationsByRestaurant,
  updateReservationStatus,
  getReservationQR,
  uploadLogo,
} from "../controllers/restaurant.controller.js";

const r = Router();

// ----------------------------
// Genel restoran işlemleri
// ----------------------------

// Listeleme ve detay
r.get("/", validate(listRestaurantsSchema), listRestaurants);
r.get("/:id", validate(getRestaurantSchema), getRestaurant);

// Oluşturma (sadece restoran sahibi veya admin)
r.post(
  "/",
  auth(),
  allow("restaurant", "admin"),
  validate(createRestaurantSchema),
  createRestaurant
);

// Menü oluşturma (eski uç)
r.post(
  "/:id/menus",
  auth(),
  allow("restaurant", "admin"),
  validate(createMenuSchema),
  createMenu
);

// Genel güncelleme (isim, adres vb.)
r.put(
  "/:id",
  auth(),
  allow("restaurant", "admin"),
  validate(updateRestaurantSchema),
  updateRestaurant
);

// ----------------------------
// Panel spesifik güncellemeler
// ----------------------------

// Çalışma saatlerini güncelle
r.put(
  "/:id/opening-hours",
  auth(),
  allow("restaurant", "admin"),
  validate(updateOpeningHoursSchema),
  updateOpeningHours
);

// Masa listesini güncelle
r.put(
  "/:id/tables",
  auth(),
  allow("restaurant", "admin"),
  validate(updateTablesSchema),
  updateTables
);

// Rezervasyon politikalarını güncelle
r.put(
  "/:id/policies",
  auth(),
  allow("restaurant", "admin"),
  validate(updatePoliciesSchema),
  updatePolicies
);

// Menüler listesini güncelle (toplu)
r.put(
  "/:id/menus",
  auth(),
  allow("restaurant", "admin"),
  validate(updateMenusSchema),
  updateMenus
);

// Fotoğraf ekle
r.post(
  "/:id/photos",
  auth(),
  allow("restaurant", "admin"),
  imageUpload.single("file"),              // ⬅️ burada
  validate(addPhotoSchema),
  addPhoto
);

// Logo ekle/güncelle
r.post(
  "/:id/logo",
  auth(),
  allow("restaurant", "admin"),
  imageUpload.single("file"),
  uploadLogo
);

// Fotoğraf sil
r.delete(
  "/:id/photos",
  auth(),
  allow("restaurant", "admin"),
  validate(removePhotoSchema),
  removePhoto
);

// Belirli bir restoranın rezervasyonlarını getir (panel)
r.get(
  "/:id/reservations",
  auth(),
  allow("restaurant", "admin"),
  validate(fetchReservationsByRestaurantSchema),
  fetchReservationsByRestaurant
);

// Rezervasyon durumunu güncelle (onayla/iptal et)
r.put(
  "/reservations/:id/status",
  auth(),
  allow("restaurant", "admin"),
  validate(updateReservationStatusSchema),
  updateReservationStatus
);

// Bir rezervasyon için QR kodu getir
r.get(
  "/reservations/:id/qr",
  auth(),
  allow("restaurant", "admin", "customer"),
  validate(getReservationQRSchema),
  getReservationQR
);

// ----------------------------
// Müsaitlik sorgulama
// ----------------------------

// Belirli bir gün için boş saatleri döndür
r.get(
  "/:id/availability",
  validate(getAvailabilitySchema),
  getAvailability
);

export default r;