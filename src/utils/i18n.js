export const SUPPORTED_LANGS = ["tr", "en", "ru", "el"];
export const DEFAULT_LANG = "tr";

export function normalizeLang(input, fallback = DEFAULT_LANG) {
  if (input == null) return fallback;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return fallback;

  const cleaned = raw.replace(/_/g, "-");
  if (SUPPORTED_LANGS.includes(cleaned)) return cleaned;

  const base = cleaned.split("-")[0];
  if (SUPPORTED_LANGS.includes(base)) return base;
  if (base === "gr") return "el";

  return fallback;
}

export function localeForLang(lang) {
  const l = normalizeLang(lang);
  switch (l) {
    case "tr":
      return "tr-TR";
    case "en":
      return "en-US";
    case "ru":
      return "ru-RU";
    case "el":
      return "el-GR";
    default:
      return "tr-TR";
  }
}

export function formatDateTime(input, lang, opts = {}) {
  const date = input instanceof Date ? input : new Date(input);
  if (!date || Number.isNaN(date.getTime())) {
    return input == null ? "" : String(input);
  }

  const locale = localeForLang(lang);
  const timeZone = opts.timeZone || "Europe/Istanbul";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}
