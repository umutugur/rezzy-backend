import { DEFAULT_LANG, formatDateTime, normalizeLang } from "../utils/i18n.js";

const NOTIFICATION_TEMPLATES = {
  reminder_24h: {
    title: {
      tr: "Yarın görüşüyoruz – QR kodunu unutma",
      en: "See you tomorrow – don’t forget your QR code",
      ru: "Увидимся завтра — не забудьте QR‑код",
      el: "Τα λέμε αύριο — μην ξεχάσεις τον κωδικό QR",
    },
    body: {
      tr: "Girişte QR kodunu okutacaksın.",
      en: "You’ll scan your QR code at the entrance.",
      ru: "На входе нужно отсканировать QR‑код.",
      el: "Στην είσοδο θα σαρώσεις τον κωδικό QR.",
    },
  },
  reminder_3h: {
    title: {
      tr: "3 saat kaldı – QR kodunu hazırla",
      en: "3 hours left – have your QR code ready",
      ru: "Осталось 3 часа — подготовьте QR‑код",
      el: "Απομένουν 3 ώρες — ετοίμασε τον κωδικό QR",
    },
    body: {
      tr: "Uygulama içinden QR kodunu açmayı unutma.",
      en: "Don’t forget to open your QR code in the app.",
      ru: "Не забудьте открыть QR‑код в приложении.",
      el: "Μην ξεχάσεις να ανοίξεις τον κωδικό QR στην εφαρμογή.",
    },
  },
  restaurant_pending_reminder: {
    title: {
      tr: "Bekleyen rezervasyon isteği",
      en: "Pending reservation request",
      ru: "Ожидающий запрос на бронирование",
      el: "Εκκρεμές αίτημα κράτησης",
    },
    body: {
      tr: "Yanıtlanmamış bir rezervasyon talebiniz var.",
      en: "You have a reservation request awaiting your response.",
      ru: "У вас есть запрос на бронирование, ожидающий ответа.",
      el: "Υπάρχει αίτημα κράτησης που περιμένει απάντηση.",
    },
  },
  reservation_pending: {
    title: {
      tr: "Talebin alındı ✅",
      en: "Your request was received ✅",
      ru: "Ваш запрос принят ✅",
      el: "Το αίτημά σου καταχωρήθηκε ✅",
    },
    body: {
      tr: "{dateTime} için talebin restorana iletildi. Onaylanınca QR kodun açılacak.",
      en: "Your request for {dateTime} was sent to the restaurant. Your QR code will be available once approved.",
      ru: "Ваш запрос на {dateTime} отправлен ресторану. QR‑код появится после подтверждения.",
      el: "Το αίτημά σου για {dateTime} στάλθηκε στο εστιατόριο. Ο κωδικός QR θα εμφανιστεί μετά την έγκριση.",
    },
  },
  restaurant_new_request: {
    title: {
      tr: "Yeni rezervasyon talebi",
      en: "New reservation request",
      ru: "Новый запрос на бронирование",
      el: "Νέο αίτημα κράτησης",
    },
    body: {
      tr: "{dateTime} • {partySize} kişilik rezervasyon bekliyor. Lütfen kontrol edin.",
      en: "{dateTime} • A reservation for {partySize} guests is waiting. Please review.",
      ru: "{dateTime} • Ожидается бронирование на {partySize} гостей. Пожалуйста, проверьте.",
      el: "{dateTime} • Εκκρεμεί κράτηση για {partySize} άτομα. Παρακαλώ ελέγξτε.",
    },
  },
  reservation_approved: {
    title: {
      tr: "Rezervasyonun onaylandı 🎉",
      en: "Your reservation is approved 🎉",
      ru: "Ваша бронь подтверждена 🎉",
      el: "Η κράτησή σου εγκρίθηκε 🎉",
    },
    body: {
      tr: "{dateTime} • QR kodun hazır. Rezvix > Rezervasyonlarım üzerinden erişebilirsin.",
      en: "{dateTime} • Your QR code is ready. You can access it from Rezvix > My Reservations.",
      ru: "{dateTime} • Ваш QR‑код готов. Доступен в Rezvix > Мои бронирования.",
      el: "{dateTime} • Ο κωδικός QR είναι έτοιμος. Θα τον βρεις στο Rezvix > Οι κρατήσεις μου.",
    },
  },
  reservation_rejected: {
    title: {
      tr: "Üzgünüz, rezervasyon onaylanmadı",
      en: "Sorry, your reservation wasn’t approved",
      ru: "К сожалению, бронирование не подтверждено",
      el: "Λυπούμαστε, η κράτηση δεν εγκρίθηκε",
    },
    body: {
      tr: "Uygun başka bir saat deneyebilirsin. İstersen farklı bir restoran da seçebilirsin.",
      en: "You can try another time, or choose a different restaurant.",
      ru: "Попробуйте другое время или выберите другой ресторан.",
      el: "Μπορείς να δοκιμάσεις άλλη ώρα ή να επιλέξεις άλλο εστιατόριο.",
    },
  },
  reservation_cancelled: {
    title: {
      tr: "Rezervasyon iptal edildi",
      en: "Reservation cancelled",
      ru: "Бронирование отменено",
      el: "Η κράτηση ακυρώθηκε",
    },
    body: {
      tr: "{dateTime} tarihli rezervasyon, müşteri tarafından iptal edildi.",
      en: "The reservation for {dateTime} was cancelled by the customer.",
      ru: "Бронирование на {dateTime} отменено клиентом.",
      el: "Η κράτηση για {dateTime} ακυρώθηκε από τον πελάτη.",
    },
  },
  reservation_updated: {
    title: {
      tr: "Rezervasyon güncellendi",
      en: "Reservation updated",
      ru: "Бронирование обновлено",
      el: "Η κράτηση ενημερώθηκε",
    },
    body: {
      tr: "Yeni tarih/saat: {dateTime}. Detayları uygulamada görebilirsin.",
      en: "New date/time: {dateTime}. You can see details in the app.",
      ru: "Новая дата/время: {dateTime}. Детали в приложении.",
      el: "Νέα ημερομηνία/ώρα: {dateTime}. Δες τις λεπτομέρειες στην εφαρμογή.",
    },
  },
  reservation_updated_restaurant: {
    title: {
      tr: "Rezervasyon güncellendi",
      en: "Reservation updated",
      ru: "Бронирование обновлено",
      el: "Η κράτηση ενημερώθηκε",
    },
    body: {
      tr: "{dateTime} • {partySize} kişilik rezervasyon güncellendi.",
      en: "{dateTime} • Reservation for {partySize} guests was updated.",
      ru: "{dateTime} • Бронь на {partySize} гостей обновлена.",
      el: "{dateTime} • Η κράτηση για {partySize} άτομα ενημερώθηκε.",
    },
  },
  checkin: {
    title: {
      tr: "Check-in tamam ✅",
      en: "Check-in complete ✅",
      ru: "Регистрация завершена ✅",
      el: "Το check‑in ολοκληρώθηκε ✅",
    },
    body: {
      tr: "İyi eğlenceler! {dateTime} rezervasyonun için girişin alındı.",
      en: "Enjoy! You’ve been checked in for your {dateTime} reservation.",
      ru: "Приятного времяпрепровождения! Вы зарегистрированы на {dateTime}.",
      el: "Καλή διασκέδαση! Έγινε check‑in για την κράτηση στις {dateTime}.",
    },
  },
  order_ready: {
    title: {
      tr: "Siparişin hazır",
      en: "Your order is ready",
      ru: "Ваш заказ готов",
      el: "Η παραγγελία σου είναι έτοιμη",
    },
    body: {
      tr: "Masa {tableName} için siparişin hazırlandı. Teslim almak için gel.",
      en: "Your order for table {tableName} is ready. Please come to pick it up.",
      ru: "Ваш заказ для стола {tableName} готов. Подойдите за ним.",
      el: "Η παραγγελία για το τραπέζι {tableName} είναι έτοιμη. Έλα να την παραλάβεις.",
    },
  },
  table_service_request: {
    title: {
      tr: "{tableTitle}",
      en: "{tableTitle}",
      ru: "{tableTitle}",
      el: "{tableTitle}",
    },
    body: {
      tr: "{requestTypeLabel} alındı.",
      en: "{requestTypeLabel} received.",
      ru: "Получен запрос: {requestTypeLabel}.",
      el: "Λήφθηκε: {requestTypeLabel}.",
    },
  },
  market_order_confirmed: {
    title: {
      tr: "Siparişin onaylandı ✅",
      en: "Your order is confirmed ✅",
      ru: "Ваш заказ подтверждён ✅",
      el: "Η παραγγελία σου εγκρίθηκε ✅",
    },
    body: {
      tr: "{storeName} siparişini hazırlamaya başladı.",
      en: "{storeName} has started preparing your order.",
      ru: "{storeName} приступил к подготовке вашего заказа.",
      el: "Το {storeName} άρχισε να ετοιμάζει την παραγγελία σου.",
    },
  },
  market_order_preparing: {
    title: {
      tr: "Siparişin hazırlanıyor 🛒",
      en: "Your order is being prepared 🛒",
      ru: "Ваш заказ готовится 🛒",
      el: "Η παραγγελία σου ετοιμάζεται 🛒",
    },
    body: {
      tr: "{storeName} siparişini hazırlıyor. Az kaldı!",
      en: "{storeName} is preparing your order. Almost there!",
      ru: "{storeName} готовит ваш заказ. Почти готово!",
      el: "Το {storeName} ετοιμάζει την παραγγελία σου. Σχεδόν έτοιμο!",
    },
  },
  market_order_ready: {
    title: {
      tr: "Siparişin hazır 📦",
      en: "Your order is ready 📦",
      ru: "Ваш заказ готов 📦",
      el: "Η παραγγελία σου είναι έτοιμη 📦",
    },
    body: {
      tr: "{storeName} siparişin teslime hazır.",
      en: "Your order at {storeName} is ready for pickup/delivery.",
      ru: "Ваш заказ в {storeName} готов к выдаче.",
      el: "Η παραγγελία σου στο {storeName} είναι έτοιμη.",
    },
  },
  market_order_delivered: {
    title: {
      tr: "Siparişin teslim edildi 🎉",
      en: "Your order has been delivered 🎉",
      ru: "Ваш заказ доставлен 🎉",
      el: "Η παραγγελία σου παραδόθηκε 🎉",
    },
    body: {
      tr: "{storeName} siparişin başarıyla teslim edildi. Afiyet olsun!",
      en: "Your order from {storeName} was delivered successfully. Enjoy!",
      ru: "Заказ из {storeName} успешно доставлен. Приятного аппетита!",
      el: "Η παραγγελία σου από το {storeName} παραδόθηκε επιτυχώς. Καλή όρεξη!",
    },
  },
  market_order_on_the_way: {
    title: {
      tr: "Siparişiniz yola çıktı! 🛵",
      en: "Your order is on the way! 🛵",
      ru: "Ваш заказ в пути! 🛵",
      el: "Η παραγγελία σου είναι καθ' οδόν! 🛵",
    },
    body: {
      tr: "{storeName} siparişinizi yola çıkardı.",
      en: "{storeName} has sent your order out for delivery.",
      ru: "{storeName} отправил ваш заказ.",
      el: "Το {storeName} έστειλε την παραγγελία σου.",
    },
  },
  market_order_cancelled_by_store: {
    title: {
      tr: "Sipariş iptal edildi",
      en: "Order cancelled",
      ru: "Заказ отменён",
      el: "Η παραγγελία ακυρώθηκε",
    },
    body: {
      tr: "{storeName} siparişini iptal etti. Neden: {reason}",
      en: "{storeName} cancelled your order. Reason: {reason}",
      ru: "{storeName} отменил ваш заказ. Причина: {reason}",
      el: "Το {storeName} ακύρωσε την παραγγελία σου. Λόγος: {reason}",
    },
  },
  market_order_cancelled_by_customer: {
    title: {
      tr: "Sipariş iptal edildi",
      en: "Order cancelled",
      ru: "Заказ отменён",
      el: "Η παραγγελία ακυρώθηκε",
    },
    body: {
      tr: "Müşteri siparişi iptal etti.",
      en: "The customer cancelled the order.",
      ru: "Клиент отменил заказ.",
      el: "Ο πελάτης ακύρωσε την παραγγελία.",
    },
  },
  market_new_order: {
    title: {
      tr: "Yeni sipariş! 🛒",
      en: "New order! 🛒",
      ru: "Новый заказ! 🛒",
      el: "Νέα παραγγελία! 🛒",
    },
    body: {
      tr: "{total} TL tutarında yeni sipariş geldi.",
      en: "New order received for {total} TL.",
      ru: "Получен новый заказ на {total} TL.",
      el: "Νέα παραγγελία {total} TL.",
    },
  },

  // ─── Planlı Taksi (yolcu) ──────────────────────────────────────────────
  scheduled_ride_active: {
    title: {
      tr: "Taksi planın aktif 🎉",
      en: "Your scheduled taxi is active 🎉",
      ru: "Ваш план такси активен 🎉",
      el: "Το πρόγραμμα ταξί σου είναι ενεργό 🎉",
    },
    body: {
      tr: "{dateTime} için taksi planın onaylandı. Sürücü bulununca haber vereceğiz.",
      en: "Your scheduled taxi for {dateTime} is confirmed. We'll notify you once a driver claims it.",
      ru: "Ваш заказ такси на {dateTime} подтверждён. Сообщим, когда водитель возьмёт заказ.",
      el: "Το ταξί σου για {dateTime} επιβεβαιώθηκε. Θα σε ενημερώσουμε μόλις αναλάβει οδηγός.",
    },
  },
  scheduled_ride_claimed: {
    title: {
      tr: "Sürücün hazır 🚕",
      en: "Your driver is ready 🚕",
      ru: "Ваш водитель готов 🚕",
      el: "Ο οδηγός σου είναι έτοιμος 🚕",
    },
    body: {
      tr: "{driverName} · {plate} seni alınma saatinde bekliyor olacak.",
      en: "{driverName} · {plate} will be waiting for you at pickup time.",
      ru: "{driverName} · {plate} будет ждать вас в назначенное время.",
      el: "{driverName} · {plate} θα σε περιμένει την ώρα παραλαβής.",
    },
  },
  scheduled_ride_released: {
    title: {
      tr: "Sürücün değişiyor",
      en: "Your driver has changed",
      ru: "Ваш водитель меняется",
      el: "Ο οδηγός σου αλλάζει",
    },
    body: {
      tr: "Sürücün planı bıraktı, senin için yeni bir sürücü arıyoruz.",
      en: "Your driver released the plan, we're finding a new one for you.",
      ru: "Водитель отказался от заказа, мы ищем нового.",
      el: "Ο οδηγός άφησε το πρόγραμμα, ψάχνουμε νέο για εσένα.",
    },
  },
  scheduled_ride_driver_changed: {
    title: {
      tr: "Sürücün değişiyor",
      en: "Your driver has changed",
      ru: "Ваш водитель меняется",
      el: "Ο οδηγός σου αλλάζει",
    },
    body: {
      tr: "Önceki sürücün müsait değil, senin için yeni bir sürücü aranıyor.",
      en: "Your previous driver isn't available, we're finding a new one for you.",
      ru: "Предыдущий водитель недоступен, мы ищем нового.",
      el: "Ο προηγούμενος οδηγός δεν είναι διαθέσιμος, αναζητούμε νέο.",
    },
  },
  scheduled_ride_unconfirmed_warning: {
    title: {
      tr: "Rezervasyonun hâlâ onaylanmadı",
      en: "Your reservation is still not confirmed",
      ru: "Ваше бронирование ещё не подтверждено",
      el: "Η κράτησή σου δεν έχει εγκριθεί ακόμα",
    },
    body: {
      tr: "Taksi planın onay bekliyor. Onaylanmazsa planın otomatik iptal olacak.",
      en: "Your scheduled taxi is waiting for reservation approval. It'll be cancelled automatically if not approved in time.",
      ru: "Ваш план такси ждёт подтверждения бронирования. Иначе он будет автоматически отменён.",
      el: "Το πρόγραμμα ταξί περιμένει έγκριση κράτησης. Θα ακυρωθεί αυτόματα αν δεν εγκριθεί εγκαίρως.",
    },
  },
  scheduled_ride_failed_unconfirmed: {
    title: {
      tr: "Taksi planın iptal edildi",
      en: "Your scheduled taxi was cancelled",
      ru: "Ваш план такси отменён",
      el: "Το πρόγραμμα ταξί σου ακυρώθηκε",
    },
    body: {
      tr: "Rezervasyonun zamanında onaylanmadığı için taksi planın iptal oldu. İstersen anlık taksi çağırabilirsin.",
      en: "Your reservation wasn't confirmed in time, so the scheduled taxi was cancelled. You can request an instant taxi instead.",
      ru: "Бронирование не было подтверждено вовремя, план такси отменён. Вы можете вызвать такси сейчас.",
      el: "Η κράτηση δεν εγκρίθηκε εγκαίρως, το πρόγραμμα ταξί ακυρώθηκε. Μπορείς να καλέσεις ταξί άμεσα.",
    },
  },
  scheduled_ride_driver_on_way: {
    title: {
      tr: "Sürücün yolda 🚖",
      en: "Your driver is on the way 🚖",
      ru: "Ваш водитель уже в пути 🚖",
      el: "Ο οδηγός σου είναι καθ' οδόν 🚖",
    },
    body: {
      tr: "Planlı yolculuğun başladı. Canlı takip için uygulamayı aç.",
      en: "Your scheduled ride has started. Open the app for live tracking.",
      ru: "Ваша запланированная поездка началась. Откройте приложение для отслеживания.",
      el: "Η προγραμματισμένη διαδρομή σου ξεκίνησε. Άνοιξε την εφαρμογή για ζωντανή παρακολούθηση.",
    },
  },
  scheduled_ride_may_be_late: {
    title: {
      tr: "Sürücün gecikebilir",
      en: "Your driver may be late",
      ru: "Ваш водитель может опоздать",
      el: "Ο οδηγός σου μπορεί να καθυστερήσει",
    },
    body: {
      tr: "Sürücün alınma saatine ~{minutes} dk gecikebilir.",
      en: "Your driver may arrive ~{minutes} min after the pickup time.",
      ru: "Водитель может опоздать примерно на {minutes} мин.",
      el: "Ο οδηγός μπορεί να καθυστερήσει περίπου {minutes} λεπτά.",
    },
  },
  scheduled_ride_failed_no_driver: {
    title: {
      tr: "Sürücü bulunamadı",
      en: "No driver found",
      ru: "Водитель не найден",
      el: "Δεν βρέθηκε οδηγός",
    },
    body: {
      tr: "Planlı yolculuğun için sürücü bulamadık. İstersen anlık taksi çağırabilirsin.",
      en: "We couldn't find a driver for your scheduled ride. You can request an instant taxi instead.",
      ru: "Мы не смогли найти водителя для вашей запланированной поездки. Вы можете вызвать такси сейчас.",
      el: "Δεν βρήκαμε οδηγό για την προγραμματισμένη διαδρομή σου. Μπορείς να καλέσεις ταξί άμεσα.",
    },
  },
  scheduled_ride_cancelled_by_reservation: {
    title: {
      tr: "Taksi planın iptal edildi",
      en: "Your scheduled taxi was cancelled",
      ru: "Ваш план такси отменён",
      el: "Το πρόγραμμα ταξί σου ακυρώθηκε",
    },
    body: {
      tr: "Bağlı rezervasyon iptal/red edildiği için taksi planın da otomatik iptal edildi.",
      en: "Since the linked reservation was cancelled/rejected, your scheduled taxi was cancelled too.",
      ru: "Так как связанное бронирование отменено/отклонено, план такси также отменён.",
      el: "Καθώς η συνδεδεμένη κράτηση ακυρώθηκε/απορρίφθηκε, ακυρώθηκε και το πρόγραμμα ταξί.",
    },
  },

  // ─── Planlı Taksi (sürücü) ─────────────────────────────────────────────
  scheduled_ride_driver_new_board: {
    title: {
      tr: "Yeni planlı yolculuk 🚕",
      en: "New scheduled ride 🚕",
      ru: "Новая запланированная поездка 🚕",
      el: "Νέα προγραμματισμένη διαδρομή 🚕",
    },
    body: {
      tr: "{dateTime} için bölgende yeni bir planlı yolculuk var. Panonu kontrol et.",
      en: "There's a new scheduled ride in your area for {dateTime}. Check your board.",
      ru: "В вашем регионе новая запланированная поездка на {dateTime}. Проверьте панель.",
      el: "Υπάρχει νέα προγραμματισμένη διαδρομή στην περιοχή σου για {dateTime}. Έλεγξε τον πίνακα.",
    },
  },
  scheduled_ride_driver_remind30: {
    title: {
      tr: "Planlı yolculuğun 30 dk sonra",
      en: "Your scheduled ride is in 30 min",
      ru: "Ваша запланированная поездка через 30 мин",
      el: "Η προγραμματισμένη διαδρομή σου σε 30 λεπτά",
    },
    body: {
      tr: "{dateTime} alınma saatine hazır ol.",
      en: "Get ready for pickup at {dateTime}.",
      ru: "Приготовьтесь к посадке в {dateTime}.",
      el: "Ετοιμάσου για παραλαβή στις {dateTime}.",
    },
  },
  scheduled_ride_driver_remind10: {
    title: {
      tr: "Planlı yolculuğun 10 dk sonra",
      en: "Your scheduled ride is in 10 min",
      ru: "Ваша запланированная поездка через 10 мин",
      el: "Η προγραμματισμένη διαδρομή σου σε 10 λεπτά",
    },
    body: {
      tr: "{dateTime} alınma saatine az kaldı.",
      en: "Pickup at {dateTime} is coming up soon.",
      ru: "Скоро посадка в {dateTime}.",
      el: "Η παραλαβή στις {dateTime} πλησιάζει.",
    },
  },
  scheduled_ride_driver_conflict: {
    title: {
      tr: "Çakışma uyarısı",
      en: "Conflict warning",
      ru: "Предупреждение о конфликте",
      el: "Προειδοποίηση σύγκρουσης",
    },
    body: {
      tr: "Şu anda aktif bir yolculuğun var, planlı yolculuğunla çakışabilir.",
      en: "You currently have an active ride that may conflict with your scheduled ride.",
      ru: "У вас есть активная поездка, которая может конфликтовать с запланированной.",
      el: "Έχεις ενεργή διαδρομή που μπορεί να συγκρούεται με την προγραμματισμένη.",
    },
  },
  scheduled_ride_driver_claim_dropped: {
    title: {
      tr: "Üstlenmen düştü",
      en: "Your claim was dropped",
      ru: "Ваша заявка отменена",
      el: "Η ανάληψή σου αφαιρέθηκε",
    },
    body: {
      tr: "Çevrimdışı/meşgul olduğun için üstlendiğin planlı yolculuk sırasına geri döndü.",
      en: "Since you were offline/busy, your claimed scheduled ride was returned to dispatch.",
      ru: "Поскольку вы были офлайн/заняты, ваша заявка вернулась в очередь.",
      el: "Καθώς ήσουν εκτός σύνδεσης/απασχολημένος, η ανάληψή σου επέστρεψε στην αποστολή.",
    },
  },
  scheduled_ride_driver_plan_updated: {
    title: {
      tr: "Planlı yolculuk güncellendi",
      en: "Scheduled ride updated",
      ru: "Запланированная поездка обновлена",
      el: "Η προγραμματισμένη διαδρομή ενημερώθηκε",
    },
    body: {
      tr: "Yolcu planı güncelledi. Yeni alınma saati: {dateTime}.",
      en: "The passenger updated the plan. New pickup time: {dateTime}.",
      ru: "Пассажир обновил план. Новое время посадки: {dateTime}.",
      el: "Ο επιβάτης ενημέρωσε το πρόγραμμα. Νέα ώρα παραλαβής: {dateTime}.",
    },
  },
  scheduled_ride_driver_plan_cancelled: {
    title: {
      tr: "Planlı yolculuk iptal edildi",
      en: "Scheduled ride cancelled",
      ru: "Запланированная поездка отменена",
      el: "Η προγραμματισμένη διαδρομή ακυρώθηκε",
    },
    body: {
      tr: "Üstlendiğin planlı yolculuk iptal edildi.",
      en: "The scheduled ride you claimed was cancelled.",
      ru: "Запланированная поездка, которую вы взяли, отменена.",
      el: "Η προγραμματισμένη διαδρομή που ανέλαβες ακυρώθηκε.",
    },
  },
};

