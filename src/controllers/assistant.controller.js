// controllers/assistant.controller.js
import { classifyIntent } from "../ai/intentClassifier.js";
import { SUPPORTED_LANGUAGES } from "../ai/intentDataset.js";
import { generateAssistantReply } from "../ai/llmClient.js";
import Reservation from "../models/Reservation.js";
import Restaurant from "../models/Restaurant.js";
import DeliveryOrder from "../models/DeliveryOrder.js";
import Complaint from "../models/Complaint.js";
import { dayjs } from "../utils/dates.js";
import { notifyRestaurantOwner, notifyUser } from "../services/notification.service.js";
import { addIncident } from "../services/userRisk.service.js";
import { computeAvgSpendBaseForRestaurant } from "./menu.controller.js";
import {
  getAssistantThread,
  appendThreadMessage,
  getThreadHistory,
} from "../services/assistantMemory.service.js";

const FALLBACK_LANG = "tr";

function resolveLang(langRaw) {
  const raw = (langRaw || "").toString().toLowerCase();
  if (!raw) return FALLBACK_LANG;
  const primary = raw.split(",")[0].trim();
  const code = primary.split("-")[0].trim();
  return SUPPORTED_LANGUAGES.includes(code) ? code : FALLBACK_LANG;
}

/**
 * Küçük helper: kişi sayısı yakalamaya çalış (çok basic).
 * Örn: "4 kişi", "3 people"
 */
function detectPeopleCount(message) {
  const raw = String(message || "").trim();
  if (!raw) return null;
  if (/^\d{1,2}$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && n <= 50) return n;
  }

  const m = raw.match(/(\d{1,2})\s*(kişi|kişilik|person|people|guest|pax|άτομα|человека|человек)\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0 || n > 50) return null;
  return n;
}

const STRIPE_VISIBILITY_FILTER = {
  $or: [{ paymentProvider: { $ne: "stripe" } }, { depositStatus: "paid" }],
};

const PENDING_TTL_MINUTES = 30;

function normalizeText(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseKeyValuePairs(input) {
  const raw = String(input || "").trim();
  if (!raw) return {};
  const parts = raw.includes(";")
    ? raw.split(";")
    : raw.split(/\s+/g);
  const out = {};
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (!k || rest.length === 0) continue;
    const key = k.trim().toLowerCase();
    const val = rest.join("=").trim();
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

function parseCommand(message) {
  const text = String(message || "").trim();
  if (!text.startsWith("@")) return null;
  const body = text.slice(1).trim();
  if (!body) return null;
  const [cmdRaw, ...rest] = body.split(" ");
  const cmd = cmdRaw.toLowerCase();
  const params = parseKeyValuePairs(rest.join(" "));
  return { cmd, params, raw: text };
}

function parseTimeFromMessage(message) {
  const text = String(message || "");
  const m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseTimeRangeFromMessage(message) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  const m = text.match(
    /\b([01]?\d|2[0-3]):([0-5]\d)\s*[–—-]\s*([01]?\d|2[0-3]):([0-5]\d)\b/
  );
  if (!m) return null;
  const h1 = String(Number(m[1])).padStart(2, "0");
  const m1 = String(Number(m[2])).padStart(2, "0");
  const h2 = String(Number(m[3])).padStart(2, "0");
  const m2 = String(Number(m[4])).padStart(2, "0");
  return `${h1}:${m1}-${h2}:${m2}`;
}

function parseDateFromMessage(message, lang) {
  const text = normalizeText(message);
  const now = dayjs();

  const keywords = {
    tr: [
      { key: "bugün", offset: 0 },
      { key: "yarın", offset: 1 },
      { key: "öbür gün", offset: 2 },
      { key: "bu akşam", offset: 0 },
    ],
    en: [
      { key: "today", offset: 0 },
      { key: "tonight", offset: 0 },
      { key: "tomorrow", offset: 1 },
      { key: "day after tomorrow", offset: 2 },
    ],
    ru: [
      { key: "сегодня", offset: 0 },
      { key: "завтра", offset: 1 },
      { key: "послезавтра", offset: 2 },
    ],
    el: [
      { key: "σήμερα", offset: 0 },
      { key: "αύριο", offset: 1 },
      { key: "μεθαύριο", offset: 2 },
    ],
  };

  const list = keywords[lang] || [];
  for (const k of list) {
    if (text.includes(k.key)) {
      return now.add(k.offset, "day").startOf("day").toDate();
    }
  }

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = dayjs(`${iso[1]}-${iso[2]}-${iso[3]}`);
    if (d.isValid()) return d.startOf("day").toDate();
  }

  const dm = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    let year = Number(dm[3]) || now.year();
    if (year < 100) year = 2000 + year;
    let d = dayjs(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (d.isValid() && d.isBefore(now.startOf("day"))) {
      d = d.add(1, "year");
    }
    return d.isValid() ? d.startOf("day").toDate() : null;
  }

  return null;
}

function parseDateWithLabel(message, lang) {
  const text = normalizeText(message);
  const now = dayjs();
  const keywords = {
    tr: [
      { key: "bugün", offset: 0, label: "Bugün" },
      { key: "yarın", offset: 1, label: "Yarın" },
      { key: "öbür gün", offset: 2, label: "Öbür gün" },
      { key: "bu akşam", offset: 0, label: "Bu akşam" },
    ],
    en: [
      { key: "today", offset: 0, label: "Today" },
      { key: "tonight", offset: 0, label: "Tonight" },
      { key: "tomorrow", offset: 1, label: "Tomorrow" },
      { key: "day after tomorrow", offset: 2, label: "Day after tomorrow" },
    ],
    ru: [
      { key: "сегодня", offset: 0, label: "Сегодня" },
      { key: "завтра", offset: 1, label: "Завтра" },
      { key: "послезавтра", offset: 2, label: "Послезавтра" },
    ],
    el: [
      { key: "σήμερα", offset: 0, label: "Σήμερα" },
      { key: "αύριο", offset: 1, label: "Αύριο" },
      { key: "μεθαύριο", offset: 2, label: "Μεθαύριο" },
    ],
  };

  const list = keywords[lang] || [];
  for (const k of list) {
    if (text.includes(k.key)) {
      const d = now.add(k.offset, "day").startOf("day").toDate();
      return { date: d, label: k.label };
    }
  }

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = dayjs(`${iso[1]}-${iso[2]}-${iso[3]}`);
    if (d.isValid()) {
      const label = d.format("DD.MM.YYYY");
      return { date: d.startOf("day").toDate(), label };
    }
  }

  const dm = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    let year = Number(dm[3]) || now.year();
    if (year < 100) year = 2000 + year;
    let d = dayjs(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (d.isValid() && d.isBefore(now.startOf("day"))) {
      d = d.add(1, "year");
    }
    if (d.isValid()) {
      const label = d.format("DD.MM.YYYY");
      return { date: d.startOf("day").toDate(), label };
    }
  }

  return null;
}

function parseBudgetFromMessage(message, lang) {
  const text = normalizeText(message);
  if (text.includes("₺₺₺")) return "₺₺₺";
  if (text.includes("₺₺")) return "₺₺";
  if (text.includes("₺")) return "₺";

  const map = {
    tr: {
      low: ["ucuz", "uygun", "ekonomik", "hesaplı"],
      mid: ["orta", "normal", "standart"],
      high: ["pahalı", "lüks", "yüksek"],
    },
    en: {
      low: ["cheap", "budget", "affordable"],
      mid: ["mid", "average", "moderate"],
      high: ["expensive", "luxury", "high end"],
    },
    ru: {
      low: ["дешев", "бюджет"],
      mid: ["средн", "обычн"],
      high: ["дорог", "люкс"],
    },
    el: {
      low: ["φθην", "οικονομ"],
      mid: ["μεσα", "κανον"],
      high: ["ακριβ", "πολυτελ"],
    },
  };

  const cfg = map[lang] || map.tr;
  if (cfg.low.some((k) => text.includes(k))) return "₺";
  if (cfg.mid.some((k) => text.includes(k))) return "₺₺";
  if (cfg.high.some((k) => text.includes(k))) return "₺₺₺";
  return null;
}

function parseStyleFromMessage(message, lang) {
  const text = normalizeText(message);
  const styles = [
    { key: "meyhane", label: "meyhane" },
    { key: "taverna", label: "taverna" },
    { key: "balık", label: "balık" },
    { key: "seafood", label: "seafood" },
    { key: "sushi", label: "sushi" },
    { key: "pizza", label: "pizza" },
    { key: "steak", label: "steak" },
    { key: "canlı müzik", label: "canlı müzik" },
    { key: "live music", label: "live music" },
  ];
  const found = styles.find((s) => text.includes(s.key));
  return found ? found.label : null;
}

function parseCityFromMessage(message) {
  const text = normalizeText(message);
  const cities = [
    { match: /lefkoşa|nicosia/, value: "Lefkoşa" },
    { match: /girne|kyrenia/, value: "Girne" },
    { match: /gazimağusa|gazimagusa|famagusta|magusa/, value: "Gazimağusa" },
    { match: /güzelyurt|guzelyurt|morphou/, value: "Güzelyurt" },
    { match: /iskele|isk[eé]le|trikomo/, value: "İskele" },
    { match: /lefke/, value: "Lefke" },
    { match: /istanbul/, value: "İstanbul" },
    { match: /ankara/, value: "Ankara" },
  ];
  const found = cities.find((c) => c.match.test(text));
  return found ? found.value : null;
}

