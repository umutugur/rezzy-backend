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

const locationSchema = Joi.object({
  type: Joi.string().valid("Point").default("Point"),
  coordinates: Joi.array()
    .items(Joi.number().min(-180).max(180))
    .length(2)
    .required()
    .messages({
      "array.length": "Koordinatlar [lng, lat] biçiminde olmalıdır.",
    }),
});

/* ---------- CREATE RESTAURANT ---------- */
export const createRestaurantSchema = Joi.object({
  params: anyObject,
  query: anyObject,
  body: Joi.object({
    name: Joi.string().required(),
    region: Joi.string().uppercase().min(2).max(3).required(),
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
    location: locationSchema.optional(),
    mapAddress: Joi.string().allow("", null),
    placeId: Joi.string().allow("", null),
    googleMapsUrl: Joi.string().uri().allow("", null),
    businessType: Joi.string()
    .valid(...BUSINESS_TYPES)
    .default("restaurant"),

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
    location: locationSchema.optional(),
    mapAddress: Joi.string().allow("", null),
    placeId: Joi.string().allow("", null),
    googleMapsUrl: Joi.string().allow("", null),
    businessType: Joi.string().valid(...BUSINESS_TYPES),

  }).min(1),
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
/**
 * Multipart yükleme (req.file) için: fileUrl zorunlu değil.
 * URL veya dataURL ile geliyorsa fileUrl kontrol edilir.
 * En az bir kaynak var mı kontrolü controller’da yapılır.
 */
export const addPhotoSchema = Joi.object({
  query: anyObject,
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    fileUrl: Joi.alternatives().try(
      Joi.string().uri({ scheme: ["http", "https"] }),
      Joi.string().pattern(/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/)
    ).optional()
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