import Joi from "joi";
import mongoose from "mongoose";

const objectId = (value, helpers) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return helpers.error("any.invalid");
  }
  return value;
};

const BUSINESS_TYPES = [
  "restaurant",
  "meyhane",
  "bar",
  "cafe",
  "kebapci",
  "fast_food",
  "coffee_shop",
  "pub",
  "other",
];

const anyObject = Joi.object({}).unknown(true);

// ✅ [lng, lat] doğrulaması doğru aralıklarla
const coordinatesSchema = Joi.array()
  .length(2)
  .items(
    Joi.number().min(-180).max(180).required(), // lng
    Joi.number().min(-90).max(90).required()    // lat
  )
  .required()
  .messages({
    "array.length": "Koordinatlar [lng, lat] biçiminde olmalıdır.",
  });

const locationSchema = Joi.object({
  type: Joi.string().valid("Point").default("Point"),
  coordinates: coordinatesSchema,
});


// ✅ Delivery payment options
const deliveryPaymentOptionsSchema = Joi.object({
  online: Joi.boolean().optional(),
  cashOnDelivery: Joi.boolean().optional(),
  cardOnDelivery: Joi.boolean().optional(),
}).unknown(false);

// ✅ Delivery HEX grid settings
const deliveryGridSettingsSchema = Joi.object({
  cellSizeMeters: Joi.number().min(50).optional(),
  radiusMeters: Joi.number().min(200).optional(),
  orientation: Joi.string().valid("flat", "pointy").default("flat"),
}).unknown(false);

// ✅ Delivery HEX zone (per-cell overrides)
const deliveryZoneSchema = Joi.object({
  id: Joi.string().trim().min(1).required(),
  name: Joi.string().allow("", null).optional(),
  isActive: Joi.boolean().default(true),
  minOrderAmount: Joi.number().min(0).default(0),
  feeAmount: Joi.number().min(0).default(0),
}).unknown(false);

// ✅ Delivery (model ile uyumlu) — HEX grid
const deliverySchema = Joi.object({
  enabled: Joi.boolean().optional(),

  paymentOptions: deliveryPaymentOptionsSchema.optional(),

  // Global defaults (optional)
  minOrderAmount: Joi.number().min(0).optional(),
  feeAmount: Joi.number().min(0).optional(),

  // HEX grid settings
  gridSettings: deliveryGridSettingsSchema.optional(),

  // Per-hex overrides
  zones: Joi.array().items(deliveryZoneSchema).optional(),
}).unknown(false);

/* ---------- CREATE RESTAURANT ---------- */
export const createRestaurantSchema = Joi.object({
  params: anyObject,
  query: anyObject,
  body: Joi.object({
    name: Joi.string().required(),
    region: Joi.string().uppercase().min(2).max(3).required(),

    // ✅ Yeni: restoran mutlaka bir organizasyona bağlı olmalı
    organizationId: Joi.string().custom(objectId).required(),

    address: Joi.string().allow("", null),
    phone: Joi.string().allow("", null),
    city: Joi.string().allow("", null),
    priceRange: Joi.string().valid("₺", "₺₺", "₺₺₺", "₺₺₺₺").default("₺₺"),
    rating: Joi.number().min(0).max(5).default(0),
    iban: Joi.string().required(),
    openingHours: Joi.array()
      .items(
        Joi.object({
          day: Joi.number().integer().min(0).max(6).required(),
          open: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
          close: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
          isClosed: Joi.boolean().default(false),
        })
      )
      .default([]),
    photos: Joi.array().items(Joi.string().uri()).default([]),
    description: Joi.string().allow("", null),
    social: Joi.array().items(Joi.string().allow("")).default([]),
    depositRate: Joi.number().min(0).max(100).default(10),
    cancelPolicy: Joi.string().default("24h_100;3h_50;lt3h_0"),
    graceMinutes: Joi.number().min(0).max(120).default(15),
    isActive: Joi.boolean().default(true),

    // ✅ Yeni: operasyonel durum (modeldeki status enum’ı ile aynı)
    status: Joi.string()
      .valid("pending_review", "active", "suspended", "closed")
      .default("active"),

    location: locationSchema.optional(),
    mapAddress: Joi.string().allow("", null),
    placeId: Joi.string().allow("", null),
    googleMapsUrl: Joi.string().uri().allow("", null),
    businessType: Joi.string()
      .valid(...BUSINESS_TYPES)
      .default("restaurant"),

    // ✅ NEW: Delivery ayarları (opsiyonel)
    delivery: deliverySchema.optional(),
  }),
});