function combineDateAndTime(dateObj, timeStr) {
  if (!dateObj || !timeStr) return null;
  const [hh, mm] = String(timeStr).split(":").map((n) => parseInt(n, 10));
  const d = dayjs(dateObj)
    .hour(Number.isFinite(hh) ? hh : 0)
    .minute(Number.isFinite(mm) ? mm : 0)
    .second(0)
    .millisecond(0);
  return d.toDate();
}

function formatDateTimeShort(date) {
  return dayjs(date).format("DD.MM.YYYY HH:mm");
}

function isPendingExpired(pending) {
  if (!pending?.at) return false;
  const ts = dayjs(pending.at);
  return dayjs().diff(ts, "minute") > PENDING_TTL_MINUTES;
}

const ACTION_TEXT = {
  loginRequired: {
    tr: "Bu işlemi yapabilmem için giriş yapmış olman gerekiyor.",
    en: "You need to be logged in to do this.",
    ru: "Для этого нужно войти в аккаунт.",
    el: "Χρειάζεται να συνδεθείς για να γίνει αυτό.",
  },
  noReservations: {
    tr: "Kayıtlı bir rezervasyonun görünmüyor.",
    en: "I couldn't find any reservations.",
    ru: "Не вижу активных бронирований.",
    el: "Δεν βρέθηκαν κρατήσεις.",
  },
  reservationsHeader: {
    tr: "Rezervasyonların:",
    en: "Your reservations:",
    ru: "Ваши бронирования:",
    el: "Οι κρατήσεις σου:",
  },
  chooseReservation: {
    tr: "Hangi rezervasyon? Numarasını yazabilir veya aşağıdan seçebilirsin.",
    en: "Which reservation? Type the number or choose below.",
    ru: "Какая бронь? Напиши номер или выбери ниже.",
    el: "Ποια κράτηση; Γράψε τον αριθμό ή διάλεξε παρακάτω.",
  },
  cancelOk: {
    tr: "Rezervasyon iptal edildi.",
    en: "Your reservation has been cancelled.",
    ru: "Бронирование отменено.",
    el: "Η κράτηση ακυρώθηκε.",
  },
  cancelAlready: {
    tr: "Bu rezervasyon zaten iptal edilmiş.",
    en: "That reservation is already cancelled.",
    ru: "Эта бронь уже отменена.",
    el: "Η κράτηση είναι ήδη ακυρωμένη.",
  },
  cancelNotFound: {
    tr: "İptal edilecek rezervasyonu bulamadım.",
    en: "I couldn't find the reservation to cancel.",
    ru: "Не удалось найти бронь для отмены.",
    el: "Δεν βρήκα την κράτηση για ακύρωση.",
  },
  modifySelect: {
    tr: "Hangi rezervasyonu güncellemek istiyorsun?",
    en: "Which reservation do you want to update?",
    ru: "Какую бронь нужно изменить?",
    el: "Ποια κράτηση θέλεις να αλλάξεις;",
  },
  modifyNeedDateTime: {
    tr: "Yeni tarih ve saat nedir? (Örn: 14.03 20:00)",
    en: "What’s the new date and time? (e.g. 14.03 20:00)",
    ru: "Укажи новую дату и время (например: 14.03 20:00)",
    el: "Ποια είναι η νέα ημερομηνία και ώρα; (π.χ. 14.03 20:00)",
  },
  modifyNeedDate: {
    tr: "Yeni tarih nedir? (Örn: 14.03)",
    en: "What’s the new date? (e.g. 14.03)",
    ru: "Укажи новую дату (например: 14.03)",
    el: "Ποια είναι η νέα ημερομηνία; (π.χ. 14.03)",
  },
  modifyNeedTime: {
    tr: "Yeni saat nedir? (Örn: 20:00)",
    en: "What’s the new time? (e.g. 20:00)",
    ru: "Укажи новое время (например: 20:00)",
    el: "Ποια είναι η νέα ώρα; (π.χ. 20:00)",
  },
  modifyNoPartyForMenus: {
    tr: "Bu rezervasyonda sabit menü seçilmiş. Kişi sayısını asistanla değiştiremiyorum. Detay ekranından güncelleyebilirsin.",
    en: "This booking has fixed-menu selections. I can’t change party size here; please update it from the reservation details screen.",
    ru: "В этой брони есть фиксированное меню. Я не могу изменить количество гостей здесь — обновите в деталях брони.",
    el: "Αυτή η κράτηση έχει σταθερό μενού. Δεν μπορώ να αλλάξω τα άτομα εδώ — κάν’ το από την οθόνη λεπτομερειών.",
  },
  modifyNotAllowedPaid: {
    tr: "Bu rezervasyonun ödemesi tamamlanmış. Asistan üzerinden güncellenemiyor.",
    en: "This reservation is already paid and can’t be updated via the assistant.",
    ru: "Эта бронь уже оплачена и не может быть изменена через ассистента.",
    el: "Αυτή η κράτηση έχει πληρωθεί και δεν μπορεί να αλλάξει μέσω βοηθού.",
  },
  modifyOk: {
    tr: "Rezervasyon güncellendi.",
    en: "Reservation updated.",
    ru: "Бронирование обновлено.",
    el: "Η κράτηση ενημερώθηκε.",
  },
  modifyFail: {
    tr: "Güncelleme sırasında bir sorun oldu.",
    en: "Something went wrong while updating.",
    ru: "Ошибка при обновлении брони.",
    el: "Πρόβλημα κατά την ενημέρωση.",
  },
  deliveryNoOrders: {
    tr: "Paket servis siparişin görünmüyor.",
    en: "I couldn't find any delivery orders.",
    ru: "Не вижу доставок.",
    el: "Δεν βρέθηκαν παραγγελίες delivery.",
  },
  deliveryHeader: {
    tr: "Paket servis siparişlerin:",
    en: "Your delivery orders:",
    ru: "Ваши заказы доставки:",
    el: "Οι παραγγελίες delivery σου:",
  },
  deliveryChoose: {
    tr: "Hangi sipariş? Numarasını yazabilir veya aşağıdan seçebilirsin.",
    en: "Which order? Type the number or choose below.",
    ru: "Какой заказ? Напиши номер или выбери ниже.",
    el: "Ποια παραγγελία; Γράψε τον αριθμό ή διάλεξε παρακάτω.",
  },
  deliveryIssueAsk: {
    tr: "Sorunu kısaca yazar mısın? (Örn: eksik ürün / gecikme / yanlış sipariş)",
    en: "Please describe the issue briefly. (e.g., missing items / delay / wrong order)",
    ru: "Кратко опиши проблему (например: нет позиции / задержка / неверный заказ).",
    el: "Περιέγραψε σύντομα το πρόβλημα (π.χ. έλλειψη / καθυστέρηση / λάθος παραγγελία).",
  },
  deliveryIssueOk: {
    tr: "Şikayetin kaydedildi. Ekibimiz gerekirse seninle iletişime geçecek.",
    en: "Your complaint has been recorded. Our team will contact you if needed.",
    ru: "Жалоба зарегистрирована. При необходимости мы свяжемся с вами.",
    el: "Το παράπονο καταχωρήθηκε. Η ομάδα μας θα επικοινωνήσει αν χρειαστεί.",
  },
  reservationCreateNeedRestaurant: {
    tr: "Hangi restoranda rezervasyon yapmak istiyorsun? Adını yazabilir misin?",
    en: "Which restaurant would you like to book? Please type its name.",
    ru: "В каком ресторане хотите сделать бронь? Напишите название.",
    el: "Σε ποιο εστιατόριο θέλεις κράτηση; Γράψε το όνομα.",
  },
  reservationCreateNeedDateTime: {
    tr: "Hangi tarih ve saat? (Örn: 14.03 20:00)",
    en: "What date and time? (e.g., 14.03 20:00)",
    ru: "Какая дата и время? (например: 14.03 20:00)",
    el: "Ποια ημερομηνία και ώρα; (π.χ. 14.03 20:00)",
  },
  reservationCreateNeedPeople: {
    tr: "Kaç kişi için rezervasyon yapalım?",
    en: "How many people is the reservation for?",
    ru: "На сколько человек бронируем?",
    el: "Για πόσα άτομα να γίνει η κράτηση;",
  },
  reservationCreateMultiple: {
    tr: "Birden fazla restoran buldum. Lütfen numarasını yaz.",
    en: "I found multiple restaurants. Please type the number.",
    ru: "Нашёл несколько ресторанов. Напиши номер.",
    el: "Βρήκα περισσότερα από ένα εστιατόρια. Γράψε τον αριθμό.",
  },
  reservationCreateNotFound: {
    tr: "Bu isimle restoran bulamadım. Lütfen farklı bir isim yaz.",
    en: "I couldn't find a restaurant with that name. Please try another.",
    ru: "Не нашёл ресторан с таким названием. Попробуй другое.",
    el: "Δεν βρήκα εστιατόριο με αυτό το όνομα. Δοκίμασε άλλο.",
  },
  reservationCreateOk: {
    tr: "Rezervasyon oluşturuldu. Onay süreci için restoranın yanıtını bekleyeceğiz.",
    en: "Reservation created. We’ll wait for the restaurant’s confirmation.",
    ru: "Бронирование создано. Ждём подтверждения от ресторана.",
    el: "Η κράτηση δημιουργήθηκε. Περιμένουμε επιβεβαίωση από το εστιατόριο.",
  },
  reservationCreateFail: {
    tr: "Rezervasyon oluşturulamadı.",
    en: "I couldn't create the reservation.",
    ru: "Не удалось создать бронь.",
    el: "Δεν μπόρεσα να δημιουργήσω την κράτηση.",
  },
  searchSummary: {
    tr: "Şöyle anladım: {summary}.",
    en: "Here’s what I understood: {summary}.",
    ru: "Я понял так: {summary}.",
    el: "Κατάλαβα το εξής: {summary}.",
  },
  searchAskCity: {
    tr: "Hangi şehirde olsun?",
    en: "Which city should it be in?",
    ru: "В каком городе?",
    el: "Σε ποια πόλη;",
  },
  searchAskPeople: {
    tr: "Kaç kişi için?",
    en: "For how many people?",
    ru: "На сколько человек?",
    el: "Για πόσα άτομα;",
  },
  searchAskDate: {
    tr: "Hangi gün?",
    en: "Which day?",
    ru: "На какой день?",
    el: "Ποια μέρα;",
  },
  searchAskTime: {
    tr: "Hangi saat aralığında?",
    en: "What time range?",
    ru: "В какой промежуток времени?",
    el: "Σε ποιο χρονικό διάστημα;",
  },
  searchReady: {
    tr: "Uygun mekanları göstereyim.",
    en: "I'll show matching places.",
    ru: "Покажу подходящие места.",
    el: "Θα δείξω τα κατάλληλα μέρη.",
  },
};

