// src/services/assistantFaq.helpers.js
//
// Saf FAQ metin haritası — asistanın `faq{topic}` read aracı tarafından
// kullanılır. İçerik, assistant.controller.js#buildRuleBasedReply'deki
// mevcut kural cevaplarıyla (no-show/payment/genel) aynı tonda tutulur.
// DB'ye dokunmaz, side-effect'siz.

const FAQ_TOPICS = {
  no_show: {
    tr: "No-show durumunda (rezervasyona gitmediğinde) mekanın kendi politikası geçerlidir. Rezvix, mekanın belirlediği iptal ve no-show şartlarını uygular. Detaylı politikayı rezervasyon özetinde görebilirsin.",
    en: "In case of a no-show, the venue's own policy applies. Rezvix follows the venue's cancellation and no-show rules. You can see the details in your reservation summary.",
    ru: "В случае неявки действует политика заведения. Rezvix следует правилам отмены и no-show, которые установлены самим рестораном. Подробности смотри в своём бронировании.",
    el: "Σε περίπτωση μη εμφάνισης (no-show), ισχύει η πολιτική του μαγαζιού. Το Rezvix ακολουθεί τους κανόνες ακύρωσης και no-show που ορίζει το κατάστημα. Δες τις λεπτομέρειες στην περίληψη της κράτησής σου.",
  },
  payment: {
    tr: "Ödeme yöntemleri, seçtiğin mekana ve rezervasyon tipine göre değişebilir. Bazı mekanlar sadece kart, bazıları ise nakit veya havale/dekont ile çalışır. Rezervasyon adımlarında kabul edilen ödeme yöntemlerini görebilirsin.",
    en: "Payment methods depend on the venue and the reservation type. Some venues accept only card, others may allow cash or bank transfer/receipt upload. You'll see available payment methods in the reservation steps.",
    ru: "Способы оплаты зависят от заведения и типа брони. Некоторые принимают только карту, другие могут позволять наличные или банковский перевод с квитанцией. Доступные способы оплаты видны в шагах бронирования.",
    el: "Οι τρόποι πληρωμής εξαρτώνται από το μαγαζί και το είδος της κράτησης. Κάποια δέχονται μόνο κάρτα, άλλα δέχονται μετρητά ή έμβασμα/ανέβασμα αποδεικτικού. Θα δεις τις διαθέσιμες επιλογές στα βήματα της κράτησης.",
  },
  general: {
    tr: "Rezvix, mekanlara güvenli ve şeffaf rezervasyon sistemi sunar. Kullanıcılar kolayca mekan keşfedip depozitolu veya normal rezervasyon yapabilir, işletmeler de doluluklarını daha iyi yönetir. Verilerin güvenli olarak saklanır ve sadece gerekli bilgiler mekanla paylaşılır.",
    en: "Rezvix offers venues a safe and transparent reservation system. Guests can discover places and make normal or deposit-based reservations, while venues manage capacity more efficiently. Your data is stored securely and only necessary info is shared with the venue.",
    ru: "Rezvix — это безопасная и прозрачная система бронирования. Гости находят заведения и делают обычные или депозитные брони, а рестораны лучше управляют заполняемостью. Данные хранятся безопасно, и заведению передаётся только необходимая информация.",
    el: "Το Rezvix προσφέρει στα μαγαζιά ένα ασφαλές και διαφανές σύστημα κρατήσεων. Οι πελάτες βρίσκουν εύκολα νέα μέρη και κάνουν απλές ή με προκαταβολή κρατήσεις, ενώ τα μαγαζιά διαχειρίζονται καλύτερα τη διαθεσιμότητα. Τα δεδομένα σου φυλάσσονται με ασφάλεια και μοιραζόμαστε μόνο ό,τι χρειάζεται με το κατάστημα.",
  },
};

// Serbest metin konu adlarını bilinen anahtarlara eşler.
const TOPIC_ALIASES = [
  [/no.?show|gelmeme|katılmama|absence/i, "no_show"],
  [/payment|ödeme|oplata|pagamento|deposit|kapora/i, "payment"],
];

function resolveTopicKey(topic) {
  const raw = String(topic || "").trim();
  if (FAQ_TOPICS[raw]) return raw;
  for (const [re, key] of TOPIC_ALIASES) {
    if (re.test(raw)) return key;
  }
  return "general";
}

/**
 * SAF fonksiyon: bir konu için 4 dilde de cevap döner (asistan LLM'i,
 * sistem prompt'undaki hedef dile göre bunlardan birini kullanır/çevirir).
 * @param {string} topic
 * @returns {{topic: string, answer: {tr:string, en:string, ru:string, el:string}}}
 */
export function getFaqAnswer(topic) {
  const key = resolveTopicKey(topic);
  return { topic: key, answer: { ...FAQ_TOPICS[key] } };
}
