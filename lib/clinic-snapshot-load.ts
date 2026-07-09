import {
  applyDeletedServiceTombstones,
  applyDeletedLegalDocumentTombstones,
  doctorScheduleKey,
  applyDeletedWorkActTombstones,
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

function entitiesContentDiffer<T extends { id: string }>(remote: T[], baseline: T[]): boolean {
  const remoteById = new Map(remote.map((x) => [x.id, x]));
  for (const b of baseline) {
    const r = remoteById.get(b.id);
    if (!r) continue;
    if (JSON.stringify(r) !== JSON.stringify(b)) return true;
  }
  return false;
}

function serverEntityListChanged<T extends { id: string }>(
  remote: T[],
  baseline: T[]
): boolean {
  return (
    hasEntityIdsNotInIncoming(remote, baseline) ||
    hasEntityIdsNotInIncoming(baseline, remote) ||
    entitiesContentDiffer(remote, baseline)
  );
}

/** Снимок после pull: без локальных правок побеждает сервер */
export function mergeRemoteSnapshotForPull(
  remote: ClinicPersistedState,
  local: ClinicPersistedState,
  hasUnsavedUserEdits: boolean
): ClinicPersistedState {
  const deletedWorkActIds = [
    ...new Set([
      ...(remote.deletedWorkActIds ?? []),
      ...(local.deletedWorkActIds ?? []),
    ]),
  ];
  const base = !hasUnsavedUserEdits
    ? remote
    : mergeClinicSnapshotWithLocal(remote, local);
  const deletedLegalDocumentIds = [
    ...new Set([
      ...(remote.deletedLegalDocumentIds ?? []),
      ...(local.deletedLegalDocumentIds ?? []),
    ]),
  ];
  const deletedServiceIds = [
    ...new Set([
      ...(remote.deletedServiceIds ?? []),
      ...(local.deletedServiceIds ?? []),
    ]),
  ];
  return repairIfOrphans(
    applyDeletedWorkActTombstones(
      applyDeletedServiceTombstones(
        applyDeletedLegalDocumentTombstones(
          { ...base, deletedWorkActIds, deletedLegalDocumentIds, deletedServiceIds },
          deletedLegalDocumentIds
        ),
        deletedServiceIds
      ),
      deletedWorkActIds
    )
  );
}

/** Есть ли на сервере изменения относительно baseline (обычно текущий экран) */
export function serverSnapshotHasIncomingUpdates(
  remote: ClinicPersistedState,
  baseline: ClinicPersistedState
): boolean {
  if (serverEntityListChanged(remote.patients, baseline.patients)) return true;
  if (serverEntityListChanged(remote.appointments, baseline.appointments)) return true;
  if (serverEntityListChanged(remote.workActs, baseline.workActs)) return true;
  if (serverEntityListChanged(remote.payments, baseline.payments)) return true;
  if (serverEntityListChanged(remote.invoices, baseline.invoices)) return true;
  if (serverEntityListChanged(remote.medicalRecords, baseline.medicalRecords)) return true;
  if (serverEntityListChanged(remote.treatmentPlans, baseline.treatmentPlans)) return true;
  if (serverEntityListChanged(remote.onlineBookings, baseline.onlineBookings)) return true;
  if (serverEntityListChanged(remote.prepayments, baseline.prepayments)) return true;
  if (serverEntityListChanged(remote.patientNotes, baseline.patientNotes)) return true;
  if (appointmentsDiffer(remote.appointments, baseline.appointments)) return true;
  if (clinicExpensesDiffer(remote.clinicExpenses, baseline.clinicExpenses)) return true;
  if (doctorSchedulesDiffer(remote.doctorSchedules, baseline.doctorSchedules)) return true;
  if (serverEntityListChanged(remote.doctors, baseline.doctors)) return true;
  if (serverEntityListChanged(remote.services, baseline.services)) return true;
  if (serverEntityListChanged(remote.cabinets, baseline.cabinets)) return true;
  if (serverEntityListChanged(remote.patientFiles, baseline.patientFiles)) return true;
  if (serverEntityListChanged(remote.tasks, baseline.tasks)) return true;
  if (serverEntityListChanged(remote.warehouse, baseline.warehouse)) return true;
  if (serverEntityListChanged(remote.legalDocuments, baseline.legalDocuments)) return true;
  if (serverEntityListChanged(remote.documentTemplates, baseline.documentTemplates)) return true;
  if (
    JSON.stringify(remote.assistantManualHours) !==
    JSON.stringify(baseline.assistantManualHours)
  ) {
    return true;
  }
  if (
    JSON.stringify(remote.teethByPatient) !== JSON.stringify(baseline.teethByPatient)
  ) {
    return true;
  }
  if (
    JSON.stringify(remote.clinicSettings) !== JSON.stringify(baseline.clinicSettings)
  ) {
    return true;
  }
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
  if (hasNewIds(remote.legalDocuments, hydrated.legalDocuments)) return true;
  if (hasNewIds(hydrated.legalDocuments, remote.legalDocuments)) return true;
  if (hasNewIds(remote.invoices, hydrated.invoices)) return true;
  if (hasNewIds(remote.payments, hydrated.payments)) return true;
  if (clinicExpensesDiffer(remote.clinicExpenses, hydrated.clinicExpenses)) return true;
  if (hasNewIds(remote.doctors, hydrated.doctors)) return true;
  if (hasNewIds(remote.services, hydrated.services)) return true;
  if (hasNewIds(remote.cabinets, hydrated.cabinets)) return true;
  if (doctorSchedulesDiffer(remote.doctorSchedules, hydrated.doctorSchedules)) return true;

  return findOrphanPatientIds(remote).length > 0 && hydrated.patients.length > remote.patients.length;
}
