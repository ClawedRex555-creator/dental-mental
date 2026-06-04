import type { Appointment, AppointmentStatus, Patient } from "@/lib/types";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { format } from "date-fns";

/** Пациент реально был на приёме в нашей клинике */
export const CLINIC_VISIT_STATUSES: AppointmentStatus[] = [
  "arrived",
  "in_progress",
  "completed",
  "ready_for_payment",
];

const UPCOMING_STATUSES: AppointmentStatus[] = ["scheduled", "confirmed"];

export function getPatientAppointments(
  appointments: Appointment[],
  patientId: string
): Appointment[] {
  return appointments.filter((a) => a.patientId === patientId);
}

export function isOurClinicVisit(apt: Appointment): boolean {
  return !apt.isOtherClinicVisit && CLINIC_VISIT_STATUSES.includes(apt.status);
}

export function otherClinicVisitId(patientId: string): string {
  return `apt-other-${patientId}`;
}

export function buildOtherClinicVisitAppointment(
  patient: Pick<Patient, "id" | "createdAt" | "previousVisitsNote">
): Appointment {
  const note = patient.previousVisitsNote?.trim();
  return {
    id: otherClinicVisitId(patient.id),
    patientId: patient.id,
    date: patient.createdAt,
    startTime: "12:00",
    endTime: "12:00",
    durationMinutes: 0,
    status: "completed",
    complaints: note || undefined,
    reason: "Приём в другой клинике (до нашей клиники)",
    comment: "Добавлено из карточки пациента",
    price: 0,
    paymentStatus: "paid",
    isOtherClinicVisit: true,
  };
}

/** Синхронизирует запись в истории визитов с галочкой «был в другой клинике». */
export function syncOtherClinicVisitsInList(
  appointments: Appointment[],
  patient: Pick<Patient, "id" | "hadPreviousVisits" | "previousVisitsNote" | "createdAt">
): Appointment[] {
  const visitId = otherClinicVisitId(patient.id);
  const rest = appointments.filter((a) => a.id !== visitId);
  if (!patient.hadPreviousVisits) return rest;
  return [buildOtherClinicVisitAppointment(patient), ...rest];
}

export function countClinicVisits(appointments: Appointment[], patientId: string): number {
  return getPatientAppointments(appointments, patientId).filter(isOurClinicVisit).length;
}

function latestDate(dates: string[]): string | undefined {
  if (!dates.length) return undefined;
  return dates.sort((a, b) => b.localeCompare(a))[0];
}

function earliestFutureDate(dates: string[], today: string): string | undefined {
  const future = dates.filter((d) => d >= today).sort((a, b) => a.localeCompare(b));
  return future[0];
}

/** Поля карточки из расписания приёмов (не затирает ручную отметку «другая клиника») */
export function derivePatientVisitFields(
  patient: Patient,
  appointments: Appointment[],
  today = format(new Date(), "yyyy-MM-dd")
): Partial<Patient> {
  const mine = getPatientAppointments(appointments, patient.id);
  const visited = mine.filter(isOurClinicVisit);
  const upcoming = mine.filter((a) => UPCOMING_STATUSES.includes(a.status));

  const lastVisitDate = latestDate(visited.map((a) => a.date)) ?? patient.lastVisitDate;
  const nextVisitDate =
    earliestFutureDate(upcoming.map((a) => a.date), today) ?? patient.nextVisitDate;

  return { lastVisitDate, nextVisitDate };
}

export function findOrphanPatientIds(state: ClinicPersistedState): string[] {
  const ids = new Set(state.patients.map((p) => p.id));
  const orphan = new Set<string>();
  const refs: Array<{ patientId?: string }> = [
    ...state.appointments,
    ...state.medicalRecords,
    ...state.treatmentPlans,
    ...state.payments,
    ...state.workActs,
    ...state.prepayments,
    ...state.patientFiles,
    ...state.patientNotes,
  ];
  for (const row of refs) {
    if (row.patientId && !ids.has(row.patientId)) orphan.add(row.patientId);
  }
  for (const pid of Object.keys(state.teethByPatient)) {
    if (!ids.has(pid)) orphan.add(pid);
  }
  return [...orphan];
}

/** Карточка-заглушка для patientId, оставшегося только в приёмах после сбоя синхронизации */
export function buildRestoredPatientStub(
  patientId: string,
  state: ClinicPersistedState
): Patient {
  const apts = getPatientAppointments(state.appointments, patientId);
  const sorted = [...apts].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
  const last = sorted[0];
  const visitCount = countClinicVisits(state.appointments, patientId);

  return {
    id: patientId,
    firstName: "Уточните",
    lastName: "имя",
    phone: "+7",
    birthDate: "1990-01-01",
    gender: "female",
    source: "Повторный пациент",
    status: "active",
    disability: "not_specified",
    createdAt: format(new Date(), "yyyy-MM-dd"),
    balance: 0,
    totalSpent: 0,
    hadPreviousVisits: visitCount > 0,
    previousVisitsNote:
      visitCount > 0
        ? `Автовосстановление: ${visitCount} приём(ов) в расписании. Заполните ФИО и телефон.`
        : "Автовосстановление по связанным записям. Заполните ФИО и телефон.",
    lastVisitDate: last && CLINIC_VISIT_STATUSES.includes(last.status) ? last.date : undefined,
    nextVisitDate: last && UPCOMING_STATUSES.includes(last.status) ? last.date : undefined,
    notes: "Карточка восстановлена автоматически — проверьте данные пациента.",
  };
}

/** Восстановить пациентов, на которых ссылаются приёмы и другие сущности */
export function repairMissingPatientsInSnapshot(
  state: ClinicPersistedState
): ClinicPersistedState {
  const orphanIds = findOrphanPatientIds(state);
  if (!orphanIds.length) return state;

  const stubs = orphanIds.map((id) => {
    const existingStub = state.patients.find((p) => p.id === id);
    if (existingStub) return existingStub;
    return buildRestoredPatientStub(id, state);
  });

  const mergedPatients = [...state.patients];
  for (const stub of stubs) {
    if (!mergedPatients.some((p) => p.id === stub.id)) mergedPatients.push(stub);
  }

  const orphanSet = new Set(orphanIds);
  return {
    ...state,
    patients: mergedPatients.map((p) =>
      orphanSet.has(p.id) ? { ...p, ...derivePatientVisitFields(p, state.appointments) } : p
    ),
  };
}

/**
 * В снимке на сохранение остались приёмы без карточки пациента.
 * Сверяем только incoming — иначе легитимное удаление пациента блокируется,
 * если на сервере ещё есть старые приёмы (их снимет mergeClinicDataForSave).
 */
export function patientsLostButAppointmentsRemain(
  _existing: ClinicPersistedState,
  incoming: ClinicPersistedState
): boolean {
  const incomingPatientIds = new Set(incoming.patients.map((p) => p.id));
  return incoming.appointments.some(
    (a) => a.patientId && !incomingPatientIds.has(a.patientId)
  );
}
