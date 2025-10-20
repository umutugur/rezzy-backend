import Joi from "joi";

const oid = () => Joi.string().regex(/^[0-9a-fA-F]{24}$/).message("invalid objectId");

export const createReservationSchema = Joi.object({
  body: Joi.object({
    restaurantId: oid().required(),
    dateTimeISO: Joi.string().isoDate().required(),
    selections: Joi.array()
      .min(1)
      .items(
        Joi.object({
          person: Joi.number().min(1).required(),
          menuId: oid().required(),
        })
      )
      .required(),
    // partySize GÖNDERME; backend selections'tan hesaplıyor
  }).required(),
  params: Joi.object().empty({}),
  query: Joi.object().empty({}),
});

export const getReservationSchema = Joi.object({
  params: Joi.object({ rid: oid().required() }).required(),
  query: Joi.object().empty({}),
  body: Joi.object().empty({}),
});

export const uploadReceiptSchema = Joi.object({
  body: Joi.object().empty({}),
  params: Joi.object({ rid: oid().required() }).required(),
  query: Joi.object().empty({}),
});

export const approveReservationSchema = Joi.object({
  body: Joi.object().empty({}),
  params: Joi.object({ rid: oid().required() }).required(),
  query: Joi.object().empty({}),
});

export const rejectReservationSchema = approveReservationSchema;

// 10 haneli (epoch seconds) veya 13 haneli (epoch millis)
const epochRegex = /^(?:\d{10}|\d{13})$/;

export const checkinSchema = Joi.object({
  body: Joi.object({
    rid: oid().required(),
    mid: oid().required(),
    // ⬇️ ISO **veya** epoch (saniye/ms) kabul edilir
    ts: Joi.alternatives().try(
      Joi.string().isoDate(),
      Joi.string().pattern(epochRegex).message("ts must be ISO date or epoch (10/13 digits)")
    ).required(),
    sig: Joi.string().length(64).required(),
    arrivedCount: Joi.number().min(0).optional(),
  }).required(),
  params: Joi.object().empty({}),
  query: Joi.object().empty({}),
});

export const cancelReservationSchema = Joi.object({
  body: Joi.object().empty({}),
  params: Joi.object({ rid: oid().required() }).required(),
  query: Joi.object().empty({}),
});

// ✅ yeni: arrivedCount düzeltme
export const updateArrivedCountSchema = Joi.object({
  params: Joi.object({ rid: oid().required() }).required(),
  body: Joi.object({
    arrivedCount: Joi.number().min(0).required(),
  }).required(),
  query: Joi.object().empty({}),
});
