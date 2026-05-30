// src/services/places.service.js
import { Client, Status, TravelMode } from "@googlemaps/google-maps-services-js";

const mapsClient = new Client({});

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Metin sorgusu ile adres/yer önerileri döner.
 * @param {string} query - Arama metni
 * @param {{ lat: number, lng: number } | null} location - Konuma göre bias (opsiyonel)
 * @returns {Promise<Array>} Önerilen yer listesi
 */
export async function searchPlaces(query, location = null) {
  if (!API_KEY) {
    console.warn("[places] GOOGLE_MAPS_API_KEY eksik — boş liste döndürülüyor");
    return [];
  }

  try {
    const params = {
      query,
      language: "tr",
      key: API_KEY,
    };

    if (location?.lat && location?.lng) {
      params.location = { lat: Number(location.lat), lng: Number(location.lng) };
      params.radius = 20000; // 20 km bias
    }

    const response = await mapsClient.textSearch({ params, timeout: 5000 });

    if (response.data.status !== Status.OK && response.data.status !== "ZERO_RESULTS") {
      console.error("[places] textSearch hata:", response.data.status);
      return [];
    }

    return response.data.results.map((place) => ({
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address,
      location: {
        lat: place.geometry?.location?.lat ?? null,
        lng: place.geometry?.location?.lng ?? null,
      },
      types: place.types ?? [],
    }));
  } catch (err) {
    console.error("[places] searchPlaces hata:", err.message);
    return [];
  }
}

/**
 * İki koordinat arasındaki mesafe ve süreyi Google Directions API ile alır.
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distanceKm: number, durationMin: number }>}
 */
export async function getRouteInfo(origin, destination) {
  if (!API_KEY) {
    console.warn("[places] GOOGLE_MAPS_API_KEY eksik — varsayılan değerler döndürülüyor");
    return { distanceKm: 0, durationMin: 0 };
  }

  try {
    const response = await mapsClient.directions({
      params: {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        mode: TravelMode.driving,
        language: "tr",
        key: API_KEY,
      },
      timeout: 5000,
    });

    if (response.data.status !== Status.OK) {
      console.error("[places] directions hata:", response.data.status);
      return { distanceKm: 0, durationMin: 0 };
    }

    const leg = response.data.routes?.[0]?.legs?.[0];
    if (!leg) return { distanceKm: 0, durationMin: 0 };

    const distanceKm = Math.round((leg.distance.value / 1000) * 100) / 100;
    const durationMin = Math.ceil(leg.duration.value / 60);

    return { distanceKm, durationMin };
  } catch (err) {
    console.error("[places] getRouteInfo hata:", err.message);
    return { distanceKm: 0, durationMin: 0 };
  }
}

/**
 * Metin adresini koordinata çevirir (Geocoding API).
 * @param {string} address - Çözümlenecek adres metni
 * @returns {Promise<{ lat: number, lng: number, formattedAddress: string } | null>}
 */
export async function geocodeAddress(address) {
  if (!API_KEY) {
    console.warn("[places] GOOGLE_MAPS_API_KEY eksik — geocode yapılamıyor");
    return null;
  }

  try {
    const response = await mapsClient.geocode({
      params: {
        address,
        language: "tr",
        key: API_KEY,
      },
      timeout: 5000,
    });

    if (response.data.status !== Status.OK) {
      console.error("[places] geocode hata:", response.data.status);
      return null;
    }

    const result = response.data.results?.[0];
    if (!result) return null;

    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
    };
  } catch (err) {
    console.error("[places] geocodeAddress hata:", err.message);
    return null;
  }
}

/**
 * Belirli koordinat etrafındaki yakın yerleri listeler.
 * @param {{ lat: number, lng: number }} location
 * @param {number} radiusMeters
 * @param {string} type - Google Places type (e.g. 'restaurant')
 * @returns {Promise<Array>}
 */
export async function getNearbyPlaces(location, radiusMeters = 1500, type = "establishment") {
  if (!API_KEY) return [];

  try {
    const response = await mapsClient.placesNearby({
      params: {
        location: { lat: Number(location.lat), lng: Number(location.lng) },
        radius: radiusMeters,
        type,
        language: "tr",
        key: API_KEY,
      },
      timeout: 5000,
    });

    if (response.data.status !== Status.OK && response.data.status !== "ZERO_RESULTS") {
      return [];
    }

    return response.data.results.map((place) => ({
      placeId: place.place_id,
      name: place.name,
      address: place.vicinity,
      location: {
        lat: place.geometry?.location?.lat ?? null,
        lng: place.geometry?.location?.lng ?? null,
      },
    }));
  } catch (err) {
    console.error("[places] getNearbyPlaces hata:", err.message);
    return [];
  }
}
