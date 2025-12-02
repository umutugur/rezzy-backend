// src/desktop/theme.ts
export type DesktopThemeKey =
  | "rezvix-classic"
  | "crystal-dark"
  | "dark-latte"
  | "deep-bronze"
  | "light-pos";

const STORAGE_KEY = "rezvixDesktopTheme";

export function getInitialDesktopTheme(): DesktopThemeKey {
  if (typeof window === "undefined") return "rezvix-classic";
  const saved = window.localStorage.getItem(STORAGE_KEY) as DesktopThemeKey | null;
  if (!saved) return "rezvix-classic";
  return saved;
}

export function setDesktopTheme(theme: DesktopThemeKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(
    new CustomEvent("rezvix-desktop-theme-changed", { detail: { theme } })
  );
}