function t(lang, key, vars) {
  const block = ACTION_TEXT[key] || {};
  let out = block[lang] || block[FALLBACK_LANG] || "";
  if (!vars) return out;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

function labelCancel(lang) {
  return (
    {
      tr: "İptal",
      en: "Cancel",
      ru: "Отменить",
      el: "Ακύρωση",
    }[lang] || "Cancel"
  );
}

function labelUpdate(lang) {
  return (
    {
      tr: "Güncelle",
      en: "Update",
      ru: "Изменить",
      el: "Ενημέρωση",
    }[lang] || "Update"
  );
}

const STATUS_LABELS = {
  tr: {
    pending: "Beklemede",
    confirmed: "Onaylı",
    arrived: "Giriş",
    no_show: "Gelmedi",
    cancelled: "İptal",
  },
  en: {
    pending: "Pending",
    confirmed: "Confirmed",
    arrived: "Arrived",
    no_show: "No show",
    cancelled: "Cancelled",
  },
  ru: {
    pending: "В ожидании",
    confirmed: "Подтверждено",
    arrived: "Прибыл",
    no_show: "Не пришёл",
    cancelled: "Отменено",
  },
  el: {
    pending: "Σε αναμονή",
    confirmed: "Επιβεβαιωμένο",
    arrived: "Παρουσία",
    no_show: "Δεν εμφανίστηκε",
    cancelled: "Ακυρωμένο",
  },
};

function statusLabel(lang, status) {
  const map = STATUS_LABELS[lang] || STATUS_LABELS[FALLBACK_LANG];
  return map?.[status] || status || "";
}

const ACTION_INTENTS = new Set([
  "reservation_help",
  "cancel_reservation",
  "modify_reservation",
  "make_reservation",
  "delivery_help",
  "delivery_issue",
]);

/**
 * KURAL TABANLI fallback cevap üretici
 * (LLM error / API key yoksa buraya düşeceğiz)
 */
function buildRuleBasedReply(intentResult, lang, message) {
  const { intent, confidence } = intentResult;
  const people = detectPeopleCount(message);

  const L = lang; // daha kısa yazmak için

  // Ortak bazı textler (TR/EN/RU/EL)
  const TEXT = {
    greeting: {
      tr: "Merhaba! Ben Rezvix Asistan. Mekan bulmana, rezervasyonlarını yönetmene ve uygulama ile ilgili sorularına yardımcı olabilirim.",
      en: "Hi! I’m the Rezvix Assistant. I can help you find venues, manage your reservations and answer questions about the app.",
      ru: "Привет! Я ассистент Rezvix. Помогу найти заведение, управлять бронями и отвечу на вопросы о приложении.",
      el: "Γεια σου! Είμαι ο βοηθός του Rezvix. Μπορώ να σε βοηθήσω να βρεις μαγαζιά, να διαχειριστείς κρατήσεις και να λύσω απορίες για την εφαρμογή."
    },
    findRestaurantAskFilters: {
      tr: people
        ? `Harika, ${people} kişi için bir yer bakalım. Hangi şehirde veya bölgede olsun istersin?`
        : "Sana uygun bir mekan bulmam için kaç kişi olduğunuzu ve hangi şehirde/bölgede yer aradığınızı söyleyebilir misin?",
      en: people
        ? `Great, let’s find a place for ${people} people. In which city or area?`
        : "To find a good place for you, can you tell me how many people you are and in which city/area you’re looking?",
      ru: people
        ? `Отлично, давай подберем место на ${people} человек. В каком городе или районе?`
        : "Чтобы подобрать место, скажи, пожалуйста, на сколько человек и в каком городе/районе ты ищешь.",
      el: people
        ? `Τέλεια, πάμε να βρούμε μέρος για ${people} άτομα. Σε ποια πόλη ή περιοχή;`
        : "Για να σου προτείνω κατάλληλο μαγαζί, πες μου πόσα άτομα είστε και σε ποια πόλη/περιοχή ψάχνεις;"
    },
    filterExplain: {
      tr: "Mekanları fiyat, şehir, kişi sayısı ve saat aralığına göre filtreleyebilirsin. Keşfet sayfasındaki filtre butonundan da aynı ayarları yapman mümkün.",
      en: "You can filter venues by price, city, group size and time range. You can also use the filter button on the Explore screen for the same options.",
      ru: "Ты можешь фильтровать заведения по цене, городу, размеру компании и времени. Те же настройки есть в кнопке фильтра на экране 'Обзор'.",
      el: "Μπορείς να φιλτράρεις τα μαγαζιά ανά τιμή, πόλη, αριθμό ατόμων και ώρες. Τα ίδια φίλτρα υπάρχουν και στο κουμπί 'Φίλτρα' στην οθόνη Εξερεύνηση."
    },
    reservationHelp: {
      tr: "Rezervasyonunla ilgili yardımcı olabilirim. Yeni rezervasyon yapmak, tarih/saat değiştirmek veya iptal etmek istiyorsan, lütfen hangi rezervasyon ya da hangi tarih için olduğunu yaz.",
      en: "I can help you with your reservation. If you want to create, change or cancel a booking, please tell me which reservation or for which date.",
      ru: "Я могу помочь с твоей бронью. Напиши, пожалуйста, о какой брони или на какую дату идёт речь — создать, изменить или отменить.",
      el: "Μπορώ να σε βοηθήσω με την κράτησή σου. Αν θέλεις να δημιουργήσεις, να αλλάξεις ή να ακυρώσεις μια κράτηση, γράψε μου για ποια ημερομηνία ή ποια κράτηση."
    },
    noShow: {
      tr: "No-show durumunda (rezervasyona gitmediğinde) mekanın kendi politikası geçerlidir. Rezvix, mekanın belirlediği iptal ve no-show şartlarını uygular. Detaylı politikayı rezervasyon özetinde görebilirsin.",
      en: "In case of a no-show, the venue’s own policy applies. Rezvix follows the venue’s cancellation and no-show rules. You can see the details in your reservation summary.",
      ru: "В случае неявки действует политика заведения. Rezvix следует правилам отмены и no-show, которые установлены самим рестораном. Подробности смотри в своём бронировании.",
      el: "Σε περίπτωση μη εμφάνισης (no-show), ισχύει η πολιτική του μαγαζιού. Το Rezvix ακολουθεί τους κανόνες ακύρωσης και no-show που ορίζει το κατάστημα. Δες τις λεπτομέρειες στην περίληψη της κράτησής σου."
    },
    payment: {
      tr: "Ödeme yöntemleri, seçtiğin mekana ve rezervasyon tipine göre değişebilir. Bazı mekanlar sadece kart, bazıları ise nakit veya havale/dekont ile çalışır. Rezervasyon adımlarında kabul edilen ödeme yöntemlerini görebilirsin.",
      en: "Payment methods depend on the venue and the reservation type. Some venues accept only card, others may allow cash or bank transfer/receipt upload. You’ll see available payment methods in the reservation steps.",
      ru: "Способы оплаты зависят от заведения и типа брони. Некоторые принимают только карту, другие могут позволять наличные или банковский перевод с квитанцией. Доступные способы оплаты видны в шагах бронирования.",
      el: "Οι τρόποι πληρωμής εξαρτώνται από το μαγαζί και το είδος της κράτησης. Κάποια δέχονται μόνο κάρτα, άλλα δέχονται μετρητά ή έμβασμα/ανέβασμα αποδεικτικού. Θα δεις τις διαθέσιμες επιλογές στα βήματα της κράτησης."
    },
    faq: {
      tr: "Rezvix, mekanlara güvenli ve şeffaf rezervasyon sistemi sunar. Kullanıcılar kolayca mekan keşfedip depozitolu veya normal rezervasyon yapabilir, işletmeler de doluluklarını daha iyi yönetir. Verilerin güvenli olarak saklanır ve sadece gerekli bilgiler mekanla paylaşılır.",
      en: "Rezvix offers venues a safe and transparent reservation system. Guests can discover places and make normal or deposit-based reservations, while venues manage capacity more efficiently. Your data is stored securely and only necessary info is shared with the venue.",
      ru: "Rezvix — это безопасная и прозрачная система бронирования. Гости находят заведения и делают обычные или депозитные брони, а рестораны лучше управляют заполняемостью. Данные хранятся безопасно, и заведению передаётся только необходимая информация.",
      el: "Το Rezvix προσφέρει στα μαγαζιά ένα ασφαλές και διαφανές σύστημα κρατήσεων. Οι πελάτες βρίσκουν εύκολα νέα μέρη και κάνουν απλές ή με προκαταβολή κρατήσεις, ενώ τα μαγαζιά διαχειρίζονται καλύτερα τη διαθεσιμότητα. Τα δεδομένα σου φυλάσσονται με ασφάλεια και μοιραζόμαστε μόνο ό,τι χρειάζεται με το κατάστημα."
    },
    complaint: {
      tr: "Yaşadığın sorun için üzgünüm. Lütfen kısaca ne yaşadığını, hangi mekanda ve mümkünse hangi rezervasyon ile ilgili olduğunu yaz. Gerekirse ekibimiz seninle iletişime geçsin diye iletişim bilgilerini de ekleyebilirsin.",
      en: "I’m sorry you had a problem. Please describe briefly what happened, at which venue and, if possible, which reservation it’s about. You can also add contact details so our team can follow up if needed.",
      ru: "Сожалею, что возникла проблема. Опиши, пожалуйста, что случилось, в каком заведении и, если возможно, по какой брони. Можешь добавить контактные данные, чтобы команда могла связаться с тобой при необходимости.",
      el: "Λυπάμαι που αντιμετώπισες πρόβλημα. Γράψε μου σύντομα τι έγινε, σε ποιο μαγαζί και, αν γίνεται, για ποια κράτηση. Μπορείς επίσης να αφήσεις στοιχεία επικοινωνίας για να σε βοηθήσει η ομάδα μας."
    },
    fallback: {
      tr: "Tam olarak ne yapmak istediğini anlayamadım. Sana mekan mı bulayım, mevcut rezervasyonlarınla mı ilgilenelim yoksa Rezvix hakkında genel bilgi mi istersin?",
      en: "I’m not sure I understood what you want. Should I help you find a place, check your reservations, or give you general info about Rezvix?",
      ru: "Я не до конца понял, что ты хочешь сделать. Помочь найти заведение, разобраться с бронями или рассказать подробнее о Rezvix?",
      el: "Δεν είμαι σίγουρος ότι κατάλαβα τι θέλεις να κάνεις. Να σε βοηθήσω να βρεις μαγαζί, να δούμε τις κρατήσεις σου ή θέλεις γενικές πληροφορίες για το Rezvix;"
    },
    goodbye: {
      tr: "Görüşürüz! İstediğinde tekrar yazabilirsin.",
      en: "See you! You can message me again anytime.",
      ru: "До встречи! Пиши, когда понадобится помощь.",
      el: "Τα λέμε! Μπορείς να μου γράψεις ξανά όποτε θέλεις."
    }
  };

  const t = (key) => {
    const block = TEXT[key];
    if (!block) return "";
    return block[L] || block[FALLBACK_LANG];
  };

  let reply = "";
  let suggestions = [];

  switch (intent) {
    case "greeting":
      reply = t("greeting");
      suggestions =
        L === "tr"
          ? [
              { label: "Mekan bul", message: "Mekan bulmak istiyorum" },
              { label: "Rezervasyonlarım", message: "Rezervasyonlarıma bak" },
              { label: "Rezvix nedir?", message: "Rezvix nasıl çalışıyor" }
            ]
          : [];
      break;

    case "find_restaurant":
      reply = TEXT.findRestaurantAskFilters[L] || TEXT.findRestaurantAskFilters[FALLBACK_LANG];
      suggestions =
        L === "tr"
          ? [
              { label: "Lefkoşa", message: "Lefkoşa'da mekan bakıyorum" },
              { label: "Girne", message: "Girne'de mekan bakıyorum" },
              { label: "Gazimağusa", message: "Gazimağusa'da mekan bakıyorum" }
            ]
          : [];
      break;

    case "filter_restaurant":
      reply = TEXT.filterExplain[L] || TEXT.filterExplain[FALLBACK_LANG];
      break;

    case "reservation_help":
    case "modify_reservation":
      reply = TEXT.reservationHelp[L] || TEXT.reservationHelp[FALLBACK_LANG];
      break;

    case "cancel_reservation":
      reply =
        L === "tr"
          ? "Rezervasyon iptali için, rezervasyon detay ekranına girip 'İptal et' adımlarını izleyebilirsin. Eğer belirli bir rezervasyonu tarif edersen, sana hangi ekrana gitmen gerektiğini de söyleyebilirim."
          : L === "en"
          ? "To cancel a reservation, open the reservation details screen and follow the 'Cancel' steps. If you tell me which booking, I can guide you to the right screen."
          : L === "ru"
          ? "Чтобы отменить бронь, открой экран деталей бронирования и нажми 'Отменить'. Если скажешь, какую именно бронь, я подскажу нужный экран."
          : "Για ακύρωση κράτησης άνοιξε την οθόνη λεπτομερειών και πάτησε 'Ακύρωση'. Αν μου πεις ποια κράτηση είναι, μπορώ να σε καθοδηγήσω.";
      break;

    case "no_show_policy":
      reply = TEXT.noShow[L] || TEXT.noShow[FALLBACK_LANG];
      break;

    case "payment_info":
      reply = TEXT.payment[L] || TEXT.payment[FALLBACK_LANG];
      break;

    case "faq":
      reply = TEXT.faq[L] || TEXT.faq[FALLBACK_LANG];
      break;

    case "complaint":
      reply = TEXT.complaint[L] || TEXT.complaint[FALLBACK_LANG];
      break;

    case "smalltalk":
      reply =
        L === "tr"
          ? "İyiyim, teşekkür ederim. Senin için mekan bulmak veya rezervasyonlarında yardımcı olmak için buradayım. 😊"
          : L === "en"
          ? "I’m good, thanks! I’m here to help you find venues or manage your bookings. 😊"
          : L === "ru"
          ? "У меня всё хорошо, спасибо! Я здесь, чтобы помочь с заведениями и бронями. 😊"
          : "Είμαι καλά, ευχαριστώ! Είμαι εδώ για να σε βοηθήσω με μαγαζιά και κρατήσεις. 😊";
      break;

    case "goodbye":
      reply = TEXT.goodbye[L] || TEXT.goodbye[FALLBACK_LANG];
      break;

    default:
      // fallback veya düşük güven
      reply = TEXT.fallback[L] || TEXT.fallback[FALLBACK_LANG];
      suggestions =
        L === "tr"
          ? [
              { label: "Mekan bul", message: "Mekan bulmak istiyorum" },
              { label: "Rezervasyonlarım", message: "Rezervasyonlarıma bakmak istiyorum" },
              { label: "Ödeme / depozito", message: "Ödeme ve depozito hakkında bilgi" }
            ]
          : [];
      break;
  }

  return { reply, suggestions, confidence };
}

async function fetchUserReservations(userId, limit = 6) {
  const docs = await Reservation.find({
    userId,
    ...STRIPE_VISIBILITY_FILTER,
  })
    .populate("restaurantId", "_id name")
    .sort({ dateTimeUTC: -1 })
    .limit(12)
    .lean();

  const now = Date.now();
  const upcoming = [];
  const past = [];

  for (const r of docs) {
    const ts = new Date(r.dateTimeUTC || r.createdAt).getTime();
    if (ts >= now && r.status !== "cancelled") upcoming.push(r);
    else past.push(r);
  }

  upcoming.sort((a, b) => new Date(a.dateTimeUTC) - new Date(b.dateTimeUTC));
  past.sort((a, b) => new Date(b.dateTimeUTC) - new Date(a.dateTimeUTC));

  const list = [...upcoming, ...past].slice(0, limit);
  return list.map((r) => ({
    _id: r._id.toString(),
    restaurantName: r.restaurantId?.name || "Restoran",
    dateTimeUTC: r.dateTimeUTC,
    partySize: r.partySize,
    status: r.status,
    depositStatus: r.depositStatus || "pending",
    selectionsCount: Array.isArray(r.selections) ? r.selections.length : 0,
  }));
}

async function fetchUserDeliveryOrders(userId, limit = 6) {
  const docs = await DeliveryOrder.find({ userId })
    .populate("restaurantId", "_id name")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return docs.map((o) => ({
    _id: o._id.toString(),
    restaurantName: o.restaurantId?.name || "Restoran",
    restaurantId: o.restaurantId?._id ? o.restaurantId._id.toString() : undefined,
    status: o.status,
    total: o.total,
    createdAt: o.createdAt,
    shortCode: o.shortCode || "",
  }));
}

function escapeRegExp(input) {
  return String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchRestaurantsByName(query, limit = 5) {
  const q = String(query || "").trim();
  if (!q) return [];
  const re = new RegExp(escapeRegExp(q), "i");
  const rows = await Restaurant.find({ name: re, isActive: true })
    .limit(limit)
    .select("_id name")
    .lean();
  return rows.map((r) => ({ _id: r._id.toString(), name: r.name || "" }));
}

function buildRestaurantChoiceReply(lang, list) {
  const lines = list.map((r, i) => `${i + 1}) ${r.name}`);
  return [t(lang, "reservationCreateMultiple"), ...lines].join("\n");
}

function extractRestaurantQuery(message, lang) {
  let text = normalizeText(message);
  const stopWords = {
    tr: [
      "rezervasyon",
      "restoran",
      "mekan",
      "mekân",
      "masa",
      "yer",
      "ayır",
      "yap",
      "istiyorum",
      "lütfen",
    ],
    en: ["reservation", "restaurant", "book", "table", "place", "please"],
    ru: ["бронь", "ресторан", "стол", "место", "пожалуйста"],
    el: ["κράτηση", "εστιατόριο", "τραπέζι", "παρακαλώ"],
  };
  const list = stopWords[lang] || [];
  for (const w of list) {
    const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, "gi");
    text = text.replace(re, " ");
  }
  text = text.replace(/\s+/g, " ").trim();
  return text.length >= 3 ? text : null;
}

function buildReservationListReply(lang, list) {
  const lines = list.map((r, i) => {
    const dt = formatDateTimeShort(r.dateTimeUTC);
    const status = r.status ? ` • ${statusLabel(lang, r.status)}` : "";
    return `${i + 1}) ${dt} • ${r.restaurantName}${status}`;
  });
  const reply = [t(lang, "reservationsHeader"), ...lines, "", t(lang, "chooseReservation")]
    .filter(Boolean)
    .join("\n");
  return reply;
}

function buildDeliveryListReply(lang, list) {
  const lines = list.map((o, i) => {
    const dt = formatDateTimeShort(o.createdAt);
    const code = o.shortCode ? ` • ${o.shortCode}` : "";
    return `${i + 1}) ${dt} • ${o.restaurantName}${code} • ${o.status}`;
  });
  const reply = [t(lang, "deliveryHeader"), ...lines, "", t(lang, "deliveryChoose")]
    .filter(Boolean)
    .join("\n");
  return reply;
}

function pickItemByIndex(message, items) {
  const text = String(message || "").trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const idx = Number(text);
  if (!Number.isFinite(idx) || idx < 1 || idx > items.length) return null;
  return items[idx - 1];
}

function buildSearchSuggestions(lang, missing) {
  const sug = [];
  if (missing.includes("city")) {
    const cities =
      lang === "en"
        ? ["Nicosia", "Kyrenia", "Famagusta"]
        : lang === "ru"
        ? ["Никосия", "Кирения", "Фамагуста"]
        : lang === "el"
        ? ["Λευκωσία", "Κερύνεια", "Αμμόχωστος"]
        : ["Lefkoşa", "Girne", "Gazimağusa"];
    cities.forEach((c) => sug.push({ label: c, message: c }));
  }
  if (missing.includes("people")) {
    const items =
      lang === "ru"
        ? ["2 человека", "4 человека", "6 человек"]
        : lang === "el"
        ? ["2 άτομα", "4 άτομα", "6 άτομα"]
        : lang === "en"
        ? ["2 people", "4 people", "6 people"]
        : ["2 kişi", "4 kişi", "6 kişi"];
    items.forEach((c) => sug.push({ label: c, message: c }));
  }
  if (missing.includes("date")) {
    const items =
      lang === "en"
        ? ["Today", "Tomorrow", "This weekend"]
        : lang === "ru"
        ? ["Сегодня", "Завтра", "В выходные"]
        : lang === "el"
        ? ["Σήμερα", "Αύριο", "Το ΣΚ"]
        : ["Bugün", "Yarın", "Hafta sonu"];
    items.forEach((c) => sug.push({ label: c, message: c }));
  }
  if (missing.includes("time")) {
    const items = ["19:00", "20:00", "21:00–23:00"];
    items.forEach((c) => sug.push({ label: c, message: c }));
  }
  return sug.slice(0, 3);
}

function buildSearchCommand(search) {
  const parts = [];
  if (search.city) parts.push(`city=${search.city}`);
  if (search.people) parts.push(`people=${search.people}`);
  if (search.dateQuery) parts.push(`date=${search.dateQuery}`);
  if (search.timeRange) parts.push(`timerange=${search.timeRange}`);
  if (search.budget) parts.push(`budget=${search.budget}`);
  if (search.style) parts.push(`style=${search.style}`);
  if (!parts.length) return null;
  return `@search ${parts.join(";")}`;
}

function buildSearchReply(lang, search) {
  const missing = [];
  if (!search.city) missing.push("city");
  if (!search.people) missing.push("people");
  if (!search.date) missing.push("date");
  if (!search.timeRange) missing.push("time");

  const summaryParts = [];
  if (search.city) summaryParts.push(search.city);
  if (search.people) {
    const label =
      lang === "ru"
        ? `${search.people} чел.`
        : lang === "el"
        ? `${search.people} άτομα`
        : lang === "en"
        ? `${search.people} people`
        : `${search.people} kişi`;
    summaryParts.push(label);
  }
  if (search.dateLabel) summaryParts.push(search.dateLabel);
  if (search.timeLabel) summaryParts.push(search.timeLabel);

  const summary = summaryParts.join(" • ");
  const replyParts = [];
  if (summary) replyParts.push(t(lang, "searchSummary", { summary }));

  if (missing.length) {
    const ask = missing[0];
    if (ask === "city") replyParts.push(t(lang, "searchAskCity"));
    else if (ask === "people") replyParts.push(t(lang, "searchAskPeople"));
    else if (ask === "date") replyParts.push(t(lang, "searchAskDate"));
    else if (ask === "time") replyParts.push(t(lang, "searchAskTime"));
    return {
      reply: replyParts.join(" "),
      suggestions: buildSearchSuggestions(lang, missing),
      done: false,
    };
  }

  replyParts.push(t(lang, "searchReady"));
  const cmd = buildSearchCommand(search);
  const suggestions = cmd
    ? [
        {
          label:
            lang === "ru"
              ? "Показать места"
              : lang === "el"
              ? "Δείξε μέρη"
              : lang === "en"
              ? "Show places"
              : "Mekanları göster",
          message: cmd,
        },
      ]
    : [];
  return { reply: replyParts.join(" "), suggestions, done: true };
}

function updateSearchMemory(prev, message, lang) {
  const next = { ...(prev || {}) };

  const city = parseCityFromMessage(message);
  if (city) next.city = city;

  const people = detectPeopleCount(message);
  if (people) next.people = people;

  const dateInfo = parseDateWithLabel(message, lang);
  if (dateInfo?.date) {
    next.date = dateInfo.date;
    next.dateLabel = dateInfo.label;
    next.dateQuery = dateInfo.label || dayjs(dateInfo.date).format("YYYY-MM-DD");
  }

  const range = parseTimeRangeFromMessage(message);
  if (range) {
    next.timeRange = range;
    next.timeLabel = range.replace("-", "–");
  } else {
    const time = parseTimeFromMessage(message);
    if (time) {
      next.timeRange = time;
      next.timeLabel = time;
    }
  }

  const budget = parseBudgetFromMessage(message, lang);
  if (budget) next.budget = budget;

  const style = parseStyleFromMessage(message, lang);
  if (style) next.style = style;

  next.active = true;
  next.updatedAt = new Date();
  return next;
}

function matchReservationFromMessage(message, list, lang, pendingOptions) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const msg = normalizeText(message);

  const idMatch = msg.match(/\b[0-9a-f]{24}\b/);
  if (idMatch) {
    return list.find((r) => r._id === idMatch[0]) || null;
  }

  if (pendingOptions && Array.isArray(pendingOptions)) {
    const byIndex = pickItemByIndex(message, list);
    if (byIndex && pendingOptions.includes(byIndex._id)) return byIndex;
  } else {
    const byIndex = pickItemByIndex(message, list);
    if (byIndex) return byIndex;
  }

  const time = parseTimeFromMessage(msg);
  const date = parseDateFromMessage(msg, lang);
  if (time || date) {
    const picked = list.find((r) => {
      const dt = dayjs(r.dateTimeUTC);
      if (date && !dt.isSame(dayjs(date), "day")) return false;
      if (time) {
        const tStr = `${String(dt.hour()).padStart(2, "0")}:${String(dt.minute()).padStart(2, "0")}`;
        if (tStr !== time) return false;
      }
      return true;
    });
    if (picked) return picked;
  }

  for (const r of list) {
    const name = normalizeText(r.restaurantName);
    if (name && msg.includes(name)) return r;
  }

  return null;
}

