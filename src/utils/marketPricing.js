export function effectivePrice(product) {
  const p = Number(product.price);
  const d = product.discountPrice;
  if (d != null && Number(d) >= 0 && Number(d) < p) return Number(d);
  return p;
}

export function discountPercent(product) {
  const p = Number(product.price);
  const eff = effectivePrice(product);
  if (eff >= p || p <= 0) return 0;
  return Math.round(((p - eff) / p) * 100);
}

export function lowest30(product) {
  const eff = effectivePrice(product);
  const hist = Array.isArray(product.priceHistory) ? product.priceHistory : [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = hist.filter((h) => new Date(h.at).getTime() >= cutoff).map((h) => Number(h.price));
  recent.push(eff);
  return Math.min(...recent);
}

export function recordPriceHistory(product) {
  const eff = effectivePrice(product);
  const hist = Array.isArray(product.priceHistory) ? product.priceHistory.slice() : [];
  const last = hist[hist.length - 1];
  if (!last || Number(last.price) !== eff) hist.push({ price: eff, at: new Date() });
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  let pruned = hist.filter((h) => new Date(h.at).getTime() >= cutoff);
  if (pruned.length > 50) pruned = pruned.slice(pruned.length - 50);
  product.priceHistory = pruned;
}
