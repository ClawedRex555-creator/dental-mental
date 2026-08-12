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
