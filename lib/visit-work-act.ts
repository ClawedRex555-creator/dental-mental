import type { Appointment, MedicalRecord, WorkAct } from "@/lib/types";

/** Акт, привязанный к визиту (по workActId на записи, медкарте или appointmentId на акте) */
export function findWorkActForAppointment(
  appointment: Appointment,
  workActs: WorkAct[],
  medicalRecords: MedicalRecord[]
): WorkAct | undefined {
  if (appointment.workActId) {
    const direct = workActs.find((a) => a.id === appointment.workActId);
    if (direct) return direct;
  }

  const record = medicalRecords.find((r) => r.appointmentId === appointment.id);
  if (record?.workActId) {
    const viaRecord = workActs.find((a) => a.id === record.workActId);
    if (viaRecord) return viaRecord;
  }

  return workActs.find(
    (a) =>
      a.patientId === appointment.patientId &&
      a.appointmentId === appointment.id
  );
}

export function findMedicalRecordForAppointment(
  appointment: Appointment,
  medicalRecords: MedicalRecord[],
  workAct?: WorkAct
): MedicalRecord | undefined {
  const byAppointment = medicalRecords.find((r) => r.appointmentId === appointment.id);
  if (byAppointment) return byAppointment;
  if (workAct?.id) {
    return medicalRecords.find((r) => r.workActId === workAct.id);
  }
  if (workAct?.medicalRecordId) {
    return medicalRecords.find((r) => r.id === workAct.medicalRecordId);
  }
  return undefined;
}

/** Акт, привязанный к записи медкарты */
export function findWorkActForMedicalRecord(
  record: MedicalRecord,
  workActs: WorkAct[]
): WorkAct | undefined {
  if (record.workActId) {
    const byId = workActs.find((a) => a.id === record.workActId);
    if (byId) return byId;
  }
  return workActs.find((a) => a.medicalRecordId === record.id);
}
