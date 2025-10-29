// src/utils/geo.js
export function parseLatLngFromGoogleMaps(urlRaw) {
  if (!urlRaw) return null;
  let url = null;

  try {
    url = new URL(urlRaw);
  } catch {
    // çıplak metinse regex'e devam
  }

  // 1️⃣ !3dLAT!4dLNG (Google Place linki)
  const exMatch = urlRaw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (exMatch) {
    const lat = parseFloat(exMatch[1]);
    const lng = parseFloat(exMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  // 2️⃣ @LAT,LNG (map merkez koordinatı)
  const atMatch = urlRaw.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  // 3️⃣ ll=LAT,LNG veya q=LAT,LNG query paramı
  const pickFromParams = (param) => {
    if (!url) return null;
    const value = url.searchParams.get(param);
    if (!value) return null;
    const m = value.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  };

  const fromLl = pickFromParams("ll");
  if (fromLl) return fromLl;

  const fromQ = pickFromParams("q");
  if (fromQ) return fromQ;

  // 4️⃣ fallback: metin içinde serbest LAT,LNG araması
  const loose = urlRaw.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (loose) {
    const lat = parseFloat(loose[1]);
    const lng = parseFloat(loose[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }

  return null;
}