const REQUEST_TYPE_LABELS = {
  tr: {
    waiter: "Garson çağrısı",
    bill: "Hesap isteği",
    default: "Masa servisi",
  },
  en: {
    waiter: "Waiter call",
    bill: "Bill request",
    default: "Table service",
  },
  ru: {
    waiter: "Вызов официанта",
    bill: "Запрос счета",
    default: "Обслуживание стола",
  },
  el: {
    waiter: "Κλήση σερβιτόρου",
    bill: "Αίτημα λογαριασμού",
    default: "Εξυπηρέτηση τραπεζιού",
  },
};

const TABLE_TITLES = {
  tr: {
    withId: "Masa {tableId}",
    withoutId: "Masa servisi",
  },
  en: {
    withId: "Table {tableId}",
    withoutId: "Table service",
  },
  ru: {
    withId: "Стол {tableId}",
    withoutId: "Обслуживание стола",
  },
  el: {
    withId: "Τραπέζι {tableId}",
    withoutId: "Εξυπηρέτηση τραπεζιού",
  },
};

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}T/;

function formatVar(val, lang) {
  if (val == null) return "";
  if (val instanceof Date) return formatDateTime(val, lang);
  if (typeof val === "string" && ISO_LIKE.test(val)) {
    return formatDateTime(val, lang);
  }
  return String(val);
}

