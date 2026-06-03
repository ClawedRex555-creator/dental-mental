import "server-only";

import type { ClinicSettings, Doctor, MedicalRecord, Patient } from "@/lib/types";
import { mapGenderToEgisz } from "@/lib/egisz/cda/constants";
import type { N3MedDocumentDto, N3PatientDto } from "@/lib/egisz/n3/types";
import type { EgiszClinicConfig } from "@/lib/egisz/types";

function splitDoctorName(name: string): {
  familyName: string;
  givenName: string;
  middleName?: string;
} {
  const parts = name.trim().split(/\s+/);
  return {
    familyName: parts[0] ?? name,
    givenName: parts[1] ?? "—",
    middleName: parts.slice(2).join(" ") || undefined,
  };
}

export function mapPatientToN3(patient: Patient): N3PatientDto {
  return {
    idPatientMis: patient.id,
    familyName: patient.lastName.trim(),
    givenName: patient.firstName.trim(),
    middleName: patient.middleName?.trim() || undefined,
    birthDate: patient.birthDate.slice(0, 10),
    sex: mapGenderToEgisz(patient.gender),
    snils: patient.snils?.replace(/\D/g, "") ?? "",
    phone: patient.phone?.trim() || undefined,
    address: patient.address?.trim() || undefined,
    documentSeries: patient.passportSeries?.trim() || undefined,
    documentNumber: patient.passportNumber?.trim() || undefined,
  };
}

export function mapMedDocumentToN3(input: {
  record: MedicalRecord;
  config: EgiszClinicConfig;
  cdaXml: string;
  signedBase64: string;
}): N3MedDocumentDto {
  const docOid = input.config.documentOid ?? "1.2.643.5.1.13.13.14.1.9.1.181";
  return {
    idDocumentMis: input.record.id,
    idDocumentType: docOid,
    header: `Протокол консультации / ${input.record.serviceName ?? "стоматологический приём"}`,
    cdaXml: input.cdaXml,
    signedBase64: input.signedBase64,
    mimeType: "application/xml",
  };
}

export function validateDoctorForEgisz(
  doctor: Doctor,
  options?: { requireCert?: boolean }
): string[] {
  const errors: string[] = [];
  if (!doctor.name?.trim()) errors.push("ФИО врача");
  if (!doctor.snils?.trim()) errors.push("СНИЛС врача");
  if (!doctor.frmrOid?.trim()) errors.push("OID ФРМР врача");
  if (!doctor.positionCode?.trim()) errors.push("Код должности врача (NSI)");
  if (options?.requireCert && !doctor.certThumbprint?.trim()) {
    errors.push("Отпечаток КЭП врача (карточка сотрудника)");
  }
  return errors;
}

export function validateMedicalRecordForEgisz(record: MedicalRecord): string[] {
  const errors: string[] = [];
  if (!record.diagnosis?.trim()) errors.push("Диагноз в медкарте");
  if (!record.complaints?.trim() && !record.objective?.trim()) {
    errors.push("Жалобы или объективный статус");
  }
  return errors;
}

export function validateClinicForEgisz(
  settings: ClinicSettings,
  config: EgiszClinicConfig,
  options?: { requireN3?: boolean }
): string[] {
  const errors: string[] = [];
  if (!settings.name?.trim()) errors.push("Название клиники");
  if (!settings.inn?.trim()) errors.push("ИНН клиники");
  if (!config.organizationOid?.trim()) errors.push("OID организации");
  if (options?.requireN3) {
    if (!config.n3?.guid?.trim()) errors.push("GUID N3");
    if (!config.n3?.lpuId?.trim()) errors.push("idLPU N3");
    if (!config.n3?.login?.trim()) errors.push("Login N3");
    if (!config.n3?.password?.trim()) errors.push("Password N3");
  }
  return errors;
}

export function mapDoctorAuthorName(doctor: Doctor) {
  return splitDoctorName(doctor.name);
}

export function buildOrganizationName(settings: ClinicSettings): string {
  return settings.name.trim();
}
