import {
  hasClinicData,
  mergeClinicSnapshotWithLocal,
  parseClinicPersistedState,
  pickPersistedState,
  serverSnapshotHasUpdatesBeyond,
  snapshotHasLocalOnlyEntities,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import { readClinicStorageScope } from "@/lib/clinic-storage-scope";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";

const LEGACY_SESSION_KEY = "dc-clinic-pending-snapshot";
const PENDING_KEY_PREFIX = "dc-clinic-pending-v1";

function pendingStorageKey(slug?: string | null): string {
  const scope = (slug ?? readClinicStorageScope() ?? "_").trim().toLowerCase();
  return `${PENDING_KEY_PREFIX}:${scope}`;
}

function pendingStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function migratePendingFromSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (!legacy) return;
    const storage = pendingStorage();
    const key = pendingStorageKey();
    if (storage && !storage.getItem(key)) {
      storage.setItem(key, legacy);
    }
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Сохранить PHI из localStorage в буфер до purge (переживает закрытие вкладки) */
export function backupPhiSnapshotBeforeDbMode(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CLINIC_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const state = parsed.state ?? (parsed as Record<string, unknown>);
    const snapshot = pickPersistedState(state as Parameters<typeof pickPersistedState>[0]);
    if (!hasClinicData(snapshot)) return;
    writePendingClinicSnapshot(snapshot);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPendingClinicSnapshot(): ClinicPersistedState | null {
  if (typeof window === "undefined") return null;
  migratePendingFromSessionStorage();
  try {
    const storage = pendingStorage();
    const raw = storage?.getItem(pendingStorageKey()) ?? null;
    if (!raw) return null;
    return parseClinicPersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writePendingClinicSnapshot(snapshot: ClinicPersistedState): boolean {
  if (typeof window === "undefined") return true;
  if (!hasClinicData(snapshot)) return true;
  try {
    const storage = pendingStorage();
    if (!storage) return false;
    storage.setItem(pendingStorageKey(), JSON.stringify(snapshot));
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearPendingClinicSnapshot(slug?: string): void {
  if (typeof window === "undefined") return;
  try {
    pendingStorage()?.removeItem(pendingStorageKey(slug));
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const PENDING_BUFFER_ERROR =
  "Не удалось записать буфер несохранённых данных. Не закрывайте вкладку — дождитесь сохранения на сервер.";

/**
 * Объединить экран + буфер несохранённых правок (если есть).
 * Используется перед pull с сервера, чтобы не потерять записи, ещё не ушедшие в БД.
 */
export function mergePendingIntoClinicSnapshot(
  local: ClinicPersistedState
): ClinicPersistedState {
  const pending = readPendingClinicSnapshot();
  if (!pending) return local;
  return mergeClinicSnapshotWithLocal(local, pending);
}

/**
 * Сбросить устаревший буфер только если на сервере есть новые данные,
 * а в буфере нет локальных записей, которых ещё нет на сервере.
 */
export function discardStalePendingClinicSnapshot(remote: ClinicPersistedState): boolean {
  const pending = readPendingClinicSnapshot();
  if (!pending) return false;

  if (snapshotHasLocalOnlyEntities(pending, remote)) return false;
  if (!serverSnapshotHasUpdatesBeyond(remote, pending)) return false;

  clearPendingClinicSnapshot();
  return true;
}

export function hasPendingClinicRecoveryData(): boolean {
  return readPendingClinicSnapshot() !== null;
}

export { PENDING_BUFFER_ERROR };
