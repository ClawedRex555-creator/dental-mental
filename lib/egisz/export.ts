import "server-only";

import type { EgiszDocumentType } from "@/lib/egisz/types";
import type { MedicalRecord, Patient } from "@/lib/types";

/** Черновик СЭМД для стоматологического случая (упрощённый JSON до подключения XSD) */
export interface EgiszSemdDraft {
  documentType: EgiszDocumentType;
  generatedAt: string;
  organizationOid?: string;
  patient: {
    localId: string;
    familyName: string;
    givenName: string;
    middleName?: string;
    birthDate: string;
    gender: string;
    snils?: string;
  };
  encounter: {
    medicalRecordId: string;
    date: string;
    doctorId: string;
    complaints: string;
    diagnosis: string;
    treatment: string;
    recommendations?: string;
  };
}

export function buildDentalSemdDraft(
  patient: Patient,
  record: MedicalRecord,
  organizationOid?: string
): EgiszSemdDraft {
  return {
    documentType: "semd_dental_examination",
    generatedAt: new Date().toISOString(),
    organizationOid,
    patient: {
      localId: patient.id,
      familyName: patient.lastName,
      givenName: patient.firstName,
      middleName: patient.middleName,
      birthDate: patient.birthDate,
      gender: patient.gender,
      snils: patient.snils || undefined,
    },
    encounter: {
      medicalRecordId: record.id,
      date: record.createdAt,
      doctorId: record.doctorId,
      complaints: record.complaints,
      diagnosis: record.diagnosis,
      treatment: record.treatment,
      recommendations: record.recommendations,
    },
  };
}

/** Проверка готовности пациента к отправке в ЕГИСЗ */
export function validatePatientForEgisz(patient: Patient): string[] {
  const errors: string[] = [];
  if (!patient.lastName?.trim()) errors.push("Фамилия");
  if (!patient.firstName?.trim()) errors.push("Имя");
  if (!patient.birthDate) errors.push("Дата рождения");
  if (!patient.snils?.trim()) errors.push("СНИЛС");
  return errors;
}

export { buildCdaDocument } from "@/lib/egisz/cda/builder";
export {
  validateClinicForEgisz,
  validateDoctorForEgisz,
  validateMedicalRecordForEgisz,
} from "@/lib/egisz/n3/mappers";
