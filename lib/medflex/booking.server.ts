import "server-only";

import { randomUUID } from "crypto";
import {
  findAppointmentConflicts,
  toMinutes,
} from "@/lib/appointment-utils";
import {
  getDoctorHoursForDate,
  isClinicOpenOnDate,
} from "@/lib/clinic-schedule";
import {
  getClinicDataDbWithLegacyStaff,
  saveClinicDataDb,
} from "@/lib/clinic-data-db.server";
import { createFreshPersistedState } from "@/lib/clinic-persisted-state";
import { mapDoctorSpecialtyToMedflex } from "@/lib/medflex/specialties";
import type { MedflexBookingRequest, MedflexClaimStatus } from "@/lib/medflex/types";
import type { Appointment, Patient } from "@/lib/types";
import { generateId } from "@/lib/utils";

function digitsPhone(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  return d;
}

function parseDt(value: string): { date: string; time: string } | null {
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (!m) return null;
  return { date: m[1]!, time: m[2]! };
}

function durationMinutes(start: string, end: string): number {
  return Math.max(15, toMinutes(end) - toMinutes(start));
}

export type MedflexBookingResult =
  | { status_code: 204; claim_id: string }
  | { status_code: 423; detail: string }
  | { status_code: 409; detail: string }
  | { status_code: 416; detail: string }
  | { status_code: 400; detail: string };

function findPatientByPhone(patients: Patient[], phone: string): Patient | undefined {
  const want = digitsPhone(phone);
  return patients.find((p) => {
    const have = digitsPhone(p.phone);
    return have === want || have.endsWith(want.slice(-10)) || want.endsWith(have.slice(-10));
  });
}

function ensurePatient(
  patients: Patient[],
  client: MedflexBookingRequest["client"]
): { patients: Patient[]; patient: Patient } {
  const existing = findPatientByPhone(patients, client.mobile_phone);
  if (existing) {
    const updated: Patient = {
      ...existing,
      firstName: client.first_name.trim() || existing.firstName,
      lastName: client.last_name.trim() || existing.lastName,
      middleName: client.second_name?.trim() || existing.middleName,
      birthDate: client.birthday?.trim() || existing.birthDate,
    };
    return {
      patients: patients.map((p) => (p.id === existing.id ? updated : p)),
      patient: updated,
    };
  }

  const patient: Patient = {
    id: generateId("pat"),
    firstName: client.first_name.trim() || "—",
    lastName: client.last_name.trim() || "—",
    middleName: client.second_name?.trim() || undefined,
    phone: digitsPhone(client.mobile_phone),
    birthDate: client.birthday?.trim() || "1990-01-01",
    gender: "male",
    source: "Сайт",
    status: "new",
    createdAt: new Date().toISOString().slice(0, 10),
    balance: 0,
    totalSpent: 0,
    disability: "none",
    notes: "Создан из онлайн-записи MedFlex / ПроДокторов",
  };
  return { patients: [patient, ...patients], patient };
}

function slotExistsForDoctor(
  state: ReturnType<typeof createFreshPersistedState>,
  doctorId: string,
  date: string,
  startTime: string,
  endTime: string
): boolean {
  if (!isClinicOpenOnDate(date, state.clinicSettings.weeklySchedule)) return false;
  const hours = getDoctorHoursForDate(doctorId, date, state.doctorSchedules);
  if (!hours) return false;
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  return s >= toMinutes(hours.startTime) && e <= toMinutes(hours.endTime) && e > s;
}

