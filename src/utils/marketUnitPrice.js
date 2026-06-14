// netQuantity + netUnit varsa { unitPrice, unitPriceUnit } döner, yoksa null.
// Normalizasyon: ml→litre (÷1000), g→kg (÷1000); L→litre, kg→kg, piece→adet.
export function computeUnitPrice(price, netQuantity, netUnit) {
  if (!netQuantity || Number(netQuantity) <= 0 || !netUnit) return null;
  let qty = Number(netQuantity);
  let unit;
  switch (netUnit) {
    case "ml": qty = qty / 1000; unit = "litre"; break;
    case "g":  qty = qty / 1000; unit = "kg"; break;
    case "L":  unit = "litre"; break;
    case "kg": unit = "kg"; break;
    case "piece": unit = "adet"; break;
    default: return null;
  }
  if (qty <= 0) return null;
  return { unitPrice: Math.round((Number(price) / qty) * 100) / 100, unitPriceUnit: unit };
}