function renderTemplate(template, vars, lang) {
  const src = template == null ? "" : String(template);
  if (!src) return "";

  return src.replace(/\{(\w+)\}/g, (match, key) => {
    if (!vars || typeof vars !== "object") return "";
    if (!(key in vars)) return "";
    return formatVar(vars[key], lang);
  });
}

function resolveRequestTypeLabel(type, lang) {
  const L = normalizeLang(lang);
  const dict = REQUEST_TYPE_LABELS[L] || REQUEST_TYPE_LABELS[DEFAULT_LANG];
  return dict[type] || dict.default;
}

function resolveTableTitle(tableId, lang) {
  const L = normalizeLang(lang);
  const dict = TABLE_TITLES[L] || TABLE_TITLES[DEFAULT_LANG];
  if (tableId) {
    return renderTemplate(dict.withId, { tableId }, L);
  }
  return dict.withoutId;
}

export function renderNotification(key, vars = {}, lang = DEFAULT_LANG) {
  const L = normalizeLang(lang);
  const tpl = NOTIFICATION_TEMPLATES[key];
  if (!tpl) return { title: "", body: "" };

  const v = { ...(vars || {}) };

  if (v.requestType && !v.requestTypeLabel) {
    v.requestTypeLabel = resolveRequestTypeLabel(String(v.requestType), L);
  }

  if (!v.tableTitle) {
    const tableRef = v.tableName ?? v.tableId ?? null;
    v.tableTitle = resolveTableTitle(tableRef, L);
  }

  const titleTpl = tpl.title?.[L] || tpl.title?.[DEFAULT_LANG] || "";
  const bodyTpl = tpl.body?.[L] || tpl.body?.[DEFAULT_LANG] || "";

  return {
    title: renderTemplate(titleTpl, v, L),
    body: renderTemplate(bodyTpl, v, L),
  };
}
