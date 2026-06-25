import {
  doctorScheduleKey,
  hasClinicData,
  hasEntityIdsNotInIncoming,
  mergeClinicSnapshotWithLocal,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import { findOrphanPatientIds, repairMissingPatientsInSnapshot } from "@/lib/patient-visits";
import { readPendingClinicSnapshot } from "@/lib/clinic-pending-sync";
import type { Appointment } from "@/lib/types";

/** Есть ли в памяти сессии данные, которые нужно слить с сервером */
export function needsMergeWithServerOnLoad(
  local: ClinicPersistedState,
  options?: { serverDatabaseMode?: boolean }
): boolean {
  if (readPendingClinicSnapshot()) return true;
  if (options?.serverDatabaseMode) return false;
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

function doctorSchedulesDiffer(
  remote: ClinicPersistedState["doctorSchedules"],
  local: ClinicPersistedState["doctorSchedules"]
): boolean {
  const remoteByKey = new Map(remote.map((s) => [doctorScheduleKey(s), s]));
  const localByKey = new Map(local.map((s) => [doctorScheduleKey(s), s]));

  for (const [key, remoteSch] of remoteByKey) {
    const localSch = localByKey.get(key);
    if (!localSch) return true;
    if (remoteSch.updatedAt !== localSch.updatedAt) return true;
    if (JSON.stringify(remoteSch.days) !== JSON.stringify(localSch.days)) return true;
  }
  for (const key of localByKey.keys()) {
    if (!remoteByKey.has(key)) return true;
  }
  return false;
}

function appointmentsDiffer(remote: Appointment[], local: Appointment[]): boolean {
  const remoteById = new Map(remote.map((a) => [a.id, a]));
  return local.some((a) => {
    const r = remoteById.get(a.id);
    if (!r) return false;
    return (
      r.doctorId !== a.doctorId ||
      r.assistantId !== a.assistantId ||
      r.date !== a.date ||
      r.startTime !== a.startTime ||
      r.endTime !== a.endTime ||
      r.status !== a.status ||
      r.paymentStatus !== a.paymentStatus ||
      r.workActId !== a.workActId ||
      r.assistantHours !== a.assistantHours
    );
  });
}

/** Есть ли на сервере изменения относительно последнего известного снимка (не текущих правок вкладки) */
export function serverSnapshotHasIncomingUpdates(
  remote: ClinicPersistedState,
  baseline: ClinicPersistedState
): boolean {
  if (hasEntityIdsNotInIncoming(remote.patients, baseline.patients)) return true;
  if (hasEntityIdsNotInIncoming(remote.appointments, baseline.appointments)) return true;
  if (hasEntityIdsNotInIncoming(remote.workActs, baseline.workActs)) return true;
  if (hasEntityIdsNotInIncoming(remote.payments, baseline.payments)) return true;
  if (hasEntityIdsNotInIncoming(remote.invoices, baseline.invoices)) return true;
  if (hasEntityIdsNotInIncoming(remote.medicalRecords, baseline.medicalRecords)) return true;
  if (hasEntityIdsNotInIncoming(remote.treatmentPlans, baseline.treatmentPlans)) return true;
  if (appointmentsDiffer(remote.appointments, baseline.appointments)) return true;
  if (clinicExpensesDiffer(remote.clinicExpenses, baseline.clinicExpenses)) return true;
  if (doctorSchedulesDiffer(remote.doctorSchedules, baseline.doctorSchedules)) return true;
  return false;
}

/**
 * Подготовка снимка после GET /api/clinic/data.
 * Быстрый путь: серверный снимок как есть (типичный вход после purge localStorage).
 */
export function prepareSnapshotAfterServerFetch(
  remote: ClinicPersistedState,
  local: ClinicPersistedState,
  options?: { serverDatabaseMode?: boolean }
): ClinicPersistedState {
  if (!needsMergeWithServerOnLoad(local, options)) {
    return repairIfOrphans(remote);
  }

  const pending = readPendingClinicSnapshot();
  const localBase = pending ? mergeClinicSnapshotWithLocal(local, pending) : local;
  return repairIfOrphans(mergeClinicSnapshotWithLocal(remote, localBase));
}

/** Нужно ли после загрузки отправлять PUT (только реальные расхождения) */
export function shouldPushSnapshotAfterServerFetch(
  remote: ClinicPersistedState,
  hydrated: ClinicPersistedState,
  options?: { serverDatabaseMode?: boolean }
): boolean {
  if (readPendingClinicSnapshot()) return true;
  if (!needsMergeWithServerOnLoad(hydrated, options)) return false;

  if (hasNewIds(remote.patients, hydrated.patients)) return true;
  if (hasNewIds(remote.appointments, hydrated.appointments)) return true;
  if (appointmentsDiffer(remote.appointments, hydrated.appointments)) return true;
  if (hasNewIds(remote.workActs, hydrated.workActs)) return true;
  if (hasNewIds(remote.invoices, hydrated.invoices)) return true;
  if (hasNewIds(remote.payments, hydrated.payments)) return true;
  if (clinicExpensesDiffer(remote.clinicExpenses, hydrated.clinicExpenses)) return true;
  if (doctorSchedulesDiffer(remote.doctorSchedules, hydrated.doctorSchedules)) return true;

  return findOrphanPatientIds(remote).length > 0 && hydrated.patients.length > remote.patients.length;
}
