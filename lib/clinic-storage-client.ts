import type { StateStorage } from "zustand/middleware";
import {
  CLINIC_STORAGE_KEY,
  LEGACY_CLINIC_STORAGE_KEYS,
} from "@/lib/initial-clinic-data";

/** Удалить PHI и данные клиники из localStorage (logout / смена пользователя) */
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
