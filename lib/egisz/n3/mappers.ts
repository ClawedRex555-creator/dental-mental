import "server-only";

import { extractDiagnosisCode } from "@/lib/egisz/cda/diagnosis-code";
import {
  mapGenderToEgisz,
  resolveN3MedDocumentType,
} from "@/lib/egisz/cda/constants";
import { formatN3DateTime } from "@/lib/egisz/cda/xml-utils";
import {
  resolveDoctorN3PositionId,
  resolveDoctorN3SpecialityId,
} from "@/lib/egisz/doctor-nsi";
import type { N3EmkPersonDto, N3MedDocumentDto, N3PatientDto } from "@/lib/egisz/n3/types";
import type { EgiszClinicConfig } from "@/lib/egisz/types";
import type { SignedDocument } from "@/lib/egisz/signing/interface";
import type { ClinicSettings, Doctor, MedicalRecord, Patient } from "@/lib/types";

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
    idSpeciality: resolveDoctorN3SpecialityId({
      n3SpecialityId: doctor.n3SpecialityId,
      specialization: doctor.specialization,
    }),
    idPosition: resolveDoctorN3PositionId({
      n3PositionId: doctor.n3PositionId,
      positionCode: doctor.positionCode,
      specialization: doctor.specialization,
    }),
  };
}

function formatN3CreationDate(record: MedicalRecord): string {
  const raw = record.createdAt?.trim();
  if (raw) {
    const parsed = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
    if (!Number.isNaN(parsed.getTime())) {
      return formatN3DateTime(parsed);
    }
  }
  return formatN3DateTime(new Date());
}

export function mapMedDocumentToN3(input: {
  record: MedicalRecord;
  templateOid: string;
  signed: SignedDocument;
  doctor: Doctor;
  documentUuid: string;
}): N3MedDocumentDto {
  const docOid = input.templateOid.trim();
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
  const mkb = extractDiagnosisCode(
    record.diagnosisCode
      ? `${record.diagnosisCode} ${record.diagnosis}`
      : record.diagnosis
  );
  if (!record.diagnosisCode?.trim() && mkb.code === "Z01.2" && !record.diagnosis.match(/^[A-Z]\d{2}/i)) {
    errors.push("Код МКБ-10 в диагнозе (например K02.1)");
  }
  if (!record.complaints?.trim() && !record.objective?.trim()) {
    errors.push("Жалобы или объективный статус");
  }
  if (!record.anamnesis?.trim() && !record.complaints?.trim()) {
    errors.push("Анамнез заболевания или жалобы");
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
  const innDigits = settings.inn.replace(/\D/g, "");
  const ogrnDigits = (settings.ogrn ?? "").replace(/\D/g, "");
  const ogrnipDigits = (settings.ogrnip ?? "").replace(/\D/g, "");
  if (innDigits.length === 12 && ogrnipDigits.length !== 15) {
    errors.push("ОГРНИП (15 цифр) для ИП — как в ФРМО");
  }
  if (innDigits.length === 12 && !settings.medicalLicense?.trim()) {
    errors.push("Номер лицензии на мед. деятельность (для ИП в СЭМД)");
  }
  if (innDigits.length === 10 && ogrnDigits.length !== 13) {
    errors.push("ОГРН (13 цифр) для ООО / юр. лица — как в ФРМО");
  }
  if (innDigits.length === 10 && ogrnipDigits.length === 15) {
    errors.push("Для ООО укажите ОГРН, а не ОГРНИП");
  }
  if (innDigits.length === 12 && ogrnDigits.length === 13) {
    errors.push("Для ИП укажите ОГРНИП, а не ОГРН");
  }
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
