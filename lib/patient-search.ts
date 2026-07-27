import type { Patient } from "./types";
import { getFullName } from "./utils";

export type PatientSearchOptions = {
  matchPhone?: boolean;
  matchEmail?: boolean;
  limit?: number;
};

/** Поиск пациента по ФИО (и опционально телефону / email) */
export function patientMatchesQuery(
  patient: Patient,
  query: string,
  options: PatientSearchOptions = {}
): boolean {
  const { matchPhone = true, matchEmail = true } = options;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = getFullName(patient.firstName, patient.lastName, patient.middleName).toLowerCase();
  if (name.includes(q)) return true;
  if (matchEmail && patient.email?.toLowerCase().includes(q)) return true;
  if (matchPhone) {
    const phoneDigits = patient.phone.replace(/\D/g, "");
    const qDigits = q.replace(/\D/g, "");
    if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;
  }
  return false;
}

export function filterPatientsByQuery(
  patients: Patient[],
  query: string,
  options: PatientSearchOptions | number = {}
): Patient[] {
  const opts: PatientSearchOptions =
    typeof options === "number" ? { limit: options } : options;
  const limit = opts.limit ?? 20;
  const q = query.trim();
  if (!q) return patients.slice(0, limit);
  return patients.filter((p) => patientMatchesQuery(p, q, opts)).slice(0, limit);
}
