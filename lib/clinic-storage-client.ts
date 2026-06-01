import type { StateStorage } from "zustand/middleware";
import { isClinicServerDatabaseMode } from "@/lib/clinic-client-mode";
import {
  CLINIC_STORAGE_KEY,
  LEGACY_CLINIC_STORAGE_KEYS,
} from "@/lib/initial-clinic-data";
import { pickClientSafePersistedState } from "@/lib/clinic-persisted-state";

/** Оставить в zustand-кэше только userThemePreferences (после включения server DB mode) */
export function purgePhiFromClinicLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CLINIC_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number };
    const state = parsed.state ?? parsed;
    const safe = pickClientSafePersistedState({
      userThemePreferences:
        (state.userThemePreferences as Record<string, import("@/lib/types").ThemeMode>) ??
        {},
    });
    localStorage.setItem(
      CLINIC_STORAGE_KEY,
      JSON.stringify({ state: safe, version: parsed.version ?? 0 })
    );
  } catch {
    try {
      localStorage.removeItem(CLINIC_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Удалить PHI и данные клиники из localStorage (logout). Темы — в dc-user-theme-preferences, не трогаем. */
export function clearPersistedClinicData(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_CLINIC_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore quota / private mode */
    }
  }
  try {
    localStorage.removeItem(CLINIC_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** localStorage без throw — иначе zustand persist роняет всё приложение */
export function createSafeClinicStorage(): StateStorage {
  return {
    getItem: (name) => {
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        localStorage.setItem(name, value);
      } catch {
        /* QuotaExceededError и private mode — не прерываем UI */
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
