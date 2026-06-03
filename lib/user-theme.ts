import type { ThemeMode } from "@/lib/types";

/** Тема интерфейса для конкретного пользователя (ключ — id учётки или @guest:slug) */
export function resolveUserTheme(
  accountKey: string | undefined,
  preferences: Record<string, ThemeMode>
): ThemeMode {
  if (accountKey && preferences[accountKey]) {
    return preferences[accountKey];
  }
  return "light";
}

export function applyDocumentTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}