function matchDeliveryFromMessage(message, list, pendingOptions) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const msg = normalizeText(message);

  const idMatch = msg.match(/\b[0-9a-f]{24}\b/);
  if (idMatch) {
    return list.find((o) => o._id === idMatch[0]) || null;
  }

  if (pendingOptions && Array.isArray(pendingOptions)) {
    const byIndex = pickItemByIndex(message, list);
    if (byIndex && pendingOptions.includes(byIndex._id)) return byIndex;
  } else {
    const byIndex = pickItemByIndex(message, list);
    if (byIndex) return byIndex;
  }

  for (const o of list) {
    const name = normalizeText(o.restaurantName);
    if (name && msg.includes(name)) return o;
  }

  return null;
}

function computeDeposit(restaurant, totalPrice) {
  const flat = Number(
    restaurant?.depositAmount ??
      restaurant?.settings?.depositAmount ??
      0
  ) || 0;
  if (flat > 0) return flat;

  const cfg = {
    type:
      restaurant?.depositType ||
      restaurant?.settings?.depositType ||
      (restaurant?.depositRate ??
      restaurant?.depositPercent ??
      restaurant?.settings?.depositRate ??
      restaurant?.settings?.depositPercent
        ? "percent"
        : "none"),
    ratePercent:
      Number(
        restaurant?.depositRate ??
          restaurant?.depositPercent ??
          restaurant?.settings?.depositRate ??
          restaurant?.settings?.depositPercent ??
          0
      ) || 0,
    minAmount:
      Number(
        restaurant?.depositMin ??
          restaurant?.settings?.depositMin ??
          0
      ) || 0,
  };

  let depositAmount = 0;

  if (cfg.type === "percent" && cfg.ratePercent > 0) {
    depositAmount = Math.round((totalPrice * cfg.ratePercent) / 100);
  }

  if (depositAmount === 0 && cfg.ratePercent === 0) {
    depositAmount = Math.round(totalPrice * 0.2);
  }

  if (cfg.minAmount > 0) depositAmount = Math.max(depositAmount, cfg.minAmount);
  if (!Number.isFinite(depositAmount) || depositAmount < 0) depositAmount = 0;
  if (depositAmount > totalPrice && totalPrice > 0) depositAmount = totalPrice;

  return depositAmount;
}

