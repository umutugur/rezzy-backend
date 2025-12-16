export function getCurrencySymbolForRegion(region?: string): string {
  const r = String(region || "").trim().toUpperCase();

  // United Kingdom
  if (r === "UK" || r === "GB") return "£";

  // United States
  if (r === "US" || r === "USA") return "$";

  // Cyprus / KKTC → iş kararı gereği TL
  if (r === "CY" || r === "KKTC") return "₺";

  // Turkey
  if (r === "TR" || r === "TURKEY") return "₺";

  // Avrupa ülkeleri (şimdilik TL gösteriliyor)
  if (["EU", "DE", "FR", "NL", "ES", "IT", "IE", "PT", "GR"].includes(r)) {
    return "₺";
  }

  // Fallback
  return "₺";
}