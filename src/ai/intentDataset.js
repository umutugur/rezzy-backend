// src/ai/intentDataset.js

export const INTENT_DATASET = {
  intents: {
    greeting: {
      tr: [
        "merhaba",
        "selam",
        "hey",
        "iyi akşamlar",
        "günaydın",
        "naber",
        "selamlar",
        "iyi günler",
        "kolay gelsin",
        "heyy nasılsın",
        "alo",
        "burada mısın"
      ],
      en: [
        "hello",
        "hi",
        "hey",
        "good evening",
        "good morning",
        "what's up",
        "hey there",
        "good day",
        "hi assistant",
        "yo",
        "are you there"
      ],
      ru: [
        "привет",
        "здравствуйте",
        "хей",
        "добрый вечер",
        "доброе утро",
        "как дела",
        "приветствую",
        "добрый день",
        "эй ты тут",
        "алло"
      ],
      el: [
        "γεια",
        "γεια σου",
        "καλησπέρα",
        "καλημέρα",
        "τι κάνεις",
        "χαιρετώ",
        "είσαι εκεί",
        "εδώ είσαι"
      ]
    },

    goodbye: {
      tr: [
        "görüşürüz",
        "bye bye",
        "kendine iyi bak",
        "hoşçakal",
        "şimdilik bu kadar",
        "sonra konuşuruz"
      ],
      en: ["bye", "see you later", "take care", "goodbye", "talk later"],
      ru: ["пока", "до встречи", "увидимся", "до свидания", "поговорим позже"],
      el: ["αντίο", "τα λέμε", "να προσέχεις", "θα μιλήσουμε αργότερα"]
    },

    smalltalk: {
      tr: ["nasılsın", "iyi misin", "nasıl gidiyor", "her şey yolunda mı", "napıyorsun"],
      en: ["how are you", "are you okay", "how is it going", "everything fine", "what are you doing"],
      ru: ["как ты", "всё хорошо", "как дела идут", "что делаешь"],
      el: ["τι κάνεις", "όλα καλά", "πώς πάει", "τι κάνεις τώρα"]
    },

    find_restaurant: {
      tr: [
        "bir mekan öner",
        "nerede yemek yiyebilirim",
        "yakında restoran var mı",
        "Lefkoşa’da meyhane öner",
        "romantik bir yer arıyorum",
        "ucuz bir mekan lazım",
        "canlı müzikli bir yer var mı",
        "4 kişi için yer bakıyorum",
        "bana güzel bir restoran öner",
        "rakı meyhanesi var mı",
        "deniz kenarı bir yer bulun",
        "şu anda açık restoran istiyorum",
        "bugün nereye gidelim",
        "kahvaltı yapacak yer öner",
        // 🔻 buton cümleleri
        "mekan bulmak istiyorum",
        "bana mekan bul",
        "yakında mekan bul",
        "bugün için mekan arıyorum"
      ],
      en: [
        "recommend a restaurant",
        "where can I eat",
        "any places nearby",
        "suggest a tavern in Nicosia",
        "looking for a romantic place",
        "need a cheap restaurant",
        "any live music places",
        "looking for a place for 4 people",
        "suggest a good restaurant",
        "is there a fish restaurant",
        "show me places with good reviews",
        "breakfast place recommendation"
      ],
      ru: [
        "порекомендуй ресторан",
        "где можно поесть",
        "есть места рядом",
        "ищу романтичное место",
        "нужен недорогой ресторан",
        "место с живой музыкой",
        "место на 4 человек",
        "порекомендуй хорошее кафе",
        "где можно позавтракать"
      ],
      el: [
        "πρότεινέ μου ένα εστιατόριο",
        "πού μπορώ να φάω",
        "υπάρχουν μέρη κοντά",
        "αναζητώ ρομαντικό μέρος",
        "φθηνό εστιατόριο",
        "μέρος με ζωντανή μουσική",
        "χρειαζόμαστε μέρος για 4 άτομα",
        "καλό μαγαζί για φαγητό"
      ]
    },

    filter_restaurant: {
      tr: [
        "fiyata göre filtrele",
        "sadece açık mekanları göster",
        "yakındaki mekanları listele",
        "canlı müzik olanları göster",
        "kebap mekanlarını listele",
        "deniz manzaralı yer istiyorum"
      ],
      en: [
        "filter by price",
        "show only open places",
        "list nearby places",
        "show places with live music",
        "list kebab restaurants",
        "I want sea view places"
      ],
      ru: [
        "фильтруй по цене",
        "покажи только открытые места",
        "список мест рядом",
        "покажи с живой музыкой"
      ],
      el: ["φίλτραρε ανά τιμή", "δείξε μόνο ανοιχτά μέρη", "λίστα με κοντινά μέρη"]
    },

    restaurant_details: {
      tr: [
        "bu mekanın menüsü ne",
        "mekanın fotoğrafları var mı",
        "çalışma saatleri nedir",
        "rezervasyon şart mı",
        "mekanda canlı müzik var mı",
        "dekorasyon nasıl",
        "puanı neden düşük"
      ],
      en: [
        "what is this place’s menu",
        "any photos of this place",
        "what are the opening hours",
        "is reservation required",
        "does it have live music"
      ],
      ru: [
        "какое меню в этом месте",
        "есть фото ресторана",
        "какие часы работы",
        "нужна ли резервация"
      ],
      el: ["τι μενού έχει", "έχει φωτογραφίες", "ποιες είναι οι ώρες λειτουργίας"]
    },

    make_reservation: {
      tr: [
        "rezervasyon yapmak istiyorum",
        "bu mekana yer ayırt",
        "2 kişi için masa rezervasyonu yap",
        "akşam 8’e masa lazım",
        "yarın için rezervasyon açabilir misin"
      ],
      en: ["I want to make a reservation", "book a table", "reserve for 2 people", "need a table at 8 pm"],
      ru: ["хочу сделать резерв", "забронируй стол", "место на двоих"],
      el: ["θέλω κράτηση", "κλείσε τραπέζι", "τραπέζι για δύο"]
    },

    modify_reservation: {
      tr: [
        "rezervasyon saatini değiştirmek istiyorum",
        "tarih değişikliği yapabilir miyim",
        "masa sayısını artıracağım",
        "kişiyi 2’den 4’e çıkarabilir miyim"
      ],
      en: [
        "I want to change my reservation time",
        "can I modify the booking",
        "need to change the date",
        "increase people count"
      ],
      ru: [
        "хочу изменить время брони",
        "можно изменить дату",
        "нужно изменить количество людей"
      ],
      el: ["θέλω να αλλάξω την κράτηση", "να αυξήσουμε τα άτομα"]
    },

    cancel_reservation: {
      tr: [
        "rezervasyonu iptal etmek istiyorum",
        "iptal edebilir misin",
        "rezervasyonumu sil",
        "yarının rezervasyonunu iptal et"
      ],
      en: ["I want to cancel my reservation", "cancel my booking", "delete reservation"],
      ru: ["хочу отменить бронь", "отмени бронирование"],
      el: ["θέλω να ακυρώσω την κράτηση", "ακύρωσε το ραντεβού"]
    },

    // 🔹 yeni: rezervasyonları görme / genel yardım intent’i
    reservation_help: {
      tr: [
        "rezervasyonlarıma bak",
        "rezervasyonlarıma bakmak istiyorum",
        "rezervasyonlarımı görmek istiyorum",
        "mevcut rezervasyonlarımı göster",
        "rezervasyon geçmişimi görmek istiyorum",
        "yaptığım rezervasyonları listele",
        "rezervasyonlarım nerede"
      ],
      en: [
        "show my reservations",
        "see my bookings",
        "I want to check my reservations",
        "list my reservations",
        "where are my bookings"
      ],
      ru: [
        "покажи мои брони",
        "хочу увидеть свои бронирования",
        "список моих броней"
      ],
      el: [
        "δείξε τις κρατήσεις μου",
        "θέλω να δω τις κρατήσεις μου",
        "λίστα με τις κρατήσεις μου"
      ]
    },

    no_show_policy: {
      tr: [
        "gelmezsem ne olur",
        "no-show ücreti var mı",
        "geç kalırsam rezervasyon iptal olur mu"
      ],
      en: [
        "what happens if I don’t show up",
        "is there a no-show fee",
        "if I'm late will it be cancelled"
      ],
      ru: ["что будет если не приду", "есть штраф за неявку"],
      el: ["τι γίνεται αν δεν έρθω", "έχει χρέωση μη εμφάνισης"]
    },

    payment_info: {
      tr: [
        "ödeme nasıl yapılıyor",
        "kart geçiyor mu",
        "depositoyu nasıl ödeyeceğim",
        "havale yapabilir miyim",
        "komisyon var mı",
        // 🔻 buton cümlesi
        "ödeme ve depozito hakkında bilgi",
        "depozito nasıl işliyor"
      ],
      en: [
        "how do I pay",
        "do you accept card",
        "how do I pay the deposit",
        "is bank transfer accepted",
        "information about payment and deposit"
      ],
      ru: ["как оплатить", "можно картой", "как оплатить депозит"],
      el: [
        "πώς πληρώνω",
        "δέχεστε κάρτα",
        "πώς πληρώνω την προκαταβολή",
        "πληρωμή και προκαταβολή πληροφορίες"
      ]
    },

    complaint: {
      tr: [
        "şikayetim var",
        "mekan yanlış ücret aldı",
        "rezervasyonum görünmüyor",
        "uygulamada hata var"
      ],
      en: ["I have a complaint", "the venue charged me wrong", "my booking is missing"],
      ru: ["есть жалоба", "меня неправильно списали"],
      el: ["έχω παράπονο", "έλαβα λάθος χρέωση"]
    },

    faq: {
      tr: [
        "rezvix nasıl çalışıyor",
        "uygulama güvenli mi",
        "neden telefon numarası gerekiyor",
        "depozito ne için alınıyor",
        "komisyon nedir"
      ],
      en: [
        "how does rezvix work",
        "is the app safe",
        "why do you need my phone number",
        "what is the deposit for"
      ],
      ru: ["как работает приложение", "это безопасно", "зачем нужен телефон"],
      el: ["πώς λειτουργεί η εφαρμογή", "είναι ασφαλές", "γιατί χρειάζεται ο αριθμός μου"]
    },

    // Sadece eğitim amaçlı, aktif intent gibi kullanılmıyor ama dursun
    fallback: {
      tr: ["tam anlayamadım", "biraz daha detay verebilir misin"],
      en: ["I didn't understand", "can you clarify"],
      ru: ["не понял", "уточни пожалуйста"],
      el: ["δεν κατάλαβα", "μπορείς να εξηγήσεις;"]
    }
  }
};

export const SUPPORTED_LANGUAGES = ["tr", "en", "ru", "el"];