import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { allow, allowLocationManagerOrAdmin } from "../middlewares/roles.js";
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

  // ✅ NEW
  updateDeliverySettingsSchema,
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

  // ✅ NEW
  updateDeliverySettings,
} from "../controllers/restaurant.controller.js";

const r = Router();

// ----------------------------
// Genel restoran işlemleri
// ----------------------------

// Listeleme ve detay (public)
r.get("/", validate(listRestaurantsSchema), listRestaurants);
r.get("/:id", validate(getRestaurantSchema), getRestaurant);

// Oluşturma (sadece restoran sahibi veya admin)
// -> Burayı şimdilik global role bazlı bırakıyorum;
//    yeni şube açılışı için org endpointlerini kullanıyoruz.
r.post(
  "/",
  auth(),
  allow("restaurant", "admin"),
  validate(createRestaurantSchema),
  createRestaurant
);

// Menü oluşturma (eski uç)
// -> Panelden çağrılıyorsa location_manager da kullanabilsin
r.post(
  "/:id/menus",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(createMenuSchema),
  createMenu
);

// Genel güncelleme (isim, adres vb.)
r.put(
  "/:id",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(updateRestaurantSchema),
  updateRestaurant
);

// ----------------------------
// Panel spesifik güncellemeler
// ----------------------------

// ✅ Delivery (paket servis) ayarlarını güncelle
r.put(
  "/:id/delivery-settings",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(updateDeliverySettingsSchema),
  updateDeliverySettings
);

// Çalışma saatlerini güncelle
r.put(
  "/:id/opening-hours",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(updateOpeningHoursSchema),
  updateOpeningHours
);

// Masa listesini güncelle
r.put(
  "/:id/tables",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(updateTablesSchema),
  updateTables
);

// Rezervasyon politikalarını güncelle
r.put(
  "/:id/policies",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(updatePoliciesSchema),
  updatePolicies
);

// Menüler listesini güncelle (toplu)
r.put(
  "/:id/menus",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(updateMenusSchema),
  updateMenus
);

// Fotoğraf ekle
r.post(
  "/:id/photos",
  auth(),
  allowLocationManagerOrAdmin("id"),
  imageUpload.single("file"),
  validate(addPhotoSchema),
  addPhoto
);

// Logo ekle/güncelle
r.post(
  "/:id/logo",
  auth(),
  allowLocationManagerOrAdmin("id"),
  imageUpload.single("file"),
  uploadLogo
);

// Fotoğraf sil
r.delete(
  "/:id/photos",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(removePhotoSchema),
  removePhoto
);

// Belirli bir restoranın rezervasyonlarını getir (panel)
r.get(
  "/:id/reservations",
  auth(),
  allowLocationManagerOrAdmin("id"),
  validate(fetchReservationsByRestaurantSchema),
  fetchReservationsByRestaurant
);

// Rezervasyon durumunu güncelle (onayla/iptal et)
// Burada restaurantId param yok, o yüzden şimdilik legacy role check kalsın.
// Zaten yeni approve/reject uçları reservation.routes içinde membership-aware.
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
// Müsaitlik sorgulama (public)
// ----------------------------

r.get(
  "/:id/availability",
  validate(getAvailabilitySchema),
  getAvailability
);

export default r;