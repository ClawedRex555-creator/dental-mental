import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { derivePatientVisitFields } from "@/lib/patient-visits";
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
  appointment: Appointment
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

  const conflictError = validateAppointmentSave(
    state.appointments,
    appointment,
    state.patients,
    state.doctors
  );
  if (conflictError) {
    return { ok: false, error: conflictError };
  }

  const appointments = [appointment, ...state.appointments];
  return {
    ok: true,
    state: {
      ...state,
      appointments,
      patients: withPatientVisitFields(state.patients, appointments, appointment.patientId),
      deletedAppointmentIds: (state.deletedAppointmentIds ?? []).filter(
        (tombstoneId) => tombstoneId !== appointment.id
      ),
    },
    appointmentId: appointment.id,
    alreadyApplied: false,
  };
}

/** Обновить запись (частичный patch поверх существующей). */
export function applyUpdateAppointmentToPersistedState(
  state: ClinicPersistedState,
  appointmentId: string,
  patch: Partial<Appointment>
): ApplyAppointmentResult {
  const id = appointmentId.trim();
  if (!id) return { ok: false, error: "Не указана запись" };

  const current = state.appointments.find((a) => a.id === id);
  if (!current) return { ok: false, error: "Запись не найдена" };

  const next: Appointment = { ...current, ...patch, id };
  if (appointmentsEqual(current, next)) {
    return {
      ok: true,
      state,
      appointmentId: id,
      alreadyApplied: true,
    };
  }

  const conflictError = validateAppointmentSave(
    state.appointments,
    next,
    state.patients,
    state.doctors
  );
  if (conflictError) {
    return { ok: false, error: conflictError };
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