/* ---------- CREATE RESTAURANT FOR ORGANIZATION (ADMIN) ---------- */
export const createOrganizationRestaurantAdminSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    oid: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    ownerId: Joi.string().custom(objectId).required(),
    name: Joi.string().required(),
    region: Joi.string().uppercase().min(2).max(3).required(),

    address: Joi.string().allow("", null),
    phone: Joi.string().allow("", null),
    city: Joi.string().allow("", null),
    priceRange: Joi.string()
      .valid("₺", "₺₺", "₺₺₺", "₺₺₺₺")
      .default("₺₺"),
    rating: Joi.number().min(0).max(5).default(0),
    iban: Joi.string().required(),
    openingHours: Joi.array()
      .items(
        Joi.object({
          day: Joi.number().integer().min(0).max(6).required(),
          open: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
          close: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
          isClosed: Joi.boolean().default(false),
        })
      )
      .default([]),
    photos: Joi.array().items(Joi.string().uri()).default([]),
    description: Joi.string().allow("", null),
    social: Joi.array().items(Joi.string().allow("")).default([]),
    depositRate: Joi.number().min(0).max(100).default(10),
    cancelPolicy: Joi.string().default("24h_100;3h_50;lt3h_0"),
    graceMinutes: Joi.number().min(0).max(120).default(15),
    isActive: Joi.boolean().default(true),

    location: locationSchema.optional(),
    mapAddress: Joi.string().allow("", null),
    placeId: Joi.string().allow("", null),
    googleMapsUrl: Joi.string().uri().allow("", null),
    businessType: Joi.string()
      .valid(...BUSINESS_TYPES)
      .default("restaurant"),

    // ✅ NEW: Delivery ayarları (opsiyonel)
    delivery: deliverySchema.optional(),
  }),
});

/* ---------- CREATE MENU (legacy) ---------- */
export const createMenuSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    name: Joi.string().required(),
    items: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().required(),
          price: Joi.number().min(0).required(),
          description: Joi.string().allow("", null),
          isActive: Joi.boolean().default(true),
        })
      )
      .default([]),
    isActive: Joi.boolean().default(true),
  }),
});

/* ---------- UPDATE RESTAURANT ---------- */
export const updateRestaurantSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    name: Joi.string(),
    region: Joi.string().uppercase().min(2).max(3),

    // ✅ Yeni: gerekiyorsa restoran başka bir organizasyona taşınabilir
    organizationId: Joi.string().custom(objectId),

    address: Joi.string().allow("", null),
    phone: Joi.string().allow("", null),
    city: Joi.string().allow("", null),
    priceRange: Joi.string().valid("₺", "₺₺", "₺₺₺", "₺₺₺₺"),
    rating: Joi.number().min(0).max(5),
    iban: Joi.string(),
    openingHours: Joi.array().items(
      Joi.object({
        day: Joi.number().integer().min(0).max(6).required(),
        open: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
        close: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
        isClosed: Joi.boolean().default(false),
      })
    ),
    photos: Joi.array().items(Joi.string().uri()),
    description: Joi.string().allow("", null),
    social: Joi.array().items(Joi.string().allow("")),
    depositRate: Joi.number().min(0).max(100),
    cancelPolicy: Joi.string(),
    graceMinutes: Joi.number().min(0).max(120),
    isActive: Joi.boolean(),

    // ✅ Yeni: status update (askıya alma, kapatma vb.)
    status: Joi.string().valid("pending_review", "active", "suspended", "closed"),

    location: locationSchema.optional(),
    mapAddress: Joi.string().allow("", null),
    placeId: Joi.string().allow("", null),
    googleMapsUrl: Joi.string().allow("", null),
    businessType: Joi.string().valid(...BUSINESS_TYPES),

    // ✅ NEW: Delivery ayarları (opsiyonel)
    delivery: deliverySchema.optional(),
  }).min(1),
});

/* ---------- DELIVERY SETTINGS (NEW) ---------- */

// ✅ Delivery settings endpoint accepts BOTH shapes:
// 1) root-level fields: { enabled, paymentOptions, minOrderAmount, ... }
// 2) nested: { delivery: { enabled, paymentOptions, ... } }
// Also accepts flexible location formats (GeoJSON or {lat,lng} etc.)
const flexibleLocationSchema = Joi.alternatives().try(
  // GeoJSON Point
  locationSchema,

  // { lat, lng } or { latitude, longitude }
  Joi.object({
    lat: Joi.number().min(-90).max(90).optional(),
    lng: Joi.number().min(-180).max(180).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
  })
    .min(2)
    .unknown(false)
);

