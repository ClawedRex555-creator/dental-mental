import "server-only";

import {
  mapGenderToEgisz,
  resolveN3MedDocumentType,
} from "@/lib/egisz/cda/constants";
import type { N3EmkPersonDto, N3MedDocumentDto, N3PatientDto } from "@/lib/egisz/n3/types";
import type { EgiszClinicConfig } from "@/lib/egisz/types";
import type { SignedDocument } from "@/lib/egisz/signing/interface";
import type { ClinicSettings, Doctor, MedicalRecord, Patient } from "@/lib/types";

/** Значения из минимального примера N3 (AddMedRecord.xml) */
const DEFAULT_N3_SPECIALITY = "28";
const DEFAULT_N3_POSITION = "114";

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
    middleName: patient.middleName?.trim() || "",
    birthDate: patient.birthDate.slice(0, 10),
    sex: mapGenderToEgisz(patient.gender),
    snils: patient.snils?.replace(/\D/g, "") ?? "",
  };
}

export function mapDoctorToN3(doctor: Doctor): N3EmkPersonDto {
  const name = splitDoctorName(doctor.name);
  return {
    idPersonMis: doctor.frmrOid?.trim() || doctor.id,
    familyName: name.familyName,
    givenName: name.givenName,
    middleName: name.middleName ?? "",
    snils: doctor.snils?.replace(/\D/g, "") ?? "",
    idSpeciality: doctor.n3SpecialityId?.trim() || DEFAULT_N3_SPECIALITY,
    idPosition: doctor.n3PositionId?.trim() || DEFAULT_N3_POSITION,
  };
}

function formatN3CreationDate(record: MedicalRecord): string {
  const raw = record.createdAt?.trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const offsetMin = -parsed.getTimezoneOffset();
      const sign = offsetMin >= 0 ? "+" : "-";
      const abs = Math.abs(offsetMin);
      const hh = String(Math.floor(abs / 60)).padStart(2, "0");
      const mm = String(abs % 60).padStart(2, "0");
      const iso = parsed.toISOString().slice(0, 19);
      return `${iso}${sign}${hh}:${mm}`;
    }
  }
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${now.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
}

export function mapMedDocumentToN3(input: {
  record: MedicalRecord;
  config: EgiszClinicConfig;
  signed: SignedDocument;
  doctor: Doctor;
  documentUuid: string;
}): N3MedDocumentDto {
  const docOid = input.config.documentOid ?? "1.2.643.5.1.13.13.14.1.9.1.181";
  return {
    idDocumentMis: input.documentUuid.trim(),
    idMedDocumentType: resolveN3MedDocumentType(docOid),
    header: `Протокол консультации / ${input.record.serviceName ?? "стоматологический приём"}`,
    creationDate: formatN3CreationDate(input.record),
    dataBase64: input.signed.dataBase64,
    organizationSignBase64: input.signed.organizationSignBase64,
    personalSignBase64: input.signed.personalSignBase64,
    mimeType: "text/xml",
    author: mapDoctorToN3(input.doctor),
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
