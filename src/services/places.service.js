// src/services/places.service.js
// Tamamen ücretsiz — Google Maps yerine Nominatim (OpenStreetMap) + Haversine kullanır.
// API key gerektirmez.
//
// Nominatim kullanım politikası:
//   • Max 1 istek/saniye (debounce frontend'de uygulanıyor)
//   • User-Agent zorunlu
//   • Ticari kullanıma uygun — atıf yeterli

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "Rezvix-App/1.0 (contact@rezvix.com)";

/** Nominatim'e HTTP GET at, JSON döndür */
async function nominatimFetch(path) {
  const res = await fetch(`${NOMINATIM_BASE}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "tr,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── Haversine mesafe (düz hat km) ───────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─── Dışa aktarılan fonksiyonlar ─────────────────────────────────────────────

/**
 * Metin araması → adres önerileri listesi.
 * Nominatim /search endpoint'ini kullanır.
 */
export async function searchPlaces(query, location = null) {
  if (!query || query.trim().length < 2) return [];

  try {
    const params = new URLSearchParams({
      q: query.trim(),
      format: "json",
      limit: "6",
      addressdetails: "0",
    });

    // Eğer mevcut konum varsa o bölgeye bias ekle (ama dışarısını da ara)
    if (location?.lat && location?.lng) {
      const d = 0.45; // ~50 km viewbox
      params.set(
        "viewbox",
        `${location.lng - d},${location.lat + d},${location.lng + d},${location.lat - d}`
      );
      params.set("bounded", "0");
    }

    const data = await nominatimFetch(`/search?${params}`);

    return data.map((r) => ({
      placeId: String(r.place_id),
      address: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  } catch (err) {
    console.error("[places] searchPlaces hata:", err.message);
    return [];
  }
}

/**
 * İki koordinat arasındaki tahmini yol mesafesi ve süresi.
 * Haversine düz-hat mesafesi × 1.35 (yol katsayısı) ile tahmin edilir.
 * Ortalama şehir içi hız: 30 km/h
 */
export async function getRouteInfo(origin, destination) {
  try {
    const straightKm = haversineKm(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng
    );
    // Yol katsayısı: şehir içi 1.35, uzun mesafe için biraz daha az
    const roadFactor = straightKm < 5 ? 1.4 : straightKm < 20 ? 1.35 : 1.25;
    const distanceKm = Math.round(straightKm * roadFactor * 100) / 100;
    const avgSpeedKmh = 28; // şehir içi ortalama
    const durationMin = Math.max(3, Math.ceil((distanceKm / avgSpeedKmh) * 60));
    return { distanceKm, durationMin };
  } catch (err) {
    console.error("[places] getRouteInfo hata:", err.message);
    return { distanceKm: 0, durationMin: 0 };
  }
}

/**
 * Adres metnini koordinata çevirir.
 * Nominatim /search endpoint'ini kullanır.
 */
export async function geocodeAddress(address) {
  const results = await searchPlaces(address);
  if (!results.length) return null;
  const r = results[0];
  return {
    lat: r.lat,
    lng: r.lng,
    formattedAddress: r.address,
    placeId: r.placeId,
  };
}

/**
 * Koordinattan adres bilgisi al (reverse geocode).
 * Nominatim /reverse endpoint'ini kullanır.
 */
export async function reverseGeocode(lat, lng) {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      zoom: "16",
    });
    const data = await nominatimFetch(`/reverse?${params}`);
    return {
      address: data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
    };
  } catch (err) {
    console.error("[places] reverseGeocode hata:", err.message);
    return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
  }
}

/**
 * Yakındaki yerler — Nominatim Overpass ile basit uygulama.
 * (Bu fonksiyon isteğe bağlı; kullanılmıyorsa boş liste döner.)
 */
export async function getNearbyPlaces(location, radiusMeters = 1500, type = "establishment") {
  // Nominatim'in "nearby" özelliği sınırlı — şimdilik boş döndür
  // Gerekirse Overpass API entegre edilebilir (tamamen ücretsiz)
  return [];
}
