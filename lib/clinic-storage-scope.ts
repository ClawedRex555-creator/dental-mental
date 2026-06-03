const CLINIC_DATA_CACHE_KEY = "dentalcloud-mis-storage-v4";
const LEGACY_CLINIC_DATA_CACHE_KEYS = [
  "dentalcloud-mis-storage-v3",
  "dentalcloud-mis-storage-v2",
  "dentalcloud-mis-storage",
] as const;

function clearScopedClinicCache(): void {
  const storage = browserStorage();
  if (!storage) return;
  for (const key of LEGACY_CLINIC_DATA_CACHE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    storage.removeItem(CLINIC_DATA_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Привязка localStorage к поддомену — иначе данные клиники A попадут в клинику B */
export const CLINIC_SCOPE_STORAGE_KEY = "dentalcloud-mis-clinic-slug-scope";

function browserStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  const g = globalThis as { localStorage?: Storage };
  return g.localStorage ?? null;
}

export function readClinicStorageScope(): string | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLINIC_SCOPE_STORAGE_KEY);
    return raw?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export function writeClinicStorageScope(slug: string): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.setItem(CLINIC_SCOPE_STORAGE_KEY, slug.trim().toLowerCase());
  } catch {
    /* ignore */
  }
}

/**
 * Сверяет поддомен с последним сохранённым. При смене клиники очищает PHI в localStorage.
 * @returns true — scope совпал или впервые установлен; false — была другая клиника, кэш очищен
 */
export function ensureClinicStorageScope(slug: string | null | undefined): boolean {
  const next = slug?.trim().toLowerCase();
  if (!next) return true;

  const prev = readClinicStorageScope();
  if (!prev) {
    writeClinicStorageScope(next);
    return true;
  }
  if (prev === next) return true;

  clearScopedClinicCache();
  writeClinicStorageScope(next);
  return false;
}
