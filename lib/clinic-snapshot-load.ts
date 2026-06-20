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

function hasNewIds<T extends { id: string }>(remote: T[], local: T[]): boolean {
  const remoteIds = new Set(remote.map((x) => x.id));
  return local.some((x) => !remoteIds.has(x.id));
}

function clinicExpensesDiffer(
  remote: ClinicPersistedState["clinicExpenses"],
  local: ClinicPersistedState["clinicExpenses"]
): boolean {
  if (hasNewIds(remote, local)) return true;
  const remoteById = new Map(remote.map((e) => [e.id, e]));
  return local.some((e) => {
    const r = remoteById.get(e.id);
    if (!r) return false;
    return (
      r.amount !== e.amount ||
      r.date !== e.date ||
      r.category !== e.category ||
      r.description !== e.description ||
      r.paidByStaffId !== e.paidByStaffId
    );
  });
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

  if (hasNewIds(remote.patients, hydrated.patients)) return true;
  if (hasNewIds(remote.appointments, hydrated.appointments)) return true;
  if (hasNewIds(remote.payments, hydrated.payments)) return true;
  if (clinicExpensesDiffer(remote.clinicExpenses, hydrated.clinicExpenses)) return true;

  return findOrphanPatientIds(remote).length > 0 && hydrated.patients.length > remote.patients.length;
}