async function cancelReservationForUser(userId, rid) {
  const r = await Reservation.findById(rid).populate("restaurantId");
  if (!r) throw { status: 404, code: "not_found" };
  if (String(r.userId) !== String(userId)) throw { status: 403, code: "forbidden" };
  if (r.status === "cancelled") return { status: "already" };

  r.status = "cancelled";
  r.cancelledAt = new Date();
  await r.save();

  try {
    const diffMs = new Date(r.dateTimeUTC) - Date.now();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 2 && diffHours > -24) {
      await addIncident({
        userId: r.userId,
        type: "LATE_CANCEL",
        reservationId: r._id.toString(),
      });
    }
  } catch {}

  try {
    await notifyRestaurantOwner(r.restaurantId?._id || r.restaurantId, {
      i18n: { key: "reservation_cancelled", vars: { dateTime: r.dateTimeUTC } },
      data: { type: "reservation_cancelled", rid: String(r._id), section: "reservations" },
      key: `rest:cancelled:${r._id}`,
      type: "reservation_cancelled",
    });
  } catch {}

  return { status: "ok" };
}

async function updateReservationForUser({ userId, rid, dateObj, timeStr, partySize }) {
  const r = await Reservation.findById(rid).populate("restaurantId");
  if (!r) throw { status: 404, code: "not_found" };
  if (String(r.userId) !== String(userId)) throw { status: 403, code: "forbidden" };

  if (r.status === "cancelled" || r.status === "no_show") {
    throw { status: 400, code: "not_allowed" };
  }

  if ((r.depositStatus || "pending") === "paid") {
    throw { status: 400, code: "paid" };
  }

  const hasSelections = Array.isArray(r.selections) && r.selections.length > 0;
  if (partySize && hasSelections) {
    throw { status: 400, code: "has_selections" };
  }

  const restaurant = r.restaurantId && typeof r.restaurantId === "object" ? r.restaurantId : null;

  let nextDate = r.dateTimeUTC;
  if (dateObj || timeStr) {
    const baseDate = dateObj || r.dateTimeUTC;
    const combined = combineDateAndTime(baseDate, timeStr || formatDateTimeShort(r.dateTimeUTC).slice(11));
    if (!combined || Number.isNaN(new Date(combined).getTime())) {
      throw { status: 400, code: "invalid_datetime" };
    }

    const minLeadMin =
      Number(
        restaurant?.settings?.minAdvanceMinutes ??
          restaurant?.minAdvanceMinutes ??
          0
      ) || 0;
    const now = new Date();
    const earliestAllowed = new Date(now.getTime() + minLeadMin * 60 * 1000);
    if (new Date(combined).getTime() <= earliestAllowed.getTime()) {
      throw { status: 400, code: "too_soon" };
    }
    nextDate = combined;
  }

  let nextParty = r.partySize;
  let totalPrice = r.totalPrice;
  let depositAmount = r.depositAmount;

  if (partySize && Number(partySize) > 0) {
    nextParty = Number(partySize);
    if (!hasSelections) {
      const avgBase = await computeAvgSpendBaseForRestaurant(r.restaurantId?._id || r.restaurantId);
      totalPrice = Math.round(avgBase) * nextParty;
      depositAmount = computeDeposit(restaurant, totalPrice);
    }
  }

  r.dateTimeUTC = nextDate;
  r.partySize = nextParty;
  r.totalPrice = totalPrice;
  r.depositAmount = depositAmount;
  await r.save();

  try {
    await notifyUser(r.userId, {
      i18n: { key: "reservation_updated", vars: { dateTime: r.dateTimeUTC } },
      data: { type: "reservation_updated", rid: String(r._id), section: "reservation" },
      key: `cust:updated:${r._id}`,
      type: "reservation_updated",
    });
  } catch {}

  try {
    await notifyRestaurantOwner(r.restaurantId?._id || r.restaurantId, {
      i18n: { key: "reservation_updated_restaurant", vars: { dateTime: r.dateTimeUTC, partySize: r.partySize } },
      data: { type: "reservation_updated_restaurant", rid: String(r._id), section: "reservations" },
      key: `rest:updated:${r._id}`,
      type: "reservation_updated_restaurant",
    });
  } catch {}

  return r;
}

