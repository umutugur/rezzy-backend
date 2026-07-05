// Pure helpers for ServiceCategory (DB-free; unit-tested).

const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u" };

/** "Su & Damacana" -> "su-damacana" (lowercase ascii slug, [a-z0-9_-]) */
export function slugifyKey(input) {
  const s = String(input ?? "").trim().replace(/[çğıöşüÇĞİIÖŞÜ]/g, (ch) => TR_MAP[ch] ?? ch);
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Region visibility: empty regions = everywhere; no region context = visible. */
export function visibleInRegion(cat, region) {
  const r = String(region || "").toUpperCase();
  const list = Array.isArray(cat?.regions) ? cat.regions : [];
  if (!r || list.length === 0) return true;
  return list.map((x) => String(x).toUpperCase()).includes(r);
}

/** Lowercased, trimmed, escaped case-insensitive regexes for keywords. */
export function keywordRegexes(keywords) {
  return (Array.isArray(keywords) ? keywords : [])
    .map((k) => String(k ?? "").trim().toLowerCase())
    .filter(Boolean)
    .map((k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}
