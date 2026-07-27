import type { Appointment, MedicalRecord, Service, WorkAct } from "@/lib/types";
import { generateId } from "@/lib/utils";
import { extractDiagnosisCode } from "@/lib/egisz/cda/diagnosis-code";
import {
  DEFAULT_DENTAL_SERVICE_CODE,
  DEFAULT_DENTAL_SERVICE_NAME,
} from "@/lib/egisz/cda/nsi-constants";
import { resolveNmuService } from "@/lib/egisz/cda/nsi-display-names";
import { buildWorkActMedicalRecommendations } from "@/lib/work-act-utils";

export const WORK_ACT_STUB_COMPLAINTS = "По акту оказанных услуг";
export const WORK_ACT_STUB_DIAGNOSIS = "Оказаны стоматологические услуги";

function servicesListFromAct(act: WorkAct): string {
  return act.items.map((i) => i.serviceName).join("; ");
}

/** Код НМУ для ЕГИСЗ: из прайса (nmuCode) или по названию позиций акта */
export function resolveNmuForWorkAct(
  act: WorkAct,
  services: Service[] = []
): { code: string; name: string } {
  const byId = new Map(services.map((s) => [s.id, s]));
  const explicit = act.items
    .map((item) => (item.serviceId ? byId.get(item.serviceId)?.nmuCode : undefined))
    .find((code) => Boolean(code?.trim()));
  return resolveNmuService({
    serviceCode: explicit,
    serviceName: servicesListFromAct(act),
    fallbackCode: DEFAULT_DENTAL_SERVICE_CODE,
    fallbackName: DEFAULT_DENTAL_SERVICE_NAME,
  });
}

export function findMedicalRecordForWorkAct(
  act: WorkAct,
  records: MedicalRecord[]
): MedicalRecord | undefined {
  if (act.medicalRecordId) {
    const byId = records.find((r) => r.id === act.medicalRecordId);
    if (byId) return byId;
  }
  const byWorkAct = records.find((r) => r.workActId === act.id);
  if (byWorkAct) return byWorkAct;
  if (act.appointmentId) {
    return records.find((r) => r.appointmentId === act.appointmentId);
  }
  return undefined;
}

function resolveDoctorId(
  act: WorkAct,
  appointment: Appointment | undefined,
  fallback?: string
): string {
  return act.doctorId ?? appointment?.doctorId ?? fallback ?? "";
}

export function buildMedicalRecordFromWorkAct(
  act: WorkAct,
  appointment: Appointment | undefined,
  recordId = generateId("mr"),
  services: Service[] = []
): MedicalRecord {
  const servicesList = servicesListFromAct(act);
  const complaints =
    appointment?.complaints?.trim() ||
    appointment?.reason?.trim() ||
    WORK_ACT_STUB_COMPLAINTS;
  const diagnosisParsed = extractDiagnosisCode(WORK_ACT_STUB_DIAGNOSIS);
  const nmu = resolveNmuForWorkAct(act, services);

  return {
    id: recordId,
    patientId: act.patientId,
    doctorId: resolveDoctorId(act, appointment),
    appointmentId: act.appointmentId,
    workActId: act.id,
    complaints,
    anamnesis: complaints,
    lifeAnamnesis: "Не отягощён",
    objective: servicesList || "Осмотр полости рта",
    diagnosis: diagnosisParsed.displayName,
    diagnosisCode: diagnosisParsed.code,
    treatment: servicesList,
    serviceCode: nmu.code,
    recommendations: buildWorkActMedicalRecommendations({
      actNumber: act.actNumber,
      actDate: act.actDate,
      totalAmount: act.totalAmount,
      notes: act.notes,
    }),
    createdAt: act.actDate,
    serviceName: servicesList,
  };
}

/** Дополняет медкарту данными приёма и акта перед выгрузкой в ЕГИСЗ */
export function enrichMedicalRecordForWorkAct(
  record: MedicalRecord,
  act: WorkAct,
  appointment: Appointment | undefined,
  services: Service[] = []
): MedicalRecord {
  const servicesList = servicesListFromAct(act);
  const complaints =
    appointment?.complaints?.trim() ||
    appointment?.reason?.trim() ||
    record.complaints?.trim() ||
    WORK_ACT_STUB_COMPLAINTS;
  const nmu = resolveNmuForWorkAct(act, services);
  const keepExplicit =
    Boolean(record.serviceCode?.trim()) &&
    record.serviceCode !== DEFAULT_DENTAL_SERVICE_CODE;

  return {
    ...record,
    workActId: act.id,
    appointmentId: record.appointmentId ?? act.appointmentId,
    doctorId: resolveDoctorId(act, appointment, record.doctorId),
    complaints,
    anamnesis: record.anamnesis?.trim() || complaints,
    lifeAnamnesis: record.lifeAnamnesis?.trim() || "Не отягощён",
    objective: record.objective?.trim() || servicesList || "Осмотр полости рта",
    treatment: servicesList || record.treatment,
    serviceName: servicesList || record.serviceName,
    serviceCode: keepExplicit ? record.serviceCode : nmu.code,
    diagnosisCode:
      record.diagnosisCode ??
      extractDiagnosisCode(record.diagnosis).code,
    recommendations: buildWorkActMedicalRecommendations({
      actNumber: act.actNumber,
      actDate: act.actDate,
      totalAmount: act.totalAmount,
      notes: act.notes,
    }),
  };
}

export function ensureMedicalRecordForWorkAct(
  act: WorkAct,
  medicalRecords: MedicalRecord[],
  appointment: Appointment | undefined,
  services: Service[] = []
): { records: MedicalRecord[]; record: MedicalRecord; actMedicalRecordId?: string } {
  const existing = findMedicalRecordForWorkAct(act, medicalRecords);
  if (existing) {
    const enriched = enrichMedicalRecordForWorkAct(existing, act, appointment, services);
    const changed = enriched !== existing;
    return {
      records: changed
        ? medicalRecords.map((r) => (r.id === existing.id ? enriched : r))
        : medicalRecords,
      record: enriched,
      actMedicalRecordId: act.medicalRecordId ?? enriched.id,
    };
  }

  const created = buildMedicalRecordFromWorkAct(act, appointment, generateId("mr"), services);
  return {
    records: [created, ...medicalRecords],
    record: created,
    actMedicalRecordId: created.id,
  };
}
