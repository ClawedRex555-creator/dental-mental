import { digitsOnly } from "./document-validation.ts";
import { normalizePhoneInput } from "./phone-utils.ts";
import type { Patient } from "./types.ts";

export type PatientDuplicateReason = "phone" | "snils" | "passport" | "identity";

export interface PatientDuplicateMatch {
  patient: Patient;
  reason: PatientDuplicateReason;
}

export const PATIENT_DUPLICATE_REASON_LABELS: Record<PatientDuplicateReason, string> = {
  phone: "совпадает номер телефона",
  snils: "совпадает СНИЛС",
  passport: "совпадают серия и номер паспорта",
  identity: "совпадают ФИО и дата рождения",
};

export interface PatientDuplicateCandidate {
  phone: string;
  snils?: string;
  passportSeries?: string;
  passportNumber?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  birthDate: string;
}

function normName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function phoneKey(phone: string): string {
  return digitsOnly(normalizePhoneInput(phone));
}

function passportKey(series?: string, number?: string): string {
  const s = digitsOnly(series ?? "");
  const n = digitsOnly(number ?? "");
  if (s.length !== 4 || n.length !== 6) return "";
  return `${s}${n}`;
}

function identityKey(
  lastName: string,
  firstName: string,
  middleName: string | undefined,
  birthDate: string
): string {
  const parts = [
    normName(lastName),
    normName(firstName),
    normName(middleName ?? ""),
    birthDate.trim(),
  ];
  if (!parts[0] || !parts[1] || !parts[3]) return "";
  return parts.join("|");
}

/** Ищет существующего пациента с теми же идентифицирующими данными. */
export function findDuplicatePatient(
  patients: Patient[],
  candidate: PatientDuplicateCandidate,
  excludePatientId?: string
): PatientDuplicateMatch | null {
  const candPhone = phoneKey(candidate.phone);
  const candSnils = digitsOnly(candidate.snils ?? "");
  const candPassport = passportKey(candidate.passportSeries, candidate.passportNumber);
  const candIdentity = identityKey(
    candidate.lastName,
    candidate.firstName,
    candidate.middleName,
    candidate.birthDate
  );

  for (const p of patients) {
    if (excludePatientId && p.id === excludePatientId) continue;

    if (candPhone.length >= 11 && phoneKey(p.phone) === candPhone) {
      return { patient: p, reason: "phone" };
    }

    const pSnils = digitsOnly(p.snils ?? "");
    if (candSnils.length === 11 && pSnils.length === 11 && pSnils === candSnils) {
      return { patient: p, reason: "snils" };
    }

    const pPassport = passportKey(p.passportSeries, p.passportNumber);
    if (candPassport && pPassport === candPassport) {
      return { patient: p, reason: "passport" };
    }

    const pIdentity = identityKey(p.lastName, p.firstName, p.middleName, p.birthDate);
    if (candIdentity && pIdentity === candIdentity) {
      return { patient: p, reason: "identity" };
    }
  }

  return null;
}