async function createReservationForUser({ userId, restaurantId, dateObj, timeStr, partySize }) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) throw { status: 404, code: "restaurant_not_found" };

  const dateTime = combineDateAndTime(dateObj, timeStr);
  if (!dateTime) throw { status: 400, code: "invalid_datetime" };

  const dt = new Date(dateTime);
  if (Number.isNaN(dt.getTime())) throw { status: 400, code: "invalid_datetime" };

  const minLeadMin =
    Number(
      restaurant?.settings?.minAdvanceMinutes ??
        restaurant?.minAdvanceMinutes ??
        0
    ) || 0;
  const now = new Date();
  const earliestAllowed = new Date(now.getTime() + minLeadMin * 60 * 1000);
  if (dt.getTime() <= earliestAllowed.getTime()) {
    throw { status: 400, code: "too_soon" };
  }

  const ps = Number(partySize) || 0;
  if (ps <= 0) throw { status: 400, code: "invalid_party" };

  const avgBase = await computeAvgSpendBaseForRestaurant(restaurantId);
  const totalPrice = Math.round(avgBase) * ps;
  const depositAmount = computeDeposit(restaurant, totalPrice);

  const r = await Reservation.create({
    restaurantId,
    userId,
    dateTimeUTC: dt,
    partySize: ps,
    totalPrice,
    depositAmount,
    status: "pending",
    paymentProvider: null,
    paymentIntentId: null,
    depositPaid: false,
    depositStatus: "pending",
    paidCurrency: null,
    paidAmount: 0,
  });

  return r;
}
/**
 * Ana controller
 * POST /api/assistant/message
 * body: { message: string, language?: "tr" | "en" | "ru" | "el" }
 */
