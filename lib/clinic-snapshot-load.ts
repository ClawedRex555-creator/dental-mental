import {
  hasClinicData,
  mergeClinicSnapshotWithLocal,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import { findOrphanPatientIds, repairMissingPatientsInSnapshot } from "@/lib/patient-visits";
import { readPendingClinicSnapshot } from "@/lib/clinic-pending-sync";

/** Есть ли в памяти сессии данные, которые нужно слить с сервером */
export function needsMergeWithServerOnLoad(local: ClinicPersistedState): boolean {
  if (readPendingClinicSnapshot()) return true;
  return hasClinicData(local);
}

function repairIfOrphans(state: ClinicPersistedState): ClinicPersistedState {
  if (!findOrphanPatientIds(state).length) return state;
  return repairMissingPatientsInSnapshot(state);
}

/**
 * Подготовка снимка после GET /api/clinic/data.
 * Быстрый путь: серверный снимок как есть (типичный вход после purge localStorage).
 */
export function prepareSnapshotAfterServerFetch(
  remote: ClinicPersistedState,
  local: ClinicPersistedState
): ClinicPersistedState {
  if (!needsMergeWithServerOnLoad(local)) {
    return repairIfOrphans(remote);
  }

  const pending = readPendingClinicSnapshot();
  const localBase = pending ? mergeClinicSnapshotWithLocal(local, pending) : local;
  return repairIfOrphans(mergeClinicSnapshotWithLocal(remote, localBase));
}

/** Нужно ли после загрузки отправлять PUT (только реальные расхождения) */
export function shouldPushSnapshotAfterServerFetch(
  remote: ClinicPersistedState,
  hydrated: ClinicPersistedState
): boolean {
  if (readPendingClinicSnapshot()) return true;
  if (!needsMergeWithServerOnLoad(hydrated)) return false;

  const remoteIds = new Set(remote.patients.map((p) => p.id));
  if (hydrated.patients.some((p) => !remoteIds.has(p.id))) return true;

  const remoteApt = new Set(remote.appointments.map((a) => a.id));
  if (hydrated.appointments.some((a) => !remoteApt.has(a.id))) return true;

  return findOrphanPatientIds(remote).length > 0 && hydrated.patients.length > remote.patients.length;
}
