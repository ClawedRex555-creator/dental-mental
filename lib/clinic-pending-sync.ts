import {
  hasClinicData,
  parseClinicPersistedState,
  pickPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import { CLINIC_STORAGE_KEY } from "@/lib/initial-clinic-data";

const PENDING_SESSION_KEY = "dc-clinic-pending-snapshot";

/** Сохранить PHI из localStorage в sessionStorage до purge (одна вкладка, до успешного PUT) */
export function backupPhiSnapshotBeforeDbMode(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(CLINIC_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const state = parsed.state ?? (parsed as Record<string, unknown>);
    const snapshot = pickPersistedState(state as Parameters<typeof pickPersistedState>[0]);
    if (!hasClinicData(snapshot)) return;
    sessionStorage.setItem(PENDING_SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readPendingClinicSnapshot(): ClinicPersistedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_SESSION_KEY);
    if (!raw) return null;
    return parseClinicPersistedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writePendingClinicSnapshot(snapshot: ClinicPersistedState): void {
  if (typeof window === "undefined") return;
  if (!hasClinicData(snapshot)) return;
  try {
    sessionStorage.setItem(PENDING_SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

export function clearPendingClinicSnapshot(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
