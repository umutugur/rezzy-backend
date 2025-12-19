export function getCurrencySymbolForRegion(region?: string): string {
  const r = String(region ?? "").trim().toUpperCase();

  switch (r) {
    case "UK":
    case "GB":
      return "£";

    case "US":
    case "USA":
      return "$";

    case "EU":
    case "DE":
    case "FR":
    case "NL":
    case "ES":
    case "IT":
    case "IE":
    case "PT":
    case "GR":
      return "€";

    case "CY":
    case "KKTC":
    case "TR":
    case "TURKEY":
      return "₺";

    default:
      return "₺";
  }
}