// src/desktop/theme.ts
export type DesktopThemeKey =
  | "rezzy-classic"
  | "crystal-dark"
  | "dark-latte"
  | "deep-bronze"
  | "light-pos";

const STORAGE_KEY = "rezzyDesktopTheme";

export function getInitialDesktopTheme(): DesktopThemeKey {
  if (typeof window === "undefined") return "rezzy-classic";
  const saved = window.localStorage.getItem(STORAGE_KEY) as DesktopThemeKey | null;
  if (!saved) return "rezzy-classic";
  return saved;
}

export function setDesktopTheme(theme: DesktopThemeKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(
    new CustomEvent("rezzy-desktop-theme-changed", { detail: { theme } })
  );
}