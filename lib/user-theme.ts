import type { ThemeMode } from "@/lib/types";

/** Тема интерфейса для конкретного пользователя */
export function resolveUserTheme(
  userId: string | undefined,
  preferences: Record<string, ThemeMode>,
  legacyClinicTheme?: ThemeMode
): ThemeMode {
  if (userId && preferences[userId]) {
    return preferences[userId];
  }
  return legacyClinicTheme ?? "light";
}
