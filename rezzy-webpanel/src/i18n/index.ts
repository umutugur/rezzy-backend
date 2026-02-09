import React from "react";
import { translations, type SupportedLanguage } from "./translations";
import { DEFAULT_LANGUAGE } from "../utils/languages";

const STORAGE_KEY = "rezvix_panel_language";

const listeners = new Set<() => void>();

function normalizeLanguage(input?: string | null): SupportedLanguage {
  const code = String(input ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0] as SupportedLanguage;
  if (code && Object.prototype.hasOwnProperty.call(translations, code)) return code;
  return DEFAULT_LANGUAGE as SupportedLanguage;
}

function readStoredLanguage(): SupportedLanguage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeLanguage(raw);
  } catch {
    return null;
  }
}

function readNavigatorLanguage(): SupportedLanguage | null {
  if (typeof navigator === "undefined") return null;
  const lang = navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : "");
  if (!lang) return null;
  return normalizeLanguage(lang);
}

let currentLanguage: SupportedLanguage =
  readStoredLanguage() || readNavigatorLanguage() || (DEFAULT_LANGUAGE as SupportedLanguage);

function notify() {
  listeners.forEach((cb) => cb());
}

function getValue(obj: any, key: string): string | undefined {
  if (!obj) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  if (!key.includes(".")) return undefined;
  const parts = key.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr == null || typeof curr !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(curr, part)) return undefined;
    curr = curr[part];
  }
  return typeof curr === "string" ? curr : undefined;
}

function interpolate(template: string, options?: Record<string, any>) {
  if (!options) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) return "";
    const v = options[key];
    return v == null ? "" : String(v);
  });
}

export function translate(
  key: string,
  options?: { defaultValue?: string } & Record<string, any>,
  language: SupportedLanguage = currentLanguage
) {
  const dict = translations[language];
  const fallbackDict = translations[DEFAULT_LANGUAGE as SupportedLanguage] || {};

  const raw = getValue(dict, key) ?? getValue(fallbackDict, key);
  const base = raw ?? options?.defaultValue ?? key;
  return interpolate(base, options);
}

export function t(
  key: string,
  options?: { defaultValue?: string } & Record<string, any>
) {
  return translate(key, options, currentLanguage);
}

export function setLocale(lang: string) {
  const next = normalizeLanguage(lang);
  if (next === currentLanguage) return;
  currentLanguage = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }
  notify();
}

export function getLocale(): SupportedLanguage {
  return currentLanguage;
}

export function useI18n() {
  const [locale, setLocaleState] = React.useState<SupportedLanguage>(currentLanguage);

  React.useEffect(() => {
    const onChange = () => setLocaleState(currentLanguage);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return {
    t: (key: string, options?: { defaultValue?: string } & Record<string, any>) =>
      translate(key, options, locale),
    locale,
    setLocale,
  };
}

export function setInitialLocale(lang?: string | null) {
  if (!lang) return;
  setLocale(lang);
}

export { normalizeLanguage };
