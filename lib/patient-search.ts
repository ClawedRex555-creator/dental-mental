import type { Patient } from "./types";
import { getFullName } from "./utils";

/** Поиск пациента по ФИО или телефону (и email) */
export function patientMatchesQuery(patient: Patient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = getFullName(patient.firstName, patient.lastName, patient.middleName).toLowerCase();
  const phoneDigits = patient.phone.replace(/\D/g, "");
  const qDigits = q.replace(/\D/g, "");
  return (
    name.includes(q) ||
    (qDigits.length >= 3 && phoneDigits.includes(qDigits)) ||
    (patient.email?.toLowerCase().includes(q) ?? false)
  );
}

export function filterPatientsByQuery(
  patients: Patient[],
  query: string,
  limit = 20
): Patient[] {
  const q = query.trim();
  if (!q) return patients.slice(0, limit);
  return patients.filter((p) => patientMatchesQuery(p, q)).slice(0, limit);
}
