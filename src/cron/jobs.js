import Reservation from "../models/Reservation.js";
import { notifyUser, notifyRestaurantOwner } from "../services/notification.service.js";
import { dayjs } from "../utils/dates.js";

/** targetISO, now+offset dakikaya ±window içinde mi? */
function isInWindow(targetISO, offsetMin, windowMin = 10) {
  const now = dayjs();
  const target = now.add(offsetMin, "minute");
  const dt = dayjs(targetISO);
  return Math.abs(dt.diff(target, "minute")) <= windowMin;
}

/** 24 saat kala — sadece confirmed */
export async function jobReminder24h() {
  const now = new Date();
  const list = await Reservation.find({
    status: "confirmed",
    reminder24hSent: { $ne: true },
    dateTimeUTC: { $gte: now }
  }).select("_id userId dateTimeUTC").lean();

  let sent = 0;
  for (const r of list) {
    if (!isInWindow(r.dateTimeUTC, 24*60, 15)) continue;
    await notifyUser(r.userId, {
      title: "Yarın görüşüyoruz – QR kodunu unutma",
      body:  "Girişte QR kodunu okutacaksın.",
      data:  { type: "reminder_24h", rid: String(r._id), section: "qrcode" },
      key:   `cust:rem24:${r._id}`,
      type:  "reminder_24h"
    });
    await Reservation.updateOne({ _id: r._id }, { $set: { reminder24hSent: true } });
    sent++;
  }
  return { ok: true, checked: list.length, sent };
}

/** 3 saat kala — sadece confirmed */
export async function jobReminder3h() {
  const now = new Date();
  const list = await Reservation.find({
    status: "confirmed",
    reminder3hSent: { $ne: true },
    dateTimeUTC: { $gte: now }
  }).select("_id userId dateTimeUTC").lean();

  let sent = 0;
  for (const r of list) {
    if (!isInWindow(r.dateTimeUTC, 3*60, 10)) continue;
    await notifyUser(r.userId, {
      title: "3 saat kaldı – QR kodunu hazırla",
      body:  "Uygulama içinden QR kodunu açmayı unutma.",
      data:  { type: "reminder_3h", rid: String(r._id), section: "qrcode" },
      key:   `cust:rem3:${r._id}`,
      type:  "reminder_3h"
    });
    await Reservation.updateOne({ _id: r._id }, { $set: { reminder3hSent: true } });
    sent++;
  }
  return { ok: true, checked: list.length, sent };
}

/** Restorana — bekleyen istek hatırlatması (dekonttan 2 saat sonra, 1 defa) */
export async function jobRestaurantPendingReminder() {
  const cutoff = dayjs().subtract(2, "hour").toDate();
  const now = new Date();

  const list = await Reservation.find({
    status: "pending",
    receiptUploadedAt: { $exists: true, $ne: null, $lte: cutoff },
    restPendingRemSent: { $ne: true },
    dateTimeUTC: { $gte: now }
  }).select("_id restaurantId").lean();

  let sent = 0;
  for (const r of list) {
    await notifyRestaurantOwner(r.restaurantId, {
      title: "Bekleyen rezervasyon isteği",
      body:  "Yanıtlanmamış bir rezervasyon talebiniz var.",
      data:  { type: "restaurant_pending_reminder", rid: String(r._id) },
      key:   `rest:pendingRem:${r._id}`,
      type:  "restaurant_pending_reminder"
    });
    await Reservation.updateOne({ _id: r._id }, { $set: { restPendingRemSent: true } });
    sent++;
  }
  return { ok: true, checked: list.length, sent };
}

/** Opsiyonel — saate çok az kala hâlâ pending ise otomatik iptal */
export async function jobAutoTimeoutPending() {
  if (process.env.AUTO_TIMEOUT_PENDING !== "1") return { ok: true, skipped: true };
  const guardMinutes = Number(process.env.AUTO_TIMEOUT_GUARD_MIN || 180);
  const guardStart = dayjs().add(guardMinutes, "minute").toDate();

  const list = await Reservation.find({
    status: "pending",
    dateTimeUTC: { $lte: guardStart }
  }).select("_id userId restaurantId").lean();

  let cancelled = 0;
  for (const r of list) {
    await Reservation.updateOne({ _id: r._id }, { $set: { status: "cancelled", cancelledAt: new Date() } });
    cancelled++;
    // İstersen burada bildirim gönderebilirsin (müşteri + restoran).
  }
  return { ok: true, cancelled };
}