const deliverySettingsBodySchema = Joi.object({
  enabled: Joi.boolean().optional(),

  paymentOptions: deliveryPaymentOptionsSchema.optional(),

  minOrderAmount: Joi.number().min(0).optional(),
  feeAmount: Joi.number().min(0).optional(),

  // HEX grid
  gridSettings: deliveryGridSettingsSchema.optional(),
  zones: Joi.array().items(deliveryZoneSchema).optional(),

  // location (optional) — supports GeoJSON Point or {lat,lng}
  location: flexibleLocationSchema.optional(),

  // convenience lat/lng fields
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),

  // nested shape also allowed
  delivery: Joi.object({
    enabled: Joi.boolean().optional(),
    paymentOptions: deliveryPaymentOptionsSchema.optional(),
    minOrderAmount: Joi.number().min(0).optional(),
    feeAmount: Joi.number().min(0).optional(),

    gridSettings: deliveryGridSettingsSchema.optional(),
    zones: Joi.array().items(deliveryZoneSchema).optional(),

    location: flexibleLocationSchema.optional(),
  })
    .min(1)
    .unknown(false)
    .optional(),
})
  .min(1)
  .unknown(false)
  .custom((value, helpers) => {
    // ✅ Merge nested delivery -> root (root wins)
    const d = value.delivery && typeof value.delivery === "object" ? value.delivery : {};
    const merged = {
      ...d,
      ...value,
      location: typeof value.location !== "undefined" ? value.location : d.location,
      paymentOptions:
        typeof value.paymentOptions !== "undefined" ? value.paymentOptions : d.paymentOptions,
      gridSettings:
        typeof value.gridSettings !== "undefined" ? value.gridSettings : d.gridSettings,
      zones: typeof value.zones !== "undefined" ? value.zones : d.zones,
    };

    // ✅ important: merged’i geri döndür
    delete merged.delivery;

    const hasAny = Object.keys(merged).length > 0;
    if (!hasAny) {
      return helpers.error("any.invalid");
    }
    return merged;
  });

export const updateDeliverySettingsSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: deliverySettingsBodySchema,
});

/* ---------- AVAILABILITY ---------- */
export const getAvailabilitySchema = Joi.object({
  body: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object({
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    partySize: Joi.number().integer().min(1).default(2),
  }),
});

/* ---------- OPENING HOURS ---------- */
export const updateOpeningHoursSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    openingHours: Joi.array()
      .items(
        Joi.object({
          day: Joi.number().integer().min(0).max(6).required(),
          open: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
          close: Joi.string().pattern(/^\d{1,2}:\d{2}$/).required(),
          isClosed: Joi.boolean().default(false),
        })
      )
      .required(),
  }),
});

/* ---------- TABLES ---------- */
export const updateTablesSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    tables: Joi.array()
      .items(
        Joi.object({
          name: Joi.string().required(),
          capacity: Joi.number().integer().min(1).required(),
          isActive: Joi.boolean().default(true),
        })
      )
      .required(),
  }),
});

/* ---------- POLICIES ---------- */
export const updatePoliciesSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    minPartySize: Joi.number().integer().min(1),
    maxPartySize: Joi.number().integer().min(Joi.ref("minPartySize")),
    slotMinutes: Joi.number().integer().min(30).max(240),
    depositRequired: Joi.boolean(),
    depositAmount: Joi.number().min(0),
    blackoutDates: Joi.array().items(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)),
  }).min(1),
});

/* ---------- MENUS ---------- */
export const updateMenusSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    menus: Joi.array()
      .items(
        Joi.object({
          _id: Joi.string().custom(objectId).optional(),
          title: Joi.string().required(),
          description: Joi.string().allow("", null).optional(),
          pricePerPerson: Joi.number().min(0).required(),
          isActive: Joi.boolean().optional(),
        })
      )
      .required(),
  }),
});

/* ---------- PHOTOS ---------- */
export const addPhotoSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    fileUrl: Joi.alternatives()
      .try(
        Joi.string().uri({ scheme: ["http", "https"] }),
        Joi.string().pattern(
          /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/
        )
      )
      .optional(),
  }).unknown(true),
});

export const removePhotoSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    url: Joi.string().uri().required(),
  }),
});

/* ---------- RESERVATIONS LIST (PANEL) ---------- */
export const fetchReservationsByRestaurantSchema = Joi.object({
  body: anyObject,
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
});

/* ---------- UPDATE RESERVATION STATUS ---------- */
export const updateReservationStatusSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    status: Joi.string()
      .valid("pending", "confirmed", "cancelled", "arrived", "no_show")
      .required(),
  }),
});

/* ---------- RESERVATION QR ---------- */
export const getReservationQRSchema = Joi.object({
  body: anyObject,
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
});

export const listRestaurantsSchema = Joi.object({
  params: Joi.object().unknown(true),
  body: Joi.object().unknown(true),
  query: Joi.object({
    city: Joi.string().allow("", null),
    query: Joi.string().allow("", null),
    region: Joi.string().trim().uppercase().min(2).max(3).optional(),
    lat: Joi.number().optional(),
    lng: Joi.number().optional(),
    _cb: Joi.any().optional(),
  }).unknown(true),
});

export const getRestaurantSchema = Joi.object({
  query: anyObject,
  body: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
});