export async function handleAssistantMessage(req, res) {
  try {
    const { message, language, sessionId } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        message: "message_required",
      });
    }

    const lang = resolveLang(
      language || req.user?.preferredLanguage || req.headers["accept-language"]
    );

    const userId = req.user?.id || null;
    const thread = await getAssistantThread({
      userId,
      sessionId: sessionId || req.headers["x-assistant-session"],
      language: lang,
    });

    if (thread) appendThreadMessage(thread, "user", message);

    let memory =
      thread?.memory && typeof thread.memory === "object"
        ? { ...thread.memory }
        : {};

    if (memory.pending && isPendingExpired(memory.pending)) {
      memory.pending = null;
    }

    const history = getThreadHistory(thread, 8);

    const finalize = async ({
      reply,
      suggestions = [],
      intent,
      confidence,
      matchedExample,
      provider,
      usedLlm,
      memoryPatch,
    }) => {
      if (thread) {
        if (memoryPatch) memory = { ...memory, ...memoryPatch };
        thread.memory = memory;
        appendThreadMessage(thread, "assistant", reply);
        await thread.save();
      }

      return res.json({
        ok: true,
        intent: intent || "assistant_action",
        confidence: confidence ?? 1,
        matchedExample,
        reply,
        suggestions,
        provider: provider || null,
        usedLlm: !!usedLlm,
      });
    };

    const command = parseCommand(message);

    if (command) {
      const { cmd, params } = command;

      if (!userId && !["help", "greeting", "search"].includes(cmd)) {
        return finalize({ reply: t(lang, "loginRequired") });
      }

      if (cmd === "reservations" || cmd === "list_reservations") {
        const list = await fetchUserReservations(userId);
        if (!list.length) return finalize({ reply: t(lang, "noReservations") });
        const reply = buildReservationListReply(lang, list);
        return finalize({
          reply,
          suggestions: list.slice(0, 2).flatMap((r, idx) => [
            { label: `#${idx + 1} • ${labelCancel(lang)}`, message: `@cancel rid=${r._id}` },
            { label: `#${idx + 1} • ${labelUpdate(lang)}`, message: `@modify rid=${r._id}` },
          ]),
          memoryPatch: { lastReservations: list },
        });
      }

      if (cmd === "cancel" || cmd === "cancel_reservation") {
        const list =
          memory.lastReservations || (userId ? await fetchUserReservations(userId) : []);
        const rid = params.rid || params.id;
        let target = rid ? list.find((r) => r._id === rid) : null;
        if (!target) {
          target = matchReservationFromMessage(message, list, lang, memory.pending?.options);
        }
        if (!target) {
          if (!list.length) return finalize({ reply: t(lang, "noReservations") });
          return finalize({
            reply: t(lang, "chooseReservation"),
            memoryPatch: {
              lastReservations: list,
              pending: { type: "cancel_select", options: list.map((r) => r._id), at: new Date() },
            },
          });
        }
        const result = await cancelReservationForUser(userId, target._id);
        if (result.status === "already") return finalize({ reply: t(lang, "cancelAlready") });
        return finalize({
          reply: t(lang, "cancelOk"),
          memoryPatch: { pending: null },
        });
      }

      if (cmd === "modify" || cmd === "modify_reservation" || cmd === "update") {
        const list =
          memory.lastReservations || (userId ? await fetchUserReservations(userId) : []);
        const rid = params.rid || params.id;
        let target = rid ? list.find((r) => r._id === rid) : null;
        if (!target) {
          target = matchReservationFromMessage(message, list, lang, memory.pending?.options);
        }
        if (!target) {
          if (!list.length) return finalize({ reply: t(lang, "noReservations") });
          return finalize({
            reply: t(lang, "modifySelect"),
            memoryPatch: {
              lastReservations: list,
              pending: { type: "modify_select", options: list.map((r) => r._id), at: new Date() },
            },
          });
        }

        const dateObj = params.date ? parseDateFromMessage(params.date, lang) : null;
        const timeStr = params.time || params.hour || params.clock || null;
        const people = params.people ? Number(params.people) : null;

        if (!dateObj && !timeStr && !people) {
          return finalize({
            reply: t(lang, "modifyNeedDateTime"),
            memoryPatch: { pending: { type: "modify_details", rid: target._id, at: new Date() } },
          });
        }

        try {
          await updateReservationForUser({
            userId,
            rid: target._id,
            dateObj,
            timeStr,
            partySize: people,
          });
          return finalize({ reply: t(lang, "modifyOk"), memoryPatch: { pending: null } });
        } catch (e) {
          if (e?.code === "has_selections") {
            return finalize({ reply: t(lang, "modifyNoPartyForMenus"), memoryPatch: { pending: null } });
          }
          if (e?.code === "paid") {
            return finalize({ reply: t(lang, "modifyNotAllowedPaid"), memoryPatch: { pending: null } });
          }
          return finalize({ reply: t(lang, "modifyFail"), memoryPatch: { pending: null } });
        }
      }

      if (cmd === "book" || cmd === "create_reservation" || cmd === "reserve") {
        const rid = params.restaurantid || params.rid || params.id;
        const dateObj = params.date ? parseDateFromMessage(params.date, lang) : null;
        const timeStr = params.time || params.hour || null;
        const people = params.people ? Number(params.people) : null;

        if (!rid) {
          return finalize({
            reply: t(lang, "reservationCreateNeedRestaurant"),
            memoryPatch: {
              pending: {
                type: "create_details",
                dateObj,
                timeStr,
                people,
                at: new Date(),
              },
            },
          });
        }

        if (!dateObj || !timeStr) {
          return finalize({
            reply: t(lang, "reservationCreateNeedDateTime"),
            memoryPatch: {
              pending: {
                type: "create_details",
                restaurantId: rid,
                dateObj,
                timeStr,
                people,
                at: new Date(),
              },
            },
          });
        }

        if (!people) {
          return finalize({
            reply: t(lang, "reservationCreateNeedPeople"),
            memoryPatch: {
              pending: {
                type: "create_details",
                restaurantId: rid,
                dateObj,
                timeStr,
                people,
                at: new Date(),
              },
            },
          });
        }

        try {
          await createReservationForUser({
            userId,
            restaurantId: rid,
            dateObj,
            timeStr,
            partySize: people,
          });
          return finalize({ reply: t(lang, "reservationCreateOk"), memoryPatch: { pending: null } });
        } catch (e) {
          return finalize({ reply: t(lang, "reservationCreateFail"), memoryPatch: { pending: null } });
        }
      }

      if (cmd === "delivery_orders" || cmd === "delivery_list") {
        const list = await fetchUserDeliveryOrders(userId);
        if (!list.length) return finalize({ reply: t(lang, "deliveryNoOrders") });
        const reply = buildDeliveryListReply(lang, list);
        return finalize({
          reply,
          memoryPatch: {
            lastDeliveryOrders: list,
            pending: { type: "delivery_select", options: list.map((o) => o._id), at: new Date() },
          },
        });
      }

      if (cmd === "delivery_issue") {
        const list =
          memory.lastDeliveryOrders || (userId ? await fetchUserDeliveryOrders(userId) : []);
        const oid = params.order || params.orderid || params.id;
        let target = oid ? list.find((o) => o._id === oid) : null;
        if (!target) {
          target = matchDeliveryFromMessage(message, list, memory.pending?.options);
        }
        if (!target) {
          if (!list.length) return finalize({ reply: t(lang, "deliveryNoOrders") });
          return finalize({
            reply: t(lang, "deliveryChoose"),
            memoryPatch: {
              lastDeliveryOrders: list,
              pending: { type: "delivery_select", options: list.map((o) => o._id), at: new Date() },
            },
          });
        }

        const issueText = params.text || params.issue || "";
        if (!issueText) {
          return finalize({
            reply: t(lang, "deliveryIssueAsk"),
            memoryPatch: { pending: { type: "delivery_details", orderId: target._id, at: new Date() } },
          });
        }

        try {
          const fullText = issueText
            ? `${issueText}\nOrderId: ${target._id}`
            : `OrderId: ${target._id}`;
          await Complaint.create({
            restaurantId: target.restaurantId,
            userId,
            subject: "Delivery issue",
            text: fullText,
          });
          return finalize({ reply: t(lang, "deliveryIssueOk"), memoryPatch: { pending: null } });
        } catch {
          return finalize({ reply: t(lang, "deliveryIssueOk"), memoryPatch: { pending: null } });
        }
      }
    }

    // Pending flow handling
    if (memory.pending?.type === "cancel_select") {
      const list = memory.lastReservations || (userId ? await fetchUserReservations(userId) : []);
      const picked = matchReservationFromMessage(message, list, lang, memory.pending.options);
      if (!picked) {
        return finalize({ reply: t(lang, "chooseReservation") });
      }
      const result = await cancelReservationForUser(userId, picked._id);
      if (result.status === "already") return finalize({ reply: t(lang, "cancelAlready"), memoryPatch: { pending: null } });
      return finalize({ reply: t(lang, "cancelOk"), memoryPatch: { pending: null } });
    }

    if (memory.pending?.type === "modify_select") {
      const list = memory.lastReservations || (userId ? await fetchUserReservations(userId) : []);
      const picked = matchReservationFromMessage(message, list, lang, memory.pending.options);
      if (!picked) {
        return finalize({ reply: t(lang, "modifySelect") });
      }
      return finalize({
        reply: t(lang, "modifyNeedDateTime"),
        memoryPatch: { pending: { type: "modify_details", rid: picked._id, at: new Date() } },
      });
    }

    if (memory.pending?.type === "modify_details") {
      const dateObj = parseDateFromMessage(message, lang) || memory.pending.dateObj || null;
      const timeStr = parseTimeFromMessage(message) || memory.pending.timeStr || null;
      const people = detectPeopleCount(message) || memory.pending.people || null;

      if (!dateObj && !timeStr && !people) {
        return finalize({
          reply: t(lang, "modifyNeedDateTime"),
          memoryPatch: { pending: { ...memory.pending, at: new Date(), dateObj, timeStr, people } },
        });
      }

      try {
        await updateReservationForUser({
          userId,
          rid: memory.pending.rid,
          dateObj,
          timeStr,
          partySize: people,
        });
        return finalize({ reply: t(lang, "modifyOk"), memoryPatch: { pending: null } });
      } catch (e) {
        if (e?.code === "has_selections") {
          return finalize({ reply: t(lang, "modifyNoPartyForMenus"), memoryPatch: { pending: null } });
        }
        if (e?.code === "paid") {
          return finalize({ reply: t(lang, "modifyNotAllowedPaid"), memoryPatch: { pending: null } });
        }
        return finalize({ reply: t(lang, "modifyFail"), memoryPatch: { pending: null } });
      }
    }

    if (memory.pending?.type === "delivery_select") {
      const list = memory.lastDeliveryOrders || (userId ? await fetchUserDeliveryOrders(userId) : []);
      const picked = matchDeliveryFromMessage(message, list, memory.pending.options);
      if (!picked) return finalize({ reply: t(lang, "deliveryChoose") });
      return finalize({
        reply: t(lang, "deliveryIssueAsk"),
        memoryPatch: { pending: { type: "delivery_details", orderId: picked._id, at: new Date() } },
      });
    }

    if (memory.pending?.type === "delivery_details") {
      const issueText = String(message || "").trim();
      if (!issueText) return finalize({ reply: t(lang, "deliveryIssueAsk") });
      const orderId = memory.pending.orderId;
      const order = Array.isArray(memory.lastDeliveryOrders)
        ? memory.lastDeliveryOrders.find((o) => o._id === orderId)
        : null;
      try {
        const fullText = orderId ? `${issueText}\nOrderId: ${orderId}` : issueText;
        await Complaint.create({
          restaurantId: order?.restaurantId,
          userId,
          subject: "Delivery issue",
          text: fullText,
        });
      } catch {}
      return finalize({ reply: t(lang, "deliveryIssueOk"), memoryPatch: { pending: null } });
    }

    if (memory.pending?.type === "create_select") {
      const options = memory.pending.options || [];
      const picked = pickItemByIndex(message, options);
      if (!picked) {
        return finalize({ reply: buildRestaurantChoiceReply(lang, options) });
      }
      return finalize({
        reply: t(lang, "reservationCreateNeedDateTime"),
        memoryPatch: {
          pending: {
            type: "create_details",
            restaurantId: picked._id,
            at: new Date(),
          },
        },
      });
    }

    if (memory.pending?.type === "create_details") {
      let { restaurantId, dateObj, timeStr, people } = memory.pending;
      const msg = String(message || "").trim();

      if (!restaurantId) {
        const dateFromMsg = parseDateFromMessage(msg, lang);
        const timeFromMsg = parseTimeFromMessage(msg);
        const peopleFromMsg = detectPeopleCount(msg);
        if (dateFromMsg || timeFromMsg || peopleFromMsg) {
          dateObj = dateObj || dateFromMsg;
          timeStr = timeStr || timeFromMsg;
          people = people || peopleFromMsg;
          return finalize({
            reply: t(lang, "reservationCreateNeedRestaurant"),
            memoryPatch: { pending: { type: "create_details", dateObj, timeStr, people, at: new Date() } },
          });
        }

        const query = extractRestaurantQuery(msg, lang) || msg;
        const matches = await searchRestaurantsByName(query);
        if (!matches.length) {
          return finalize({ reply: t(lang, "reservationCreateNotFound") });
        }
        if (matches.length > 1) {
          return finalize({
            reply: buildRestaurantChoiceReply(lang, matches),
            memoryPatch: { pending: { type: "create_select", options: matches, at: new Date() } },
          });
        }
        restaurantId = matches[0]._id;
      }

      dateObj = dateObj || parseDateFromMessage(msg, lang);
      timeStr = timeStr || parseTimeFromMessage(msg);
      people = people || detectPeopleCount(msg);

      if (!dateObj || !timeStr) {
        return finalize({
          reply: t(lang, "reservationCreateNeedDateTime"),
          memoryPatch: {
            pending: { type: "create_details", restaurantId, dateObj, timeStr, people, at: new Date() },
          },
        });
      }

      if (!people) {
        return finalize({
          reply: t(lang, "reservationCreateNeedPeople"),
          memoryPatch: {
            pending: { type: "create_details", restaurantId, dateObj, timeStr, people, at: new Date() },
          },
        });
      }

      try {
        await createReservationForUser({
          userId,
          restaurantId,
          dateObj,
          timeStr,
          partySize: people,
        });
        return finalize({ reply: t(lang, "reservationCreateOk"), memoryPatch: { pending: null } });
      } catch (e) {
        return finalize({ reply: t(lang, "reservationCreateFail"), memoryPatch: { pending: null } });
      }
    }

    const intentResult = await classifyIntent(message, lang);

    if (ACTION_INTENTS.has(intentResult.intent)) {
      if (!userId) {
        return finalize({
          reply: t(lang, "loginRequired"),
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          matchedExample: intentResult.matchedExample,
        });
      }

      if (intentResult.intent === "reservation_help") {
        const list = await fetchUserReservations(userId);
        if (!list.length) return finalize({ reply: t(lang, "noReservations") });
        const reply = buildReservationListReply(lang, list);
        return finalize({
          reply,
          suggestions: list.slice(0, 2).flatMap((r, idx) => [
            { label: `#${idx + 1} • ${labelCancel(lang)}`, message: `@cancel rid=${r._id}` },
            { label: `#${idx + 1} • ${labelUpdate(lang)}`, message: `@modify rid=${r._id}` },
          ]),
          memoryPatch: { lastReservations: list },
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          matchedExample: intentResult.matchedExample,
        });
      }

      if (intentResult.intent === "cancel_reservation") {
        const list = memory.lastReservations || (await fetchUserReservations(userId));
        const target = matchReservationFromMessage(message, list, lang);
        if (!target) {
          return finalize({
            reply: t(lang, "chooseReservation"),
            memoryPatch: {
              lastReservations: list,
              pending: { type: "cancel_select", options: list.map((r) => r._id), at: new Date() },
            },
            intent: intentResult.intent,
            confidence: intentResult.confidence,
            matchedExample: intentResult.matchedExample,
          });
        }
        const result = await cancelReservationForUser(userId, target._id);
        if (result.status === "already") return finalize({ reply: t(lang, "cancelAlready") });
        return finalize({ reply: t(lang, "cancelOk") });
      }

      if (intentResult.intent === "modify_reservation") {
        const list = memory.lastReservations || (await fetchUserReservations(userId));
        const target = matchReservationFromMessage(message, list, lang);
        if (!target) {
          return finalize({
            reply: t(lang, "modifySelect"),
            memoryPatch: {
              lastReservations: list,
              pending: { type: "modify_select", options: list.map((r) => r._id), at: new Date() },
            },
            intent: intentResult.intent,
            confidence: intentResult.confidence,
            matchedExample: intentResult.matchedExample,
          });
        }
        const dateObj = parseDateFromMessage(message, lang);
        const timeStr = parseTimeFromMessage(message);
        const people = detectPeopleCount(message);
        if (!dateObj && !timeStr && !people) {
          return finalize({
            reply: t(lang, "modifyNeedDateTime"),
            memoryPatch: { pending: { type: "modify_details", rid: target._id, at: new Date() } },
          });
        }
        try {
          await updateReservationForUser({
            userId,
            rid: target._id,
            dateObj,
            timeStr,
            partySize: people,
          });
          return finalize({ reply: t(lang, "modifyOk"), memoryPatch: { pending: null } });
        } catch (e) {
          if (e?.code === "has_selections") {
            return finalize({ reply: t(lang, "modifyNoPartyForMenus"), memoryPatch: { pending: null } });
          }
          if (e?.code === "paid") {
            return finalize({ reply: t(lang, "modifyNotAllowedPaid"), memoryPatch: { pending: null } });
          }
          return finalize({ reply: t(lang, "modifyFail"), memoryPatch: { pending: null } });
        }
      }

      if (intentResult.intent === "delivery_help") {
        const list = await fetchUserDeliveryOrders(userId);
        if (!list.length) return finalize({ reply: t(lang, "deliveryNoOrders") });
        const reply = buildDeliveryListReply(lang, list);
        return finalize({
          reply,
          memoryPatch: {
            lastDeliveryOrders: list,
            pending: { type: "delivery_select", options: list.map((o) => o._id), at: new Date() },
          },
          intent: intentResult.intent,
          confidence: intentResult.confidence,
          matchedExample: intentResult.matchedExample,
        });
      }

      if (intentResult.intent === "delivery_issue") {
        const list = memory.lastDeliveryOrders || (await fetchUserDeliveryOrders(userId));
        const target = matchDeliveryFromMessage(message, list);
        if (!target) {
          return finalize({
            reply: t(lang, "deliveryChoose"),
            memoryPatch: {
              lastDeliveryOrders: list,
              pending: { type: "delivery_select", options: list.map((o) => o._id), at: new Date() },
            },
            intent: intentResult.intent,
            confidence: intentResult.confidence,
            matchedExample: intentResult.matchedExample,
          });
        }
        return finalize({
          reply: t(lang, "deliveryIssueAsk"),
          memoryPatch: { pending: { type: "delivery_details", orderId: target._id, at: new Date() } },
        });
      }

      if (intentResult.intent === "make_reservation") {
        const dateObj = parseDateFromMessage(message, lang);
        const timeStr = parseTimeFromMessage(message);
        const people = detectPeopleCount(message);

        let restaurantId = null;
        const idMatch = String(message || "").match(/\b[0-9a-f]{24}\b/i);
        if (idMatch) restaurantId = idMatch[0];

        if (!restaurantId) {
          const query = extractRestaurantQuery(message, lang);
          if (query) {
            const matches = await searchRestaurantsByName(query);
            if (matches.length === 1) {
              restaurantId = matches[0]._id;
            } else if (matches.length > 1) {
              return finalize({
                reply: buildRestaurantChoiceReply(lang, matches),
                memoryPatch: { pending: { type: "create_select", options: matches, at: new Date() } },
              });
            }
          }
        }

        if (!restaurantId) {
          return finalize({
            reply: t(lang, "reservationCreateNeedRestaurant"),
            memoryPatch: {
              pending: {
                type: "create_details",
                dateObj,
                timeStr,
                people,
                at: new Date(),
              },
            },
          });
        }

        if (!dateObj || !timeStr) {
          return finalize({
            reply: t(lang, "reservationCreateNeedDateTime"),
            memoryPatch: {
              pending: {
                type: "create_details",
                restaurantId,
                dateObj,
                timeStr,
                people,
                at: new Date(),
              },
            },
          });
        }

        if (!people) {
          return finalize({
            reply: t(lang, "reservationCreateNeedPeople"),
            memoryPatch: {
              pending: {
                type: "create_details",
                restaurantId,
                dateObj,
                timeStr,
                people,
                at: new Date(),
              },
            },
          });
        }

        try {
          await createReservationForUser({
            userId,
            restaurantId,
            dateObj,
            timeStr,
            partySize: people,
          });
          return finalize({ reply: t(lang, "reservationCreateOk"), memoryPatch: { pending: null } });
        } catch (e) {
          return finalize({ reply: t(lang, "reservationCreateFail"), memoryPatch: { pending: null } });
        }
      }
    }

    const searchActive = memory.search?.active === true;
    const searchRelevant =
      searchActive ||
      intentResult.intent === "find_restaurant" ||
      intentResult.intent === "filter_restaurant";

    if (searchRelevant) {
      const nextSearch = updateSearchMemory(memory.search, message, lang);
      const result = buildSearchReply(lang, nextSearch);
      return finalize({
        reply: result.reply,
        suggestions: result.suggestions,
        memoryPatch: {
          search: {
            ...nextSearch,
            active: result.done ? false : true,
          },
        },
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        matchedExample: intentResult.matchedExample,
      });
    }

    // 2) Önce LLM'den cevap almaya çalış
    let llmPayload = null;
    try {
      llmPayload = await generateAssistantReply({
        message,
        lang,
        intent: intentResult.intent,
        history,
      });
    } catch (e) {
      console.error("[assistant] llm error:", e);
    }

    // 3) LLM başarılıysa onu kullan, değilse kural tabanlı fallback
    let replyText = "";
    let suggestions = [];
    let provider = null;
    let usedLlm = false;

    if (llmPayload && typeof llmPayload.reply === "string") {
      replyText = llmPayload.reply;
      suggestions = Array.isArray(llmPayload.suggestions)
        ? llmPayload.suggestions
        : [];
      provider = llmPayload.provider || null;
      usedLlm = true;
    } else {
      const fallback = buildRuleBasedReply(intentResult, lang, message);
      replyText = fallback.reply;
      suggestions = fallback.suggestions || [];
      provider = null;
      usedLlm = false;
    }

    return finalize({
      reply: replyText,
      suggestions,
      provider,
      usedLlm,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      matchedExample: intentResult.matchedExample,
    });
  } catch (err) {
    console.error("[assistant] error:", err);
    return res.status(500).json({
      ok: false,
      message: "assistant_error",
    });
  }
}
