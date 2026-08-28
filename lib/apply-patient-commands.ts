import {
  mergePatientPreferLocalPreservePhi,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import type { Patient } from "@/lib/types";

export type ApplyPatientResult =
  | { ok: false; error: string }
  | {
      ok: true;
      state: ClinicPersistedState;
      patientId: string;
      alreadyApplied: boolean;
    };

function patientsEqual(a: Patient, b: Patient): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Создать/обновить карточку пациента в снимке.
 * Клиентская карточка побеждает (пустой PHI не затирает серверный).
 */
export function applyUpsertPatientToPersistedState(
  state: ClinicPersistedState,
  patient: Patient
): ApplyPatientResult {
  const id = patient.id?.trim();
  if (!id) return { ok: false, error: "Не указан пациент" };
  if (!patient.firstName?.trim() || !patient.lastName?.trim()) {
    return { ok: false, error: "Укажите фамилию и имя" };
  }

  const existing = state.patients.find((p) => p.id === id);
  if (existing && patientsEqual(existing, patient)) {
    return {
      ok: true,
      state,
      patientId: id,
      alreadyApplied: true,
    };
  }

  const nextPatient = existing
    ? mergePatientPreferLocalPreservePhi(existing, { ...patient, id })
    : { ...patient, id };

  return {
    ok: true,
    state: {
      ...state,
      patients: existing
        ? state.patients.map((p) => (p.id === id ? nextPatient : p))
        : [nextPatient, ...state.patients],
      deletedPatientIds: (state.deletedPatientIds ?? []).filter((tombstoneId) => tombstoneId !== id),
    },
    patientId: id,
    alreadyApplied: false,
  };
}

/**
 * Удалить пациента и связанные сущности (как deletePatient в store).
 * Tombstones: patient, appointments, work acts, medical records, treatment plans.
 */
export function applyDeletePatientToPersistedState(
  state: ClinicPersistedState,
  patientId: string
): ApplyPatientResult {
  const id = patientId?.trim();
  if (!id) return { ok: false, error: "Не указан пациент" };

  const exists = state.patients.some((p) => p.id === id);
  const alreadyTombstoned = (state.deletedPatientIds ?? []).includes(id);
  if (!exists) {
    if (alreadyTombstoned) {
      return { ok: true, state, patientId: id, alreadyApplied: true };
    }
    return { ok: false, error: "Пациент не найден" };
  }

  const { [id]: _removedTeeth, ...teethByPatient } = state.teethByPatient;
  void _removedTeeth;

  const removedAppointmentIds = state.appointments
    .filter((a) => a.patientId === id)
    .map((a) => a.id);
  const removedWorkActIds = state.workActs
    .filter((a) => a.patientId === id)
    .map((a) => a.id);
  const removedMedicalRecordIds = state.medicalRecords
    .filter((r) => r.patientId === id)
    .map((r) => r.id);
  const removedTreatmentPlanIds = state.treatmentPlans
    .filter((p) => p.patientId === id)
    .map((p) => p.id);
  const removedTreatmentPlanCaseIds = (state.treatmentPlanCases ?? [])
    .filter((c) => c.patientId === id)
    .map((c) => c.id);

  return {
    ok: true,
    state: {
      ...state,
      patients: state.patients.filter((p) => p.id !== id),
      appointments: state.appointments.filter((a) => a.patientId !== id),
      medicalRecords: state.medicalRecords.filter((r) => r.patientId !== id),
      treatmentPlans: state.treatmentPlans.filter((p) => p.patientId !== id),
      treatmentPlanCases: (state.treatmentPlanCases ?? []).filter(
        (c) => c.patientId !== id
      ),
      payments: state.payments.filter((p) => p.patientId !== id),
      invoices: state.invoices.filter((i) => i.patientId !== id),
      workActs: state.workActs.filter((a) => a.patientId !== id),
      prepayments: state.prepayments.filter((p) => p.patientId !== id),
      patientFiles: state.patientFiles.filter((f) => f.patientId !== id),
      patientNotes: state.patientNotes.filter((n) => n.patientId !== id),
      teethByPatient,
      deletedPatientIds: [...new Set([...(state.deletedPatientIds ?? []), id])],
      deletedAppointmentIds: [
        ...new Set([...(state.deletedAppointmentIds ?? []), ...removedAppointmentIds]),
      ],
      deletedWorkActIds: [
        ...new Set([...(state.deletedWorkActIds ?? []), ...removedWorkActIds]),
      ],
      deletedMedicalRecordIds: [
        ...new Set([...(state.deletedMedicalRecordIds ?? []), ...removedMedicalRecordIds]),
      ],
      deletedTreatmentPlanIds: [
        ...new Set([...(state.deletedTreatmentPlanIds ?? []), ...removedTreatmentPlanIds]),
      ],
      deletedTreatmentPlanCaseIds: [
        ...new Set([
          ...(state.deletedTreatmentPlanCaseIds ?? []),
          ...removedTreatmentPlanCaseIds,
        ]),
      ],
    },
    patientId: id,
    alreadyApplied: false,
  };
}
