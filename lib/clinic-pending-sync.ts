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
const TAB_ID_KEY = "dc-clinic-tab-id";

function currentTabId(): string {
  try {
    if (typeof sessionStorage === "undefined") return "main";
    let id = sessionStorage.getItem(TAB_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tab_${Date.now().toString(36)}`;
      sessionStorage.setItem(TAB_ID_KEY, id);
    }
    return id;
  } catch {
    return "main";
  }
}

function scopeSlug(slug?: string | null): string {
  return (slug ?? readClinicStorageScope() ?? "_").trim().toLowerCase();
}

/** Per-tab pending key — вкладки не затирают чужой буфер (H14). */
function pendingStorageKey(slug?: string | null): string {
  return `${PENDING_KEY_PREFIX}:${scopeSlug(slug)}:${currentTabId()}`;
}

function legacyPendingKey(slug?: string | null): string {
  return `${PENDING_KEY_PREFIX}:${scopeSlug(slug)}`;
}

function pendingStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    const g = globalThis as { localStorage?: Storage };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

function migratePendingFromSessionStorage(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
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

function parsePendingRaw(raw: string | null): ClinicPersistedState | null {
  if (!raw) return null;
  try {
    return parseClinicPersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Все pending-буферы клиники (все вкладки + legacy key) для recovery merge. */
function readAllPendingForScope(slug?: string | null): ClinicPersistedState | null {
  const storage = pendingStorage();
  if (!storage) return null;
  const scope = scopeSlug(slug);
  const prefix = `${PENDING_KEY_PREFIX}:${scope}:`;
  const legacy = legacyPendingKey(slug);
  let merged: ClinicPersistedState | null = null;

  const absorb = (raw: string | null) => {
    const snap = parsePendingRaw(raw);
    if (!snap || !hasClinicData(snap)) return;
    merged = merged ? mergeClinicSnapshotWithLocal(merged, snap) : snap;
  };

  absorb(storage.getItem(legacy));
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      absorb(storage.getItem(key));
    }
  } catch {
    /* ignore */
  }
  return merged;
}

/** Сохранить PHI из localStorage в буфер до purge (переживает закрытие вкладки) */
export function backupPhiSnapshotBeforeDbMode(): void {
  try {
    const storage = pendingStorage();
    if (!storage) return;
    const raw = storage.getItem(CLINIC_STORAGE_KEY);
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
  migratePendingFromSessionStorage();
  try {
    const storage = pendingStorage();
    const own = parsePendingRaw(storage?.getItem(pendingStorageKey()) ?? null);
    if (own) return own;
    // Fallback: legacy shared key (до per-tab)
    return parsePendingRaw(storage?.getItem(legacyPendingKey()) ?? null);
  } catch {
    return null;
  }
}

/**
 * Убрать тяжёлые data URL из буфера — иначе JSON.stringify/localStorage
 * на клиниках с файлами даёт RangeError (stack) или QuotaExceeded и вешает sync.
 */
export function slimSnapshotForPendingBuffer(
  snapshot: ClinicPersistedState
): ClinicPersistedState {
  const slimFiles = snapshot.patientFiles.some(
    (f) => typeof f.dataUrl === "string" && f.dataUrl.length > 8_000
  );
  const slimLegal = snapshot.legalDocuments.some(
    (d) => typeof d.fileDataUrl === "string" && d.fileDataUrl.length > 8_000
  );
  if (!slimFiles && !slimLegal) return snapshot;
  return {
    ...snapshot,
    patientFiles: slimFiles
      ? snapshot.patientFiles.map((f) => {
          if (typeof f.dataUrl !== "string" || f.dataUrl.length <= 8_000) return f;
          const { dataUrl: _drop, ...rest } = f;
          return rest;
        })
      : snapshot.patientFiles,
    legalDocuments: slimLegal
      ? snapshot.legalDocuments.map((d) => {
          if (typeof d.fileDataUrl !== "string" || d.fileDataUrl.length <= 8_000) {
            return d;
          }
          const { fileDataUrl: _drop, ...rest } = d;
          return rest;
        })
      : snapshot.legalDocuments,
  };
}

/** Удалить все pending-ключи клиники (все вкладки) — освобождение quota. */
export function clearAllPendingForScope(slug?: string | null): void {
  const storage = pendingStorage();
  if (!storage) return;
  const scope = scopeSlug(slug);
  const prefix = `${PENDING_KEY_PREFIX}:${scope}:`;
  const legacy = legacyPendingKey(slug);
  const toRemove: string[] = [legacy];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(prefix)) toRemove.push(key);
    }
  } catch {
    /* ignore */
  }
  for (const key of toRemove) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Выкинуть слишком большие pending (после сбоев elanar и т.п.). */
export function clearOversizedPendingBuffers(maxChars = 1_500_000): number {
  const storage = pendingStorage();
  if (!storage) return 0;
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(PENDING_KEY_PREFIX)) continue;
      const val = storage.getItem(key);
      if (val && val.length > maxChars) toRemove.push(key);
    }
  } catch {
    return 0;
  }
  for (const key of toRemove) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  return toRemove.length;
}

export function writePendingClinicSnapshot(snapshot: ClinicPersistedState): boolean {
  if (!hasClinicData(snapshot)) return true;
  const storage = pendingStorage();
  if (!storage) return typeof window === "undefined";

  let payload: string;
  try {
    payload = JSON.stringify(slimSnapshotForPendingBuffer(snapshot));
  } catch {
    return false;
  }

  const key = pendingStorageKey();
  const write = () => {
    storage.setItem(key, payload);
    try {
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  try {
    write();
    return true;
  } catch {
    // QuotaExceeded: освобождаем старые буферы и пробуем ещё раз
    clearOversizedPendingBuffers(0);
    clearAllPendingForScope();
    try {
      write();
      return true;
    } catch {
      return false;
    }
  }
}

export function clearPendingClinicSnapshot(slug?: string): void {
  try {
    const storage = pendingStorage();
    storage?.removeItem(pendingStorageKey(slug));
    // Не трогаем чужие вкладки — только свой ключ + legacy shared
    storage?.removeItem(legacyPendingKey(slug));
    try {
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

const PENDING_BUFFER_ERROR =
  "Не удалось записать буфер несохранённых данных. Не закрывайте вкладку — дождитесь сохранения на сервер.";

/**
 * Объединить экран + буфер несохранённых правок (если есть).
 * При recovery подтягиваем pending со всех вкладок той же клиники.
 */
export function mergePendingIntoClinicSnapshot(
  local: ClinicPersistedState
): ClinicPersistedState {
  const pending = readAllPendingForScope() ?? readPendingClinicSnapshot();
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
  return readPendingClinicSnapshot() !== null || readAllPendingForScope() !== null;
}

export { PENDING_BUFFER_ERROR };
