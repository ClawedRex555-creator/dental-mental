import type { ThemeMode } from "@/lib/types";

/** Отдельно от PHI-кэша клиники — не очищается при logout */
export const USER_THEME_STORAGE_KEY = "dc-user-theme-preferences";

export function guestThemeKey(clinicSlug: string): string {
  return `@guest:${clinicSlug}`;
}

export function readThemePreferencesFromStorage(): Record<string, ThemeMode> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(USER_THEME_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ThemeMode>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, ThemeMode] =>
          entry[1] === "light" || entry[1] === "dark"
      )
    );
  } catch {
    return {};
  }
}

export function persistThemePreferencesToStorage(
  preferences: Record<string, ThemeMode>
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(USER_THEME_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* quota / private mode */
  }
}

export function mergeThemePreferences(
  ...sources: Array<Record<string, ThemeMode> | undefined>
): Record<string, ThemeMode> {
  return sources.reduce<Record<string, ThemeMode>>((acc, src) => {
    if (!src) return acc;
    return { ...acc, ...src };
  }, {});
}
