// controllers/assistant.controller.js
import { classifyIntent } from "../src/ai/intentClassifier.js";
import { SUPPORTED_LANGUAGES } from "../src/ai/intentDataset.js";

const FALLBACK_LANG = "tr";

function resolveLang(langRaw) {
  const code = (langRaw || "").toString().toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code) ? code : FALLBACK_LANG;
}

/**
 * Küçük helper: kişi sayısı yakalamaya çalış (çok basic).
 * Örn: "4 kişi", "3 people"
 */
function detectPeopleCount(message) {
  const m = message.match(/(\d+)\s*(kişi|person|people|άτομα|человека|человек)?/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0 || n > 50) return null;
  return n;
}

/**
 * Intent + dil + orijinal mesajdan kullanıcıya döneceğimiz cevabı üretir
 */
function buildReply(intentResult, lang, message) {
  const { intent, confidence } = intentResult;
  const people = detectPeopleCount(message);

  const L = lang; // daha kısa yazmak için

  // Ortak bazı textler (TR/EN/RU/EL)
  const TEXT = {
    greeting: {
      tr: "Merhaba! Ben Rezzy Asistan. Mekan bulmana, rezervasyonlarını yönetmene ve uygulama ile ilgili sorularına yardımcı olabilirim.",
      en: "Hi! I’m the Rezzy Assistant. I can help you find venues, manage your reservations and answer questions about the app.",
      ru: "Привет! Я ассистент Rezzy. Помогу найти заведение, управлять бронями и отвечу на вопросы о приложении.",
      el: "Γεια σου! Είμαι ο βοηθός του Rezzy. Μπορώ να σε βοηθήσω να βρεις μαγαζιά, να διαχειριστείς κρατήσεις και να λύσω απορίες για την εφαρμογή."
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
      tr: "No-show durumunda (rezervasyona gitmediğinde) mekanın kendi politikası geçerlidir. Rezzy, mekanın belirlediği iptal ve no-show şartlarını uygular. Detaylı politikayı rezervasyon özetinde görebilirsin.",
      en: "In case of a no-show, the venue’s own policy applies. Rezzy follows the venue’s cancellation and no-show rules. You can see the details in your reservation summary.",
      ru: "В случае неявки действует политика заведения. Rezzy следует правилам отмены и no-show, которые установлены самим рестораном. Подробности смотри в своём бронировании.",
      el: "Σε περίπτωση μη εμφάνισης (no-show), ισχύει η πολιτική του μαγαζιού. Το Rezzy ακολουθεί τους κανόνες ακύρωσης και no-show που ορίζει το κατάστημα. Δες τις λεπτομέρειες στην περίληψη της κράτησής σου."
    },
    payment: {
      tr: "Ödeme yöntemleri, seçtiğin mekana ve rezervasyon tipine göre değişebilir. Bazı mekanlar sadece kart, bazıları ise nakit veya havale/dekont ile çalışır. Rezervasyon adımlarında kabul edilen ödeme yöntemlerini görebilirsin.",
      en: "Payment methods depend on the venue and the reservation type. Some venues accept only card, others may allow cash or bank transfer/receipt upload. You’ll see available payment methods in the reservation steps.",
      ru: "Способы оплаты зависят от заведения и типа брони. Некоторые принимают только карту, другие могут позволять наличные или банковский перевод с квитанцией. Доступные способы оплаты видны в шагах бронирования.",
      el: "Οι τρόποι πληρωμής εξαρτώνται από το μαγαζί και το είδος της κράτησης. Κάποια δέχονται μόνο κάρτα, άλλα δέχονται μετρητά ή έμβασμα/ανέβασμα αποδεικτικού. Θα δεις τις διαθέσιμες επιλογές στα βήματα της κράτησης."
    },
    faq: {
      tr: "Rezzy, mekanlara güvenli ve şeffaf rezervasyon sistemi sunar. Kullanıcılar kolayca mekan keşfedip depozitolu veya normal rezervasyon yapabilir, işletmeler de doluluklarını daha iyi yönetir. Verilerin güvenli olarak saklanır ve sadece gerekli bilgiler mekanla paylaşılır.",
      en: "Rezzy offers venues a safe and transparent reservation system. Guests can discover places and make normal or deposit-based reservations, while venues manage capacity more efficiently. Your data is stored securely and only necessary info is shared with the venue.",
      ru: "Rezzy — это безопасная и прозрачная система бронирования. Гости находят заведения и делают обычные или депозитные брони, а рестораны лучше управляют заполняемостью. Данные хранятся безопасно, и заведению передаётся только необходимая информация.",
      el: "Το Rezzy προσφέρει στα μαγαζιά ένα ασφαλές και διαφανές σύστημα κρατήσεων. Οι πελάτες βρίσκουν εύκολα νέα μέρη και κάνουν απλές ή με προκαταβολή κρατήσεις, ενώ τα μαγαζιά διαχειρίζονται καλύτερα τη διαθεσιμότητα. Τα δεδομένα σου φυλάσσονται με ασφάλεια και μοιραζόμαστε μόνο ό,τι χρειάζεται με το κατάστημα."
    },
    complaint: {
      tr: "Yaşadığın sorun için üzgünüm. Lütfen kısaca ne yaşadığını, hangi mekanda ve mümkünse hangi rezervasyon ile ilgili olduğunu yaz. Gerekirse ekibimiz seninle iletişime geçsin diye iletişim bilgilerini de ekleyebilirsin.",
      en: "I’m sorry you had a problem. Please describe briefly what happened, at which venue and, if possible, which reservation it’s about. You can also add contact details so our team can follow up if needed.",
      ru: "Сожалею, что возникла проблема. Опиши, пожалуйста, что случилось, в каком заведении и, если возможно, по какой брони. Можешь добавить контактные данные, чтобы команда могла связаться с тобой при необходимости.",
      el: "Λυπάμαι που αντιμετώπισες πρόβλημα. Γράψε μου σύντομα τι έγινε, σε ποιο μαγαζί και, αν γίνεται, για ποια κράτηση. Μπορείς επίσης να αφήσεις στοιχεία επικοινωνίας για να σε βοηθήσει η ομάδα μας."
    },
    fallback: {
      tr: "Tam olarak ne yapmak istediğini anlayamadım. Sana mekan mı bulayım, mevcut rezervasyonlarınla mı ilgilenelim yoksa Rezzy hakkında genel bilgi mi istersin?",
      en: "I’m not sure I understood what you want. Should I help you find a place, check your reservations, or give you general info about Rezzy?",
      ru: "Я не до конца понял, что ты хочешь сделать. Помочь найти заведение, разобраться с бронями или рассказать подробнее о Rezzy?",
      el: "Δεν είμαι σίγουρος ότι κατάλαβα τι θέλεις να κάνεις. Να σε βοηθήσω να βρεις μαγαζί, να δούμε τις κρατήσεις σου ή θέλεις γενικές πληροφορίες για το Rezzy;"
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
              { label: "Rezzy nedir?", message: "Rezzy nasıl çalışıyor" }
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

/**
 * Ana controller
 * POST /api/assistant/message
 * body: { message: string, language?: "tr" | "en" | "ru" | "el" }
 */
export async function handleAssistantMessage(req, res) {
  try {
    const { message, language } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        message: "message_required",
      });
    }

    const lang = resolveLang(language);

    const intentResult = await classifyIntent(message, lang);
    const replyPayload = buildReply(intentResult, lang, message);

    return res.json({
      ok: true,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      matchedExample: intentResult.matchedExample,
      reply: replyPayload.reply,
      suggestions: replyPayload.suggestions,
    });
  } catch (err) {
    console.error("[assistant] error:", err);
    return res.status(500).json({
      ok: false,
      message: "assistant_error",
    });
  }
}