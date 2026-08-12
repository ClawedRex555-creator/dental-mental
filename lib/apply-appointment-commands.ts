import {
  mergePatientPreferLocalPreservePhi,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  derivePatientVisitFields,
  isRestoredPatientStub,
} from "@/lib/patient-visits";
import { validateAppointmentSave } from "@/lib/validate-appointment-save";
import type { Appointment, AppointmentStatus, Patient } from "@/lib/types";

export type ApplyAppointmentResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      appointmentId: string;
      alreadyApplied: boolean;
    };

function withPatientVisitFields(
  patients: Patient[],
  appointments: Appointment[],
  patientId: string
): Patient[] {
  const patient = patients.find((p) => p.id === patientId);
  if (!patient) return patients;
  const fields = derivePatientVisitFields(patient, appointments);
  return patients.map((p) => (p.id === patientId ? { ...p, ...fields } : p));
}

/** Вставить/обновить пациента в снимке (заглушка уступает реальной карточке). */
export function upsertPatientInPersistedState(
  state: ClinicPersistedState,
  patient: Patient
): ClinicPersistedState {
  const existing = state.patients.find((p) => p.id === patient.id);
  if (!existing) {
    return {
      ...state,
      patients: [...state.patients, patient],
      deletedPatientIds: (state.deletedPatientIds ?? []).filter((id) => id !== patient.id),
    };
  }
  const merged =
    isRestoredPatientStub(existing) && !isRestoredPatientStub(patient)
      ? mergePatientPreferLocalPreservePhi(existing, patient)
      : isRestoredPatientStub(patient) && !isRestoredPatientStub(existing)
        ? existing
        : mergePatientPreferLocalPreservePhi(existing, patient);
  return {
    ...state,
    patients: state.patients.map((p) => (p.id === patient.id ? merged : p)),
    deletedPatientIds: (state.deletedPatientIds ?? []).filter((id) => id !== patient.id),
  };
}

function appointmentsEqual(a: Appointment, b: Appointment): boolean {
  return (
    a.id === b.id &&
    a.patientId === b.patientId &&
    a.doctorId === b.doctorId &&
    a.assistantId === b.assistantId &&
    a.assistantHours === b.assistantHours &&
    a.serviceId === b.serviceId &&
    a.cabinetId === b.cabinetId &&
    a.date === b.date &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.durationMinutes === b.durationMinutes &&
    a.status === b.status &&
    a.complaints === b.complaints &&
    a.reason === b.reason &&
    a.comment === b.comment &&
    a.price === b.price &&
    a.paymentStatus === b.paymentStatus &&
    a.workActId === b.workActId &&
    a.isOtherClinicVisit === b.isOtherClinicVisit
  );
}

/** Создать запись (идемпотентно по id). */
export function applyCreateAppointmentToPersistedState(
  state: ClinicPersistedState,
  appointment: Appointment,
  patient?: Patient | null
): ApplyAppointmentResult {
  if (!appointment.id?.trim()) {
    return { ok: false, error: "Не указан id записи" };
  }
  if (!appointment.patientId?.trim()) {
    return { ok: false, error: "Не указан пациент" };
  }
  if (!appointment.date?.trim() || !appointment.startTime?.trim()) {
    return { ok: false, error: "Не указаны дата и время" };
  }

  const existing = state.appointments.find((a) => a.id === appointment.id);
  if (existing) {
    return {
      ok: true,
      state,
      appointmentId: appointment.id,
      alreadyApplied: true,
    };
  }

  let nextState = state;
  if (patient && patient.id === appointment.patientId) {
    nextState = upsertPatientInPersistedState(nextState, patient);
  }

  const hasPatient = nextState.patients.some((p) => p.id === appointment.patientId);
  if (!hasPatient) {
    return {
      ok: false,
      error: "Пациент не найден. Сначала сохраните карточку пациента.",
    };
  }

  const conflictError = validateAppointmentSave(
    nextState.appointments,
    appointment,
    nextState.patients,
    nextState.doctors
  );
  if (conflictError) {
    return { ok: false, error: conflictError };
  }

  const appointments = [appointment, ...nextState.appointments];
  return {
    ok: true,
    state: {
      ...nextState,
      appointments,
      patients: withPatientVisitFields(nextState.patients, appointments, appointment.patientId),
      deletedAppointmentIds: (nextState.deletedAppointmentIds ?? []).filter(
        (tombstoneId) => tombstoneId !== appointment.id
      ),
    },
    appointmentId: appointment.id,
    alreadyApplied: false,
  };
}

/** Убрать undefined — иначе full payload с parseAppointmentPayload затирал comment/external*.
 *  null на опциональных полях = явное снятие (workActId, assistantId, …). */
export type AppointmentCommandPatch = {
  [K in keyof Appointment]?: Appointment[K] | null;
};

function applyAppointmentPatch(
  current: Appointment,
  patch: AppointmentCommandPatch
): Appointment {
  const next: Appointment = { ...current, id: current.id };
  const mutable = next as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch) as [
    keyof Appointment,
    unknown,
  ][]) {
    if (key === "id") continue;
    if (value === undefined) continue;
    if (value === null) {
      delete mutable[key as string];
      continue;
    }
    mutable[key as string] = value;
  }
  return next;
}

/** Обновить запись (частичный patch поверх существующей). */
export function applyUpdateAppointmentToPersistedState(
  state: ClinicPersistedState,
  appointmentId: string,
  patch: AppointmentCommandPatch
): ApplyAppointmentResult {
  const id = appointmentId.trim();
  if (!id) return { ok: false, error: "Не указана запись" };

  const current = state.appointments.find((a) => a.id === id);
  if (!current) return { ok: false, error: "Запись не найдена" };

  const next = applyAppointmentPatch(current, patch);
  if (appointmentsEqual(current, next)) {
    return {
      ok: true,
      state,
      appointmentId: id,
      alreadyApplied: true,
    };
  }

  // Смена только статуса/полей без сдвига слота — не блокируем конфликтом
  // (иначе «Пришёл»/«Завершён» молча не применялся при старых пересечениях).
  const slotChanged =
    current.date !== next.date ||
    current.startTime !== next.startTime ||
    current.endTime !== next.endTime ||
    current.doctorId !== next.doctorId ||
    current.cabinetId !== next.cabinetId ||
    current.patientId !== next.patientId;

  if (slotChanged) {
    const conflictError = validateAppointmentSave(
      state.appointments,
      next,
      state.patients,
      state.doctors
    );
    if (conflictError) {
      return { ok: false, error: conflictError };
    }
  }

  const appointments = state.appointments.map((a) => (a.id === id ? next : a));
  const patientId = next.patientId;
  return {
    ok: true,
    state: {
      ...state,
      appointments,
      patients: withPatientVisitFields(state.patients, appointments, patientId),
    },
    appointmentId: id,
    alreadyApplied: false,
  };
}

/** Отменить запись (status=cancelled). */
export function applyCancelAppointmentToPersistedState(
  state: ClinicPersistedState,
  appointmentId: string
): ApplyAppointmentResult {
  const id = appointmentId.trim();
  if (!id) return { ok: false, error: "Не указана запись" };

  const current = state.appointments.find((a) => a.id === id);
  if (!current) return { ok: false, error: "Запись не найдена" };

  if (current.status === ("cancelled" satisfies AppointmentStatus)) {
    return {
      ok: true,
      state,
      appointmentId: id,
      alreadyApplied: true,
    };
  }

  return applyUpdateAppointmentToPersistedState(state, id, { status: "cancelled" });
}
