// src/scripts/seed-owner-and-restaurant.js
import dotenv from "dotenv";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";
import Menu from "../models/Menu.js";

dotenv.config();

async function main() {
  await connectDB(process.env.MONGO_URI);

  // 1) Yeni restoran sahibi kullanıcı
  const ownerEmail = "new-owner@rezvix.app";
  const existing = await User.findOne({ email: ownerEmail });
  if (existing) {
    console.log("⚠️ Bu email ile bir kullanıcı zaten var:", existing._id.toString());
    process.exit(0);
  }

  const owner = await User.create({
    name: "Sahil Meyhane Sahibi",
    email: ownerEmail,
    password: "123456",
    role: "restaurant",
    providers: [{ name: "password", sub: ownerEmail }],
  });

  // 2) Restoran dokümanı (owner ile ilişkilendir)
  const restaurant = await Restaurant.create({
    owner: owner._id,
    name: "Sahil Meyhane",
    address: "Kordonboyu Caddesi No: 18, Alsancak / İzmir",
    city: "Girne",
    phone: "+90 232 555 00 55",
    email: "info@sahilmeyhane.com",
    iban: "TR12 3456 7890 1234 5678 9012 34",
    ibanName: "Sahil Meyhane İşletmeciliği A.Ş.",
    bankName: "Ziraat Bankası",
    priceRange: "₺₺₺",
    rating: 4.7,
    photos: [
      // yüksek çöz. stok görseller (örnek)
      "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop",
    ],
    // Uzun Hakkında metni
    description:
      "Sahil Meyhane, Ege’nin tuzlu rüzgârını masanıza taşıyan, klasik meyhane kültürünü çağdaş bir dokunuşla birleştiren bir buluşma noktasıdır. "
      + "Mutfağımızda günlük pazardan gelen Ege otları, zeytinyağlı mezeler ve deniz ürünleri başrolde. Şefimiz, her tabağı mevsimin ruhuna uygun "
      + "olarak tasarlarken yerel üreticilerle çalışmaya özen gösterir. Canlı fasıl geceleri ve sakin akşam yemekleri için ayrı ayrı atmosferler sunarız; "
      + "gün batımında rakı-balık eşleşmelerine özenle hazırladığımız meze uçuşları eşlik eder. Rezervasyonlarınız için esnek saat aralıkları, özel gün "
      + "organizasyonları içinse küçük grup menüleri sağlıyoruz. ‘Az ama öz’ prensibiyle seçtiğimiz içecek menümüzde, rakıların yöresel notlarını "
      + "keşfedebileceğiniz tadım önerileri de bulacaksınız. Sahil Meyhane’de amaç; uzun sofralar, hatırlanan hikâyeler ve iyi müzik ile geçen bir geceyi, "
      + "ertesi gün hâlâ yüzünüzde bir tebessümle anımsamanızdır.",

    // Açılış saatleri (0=Pazar .. 6=Cumartesi)
    openingHours: [
      { day: 0, open: "13:00", close: "23:59", isClosed: false },
      { day: 1, open: "13:00", close: "23:00", isClosed: false },
      { day: 2, open: "13:00", close: "23:00", isClosed: false },
      { day: 3, open: "13:00", close: "23:00", isClosed: false },
      { day: 4, open: "13:00", close: "23:30", isClosed: false },
      { day: 5, open: "13:00", close: "23:59", isClosed: false },
      { day: 6, open: "13:00", close: "23:59", isClosed: false },
    ],

    // Masalar
    tables: [
      { name: "Sahil 1", capacity: 2, isActive: true },
      { name: "Sahil 2", capacity: 2, isActive: true },
      { name: "Köşe 1", capacity: 4, isActive: true },
      { name: "Salon 1", capacity: 6, isActive: true },
    ],

    // Rezervasyon politikaları (FE/BE ile uyumlu alanlar)
    minPartySize: 1,
    maxPartySize: 8,
    slotMinutes: 90,
    // computeDeposit fonksiyonuyla uyumlu olacak şekilde ya percent ya flat ver:
    depositRequired: true,
    depositAmount: 0,          // düz tutar kullanmak istemezsen 0 bırak
    // aşağıdaki alanlar bazı BE’lerde kullanılıyor (opsiyonel):
    depositRate: 20,           // %20 kapora (computeDeposit bunu algılıyor)
    graceMinutes: 15,
    blackoutDates: [],

    isActive: true,
  });

  // 3) User.restaurantId’i bağla
  owner.restaurantId = restaurant._id;
  await owner.save();

  // 4) Fix menüler
  const menus = await Menu.insertMany([
    {
      restaurantId: restaurant._id,
      title: "Ege Başlangıç",
      description: "10 meze + zeytinyağlı seçkisi",
      pricePerPerson: 590,
      isActive: true,
    },
    {
      restaurantId: restaurant._id,
      title: "Deniz Rüzgârı",
      description: "12 meze + deniz ürünü ara sıcak",
      pricePerPerson: 740,
      isActive: true,
    },
    {
      restaurantId: restaurant._id,
      title: "Sahil Ziyafeti",
      description: "Meze uçuşu + sıcak + günlük balık + tatlı",
      pricePerPerson: 960,
      isActive: true,
    },
  ]);

  console.log("✅ Oluşturuldu:");
  console.log("  User (owner):", owner._id.toString(), owner.email);
  console.log("  Restaurant  :", restaurant._id.toString(), restaurant.name);
  console.log("  Menus       :", menus.map(m => `${m.title} (${m.pricePerPerson}₺)`).join(" | "));

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed hata:", err);
  process.exit(1);
});