export async function createMedflexBooking(
  clinicId: string,
  body: MedflexBookingRequest
): Promise<MedflexBookingResult> {
  const start = parseDt(body.appointment?.dt_start ?? "");
  const end = parseDt(body.appointment?.dt_end ?? "");
  if (!start || !end) {
    return { status_code: 400, detail: "Неверный формат dt_start/dt_end" };
  }
  const doctorId = body.doctor?.id?.trim();
  if (!doctorId) return { status_code: 400, detail: "Не указан doctor.id" };
  if (!body.client?.mobile_phone?.trim()) {
    return { status_code: 400, detail: "Не указан mobile_phone" };
  }

  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  const base = record?.data ?? createFreshPersistedState();
  const doctor = base.doctors.find((d) => d.id === doctorId);
  if (!doctor || doctor.status !== "active") {
    return { status_code: 416, detail: "Slot doesn't exist" };
  }

  if (!slotExistsForDoctor(base, doctorId, start.date, start.time, end.time)) {
    return { status_code: 416, detail: "Slot doesn't exist" };
  }

  const { patients, patient } = ensurePatient(base.patients, body.client);

  const doctorBusy = findAppointmentConflicts(base.appointments, {
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    doctorId,
  }).some((c) => c.kind === "doctor");
  if (doctorBusy) {
    return { status_code: 423, detail: "Slot is busy" };
  }

  const patientBusyOtherDoctor = findAppointmentConflicts(base.appointments, {
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    patientId: patient.id,
  }).some((c) => c.kind === "patient" && c.appointment.doctorId !== doctorId);
  if (patientBusyOtherDoctor) {
    return {
      status_code: 409,
      detail: "The client has an appointment with another doctor at this time",
    };
  }

  const claimId = randomUUID();
  const appointment: Appointment = {
    id: generateId("apt"),
    patientId: patient.id,
    doctorId,
    cabinetId: doctor.cabinetId,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    durationMinutes: durationMinutes(start.time, end.time),
    status: "scheduled",
    comment:
      [
        body.appointment?.comment?.trim(),
        `MedFlex claim_id=${claimId}`,
        body.appointment_source ? `source=${body.appointment_source}` : null,
        body.appointment?.is_club ? "club=true" : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    price: typeof body.appointment?.price === "number" ? body.appointment.price : 0,
    paymentStatus: "pending",
    externalClaimId: claimId,
    externalSource: body.appointment_source || "Prodoctorov",
  };

  await saveClinicDataDb(
    clinicId,
    {
      ...base,
      patients,
      appointments: [appointment, ...base.appointments],
    },
    { allowEmptyResult: true }
  );

  return { status_code: 204, claim_id: claimId };
}

export async function cancelMedflexBooking(
  clinicId: string,
  claimId: string
): Promise<{ status_code: 204 } | { status_code: 404; detail: string }> {
  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  const base = record?.data ?? createFreshPersistedState();
  const apt = base.appointments.find((a) => a.externalClaimId === claimId);
  if (!apt) return { status_code: 404, detail: "Claim not found" };

  await saveClinicDataDb(
    clinicId,
    {
      ...base,
      appointments: base.appointments.map((a) =>
        a.id === apt.id ? { ...a, status: "cancelled" as const } : a
      ),
    },
    { allowEmptyResult: true }
  );
  return { status_code: 204 };
}

export async function statusMedflexBooking(
  clinicId: string,
  claimId: string
): Promise<
  | {
      status_code: 204;
      claim_status: MedflexClaimStatus;
      dt_start?: string;
      dt_end?: string;
    }
  | { status_code: 404; detail: string }
> {
  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  const apt = record?.data?.appointments.find((a) => a.externalClaimId === claimId);
  if (!apt) return { status_code: 404, detail: "Claim not found" };
  const claim_status: MedflexClaimStatus =
    apt.status === "cancelled" ? "cancelled" : "successfully";
  return {
    status_code: 204,
    claim_status,
    dt_start: `${apt.date} ${apt.startTime}`,
    dt_end: `${apt.date} ${apt.endTime}`,
  };
}

export async function updateMedflexBooking(
  clinicId: string,
  body: MedflexBookingRequest & { claim_id: string }
): Promise<MedflexBookingResult> {
  const claimId = body.claim_id?.trim();
  if (!claimId) return { status_code: 400, detail: "Не указан claim_id" };

  const start = parseDt(body.appointment?.dt_start ?? "");
  const end = parseDt(body.appointment?.dt_end ?? "");
  if (!start || !end) {
    return { status_code: 400, detail: "Неверный формат dt_start/dt_end" };
  }

  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  const base = record?.data ?? createFreshPersistedState();
  const apt = base.appointments.find((a) => a.externalClaimId === claimId);
  if (!apt) return { status_code: 400, detail: "Claim not found" };

  const doctorId = body.doctor?.id?.trim() || apt.doctorId;
  if (!doctorId) return { status_code: 400, detail: "Не указан doctor.id" };

  if (!slotExistsForDoctor(base, doctorId, start.date, start.time, end.time)) {
    return { status_code: 416, detail: "Slot doesn't exist" };
  }

  const doctorBusy = findAppointmentConflicts(base.appointments, {
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    doctorId,
    excludeId: apt.id,
  }).some((c) => c.kind === "doctor");
  if (doctorBusy) {
    return { status_code: 423, detail: "Slot is busy" };
  }

  await saveClinicDataDb(
    clinicId,
    {
      ...base,
      appointments: base.appointments.map((a) =>
        a.id === apt.id
          ? {
              ...a,
              doctorId,
              date: start.date,
              startTime: start.time,
              endTime: end.time,
              durationMinutes: durationMinutes(start.time, end.time),
              status: a.status === "cancelled" ? "scheduled" : a.status,
              comment: body.appointment?.comment?.trim() || a.comment,
              price:
                typeof body.appointment?.price === "number"
                  ? body.appointment.price
                  : a.price,
            }
          : a
      ),
    },
    { allowEmptyResult: true }
  );

  return { status_code: 204, claim_id: claimId };
}

export function resolveSpecialtyForDoctor(specialization: string) {
  return mapDoctorSpecialtyToMedflex(specialization);
}
