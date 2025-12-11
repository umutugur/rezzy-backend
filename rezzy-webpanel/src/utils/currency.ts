export function getCurrencySymbolForRegion(region?: string): string {
  const r = (region || "").toUpperCase();

  if (r === "UK" || r === "GB") return "£";
  if (r === "US" || r === "USA") return "$";
  if (["EU", "DE", "FR", "NL", "ES", "IT", "CY", "IE", "PT", "GR"].includes(r)) {
    return "€";
  }

  // Default: TR
  return "₺";
}