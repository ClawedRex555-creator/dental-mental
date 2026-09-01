import type {
  Appointment,
  AppointmentStatus,
  Doctor,
  Patient,
  UserRole,
} from "@/lib/types";
import { canViewPatientPhone } from "@/lib/rbac";

export interface MobileStaffAppointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  clinicId: string;
  clinicName: string;
  scheduledAt: string;
  reason: string;
  status: AppointmentStatus;
  notes?: string;
  price?: number;
}

function patientDisplayName(patient: Patient | undefined): string {
  if (!patient) return "—";
  return [patient.lastName, patient.firstName, patient.middleName]
    .filter(Boolean)
    .join(" ");
}

function appointmentScheduledIso(date: string, startTime: string): string {
  const time = startTime.length === 5 ? `${startTime}:00` : startTime;
  return `${date}T${time}`;
}

/** MIS appointment status 1:1 — без сворачивания in_progress → scheduled. */
export function mapAppointmentStatusForMobile(
  status: AppointmentStatus
): AppointmentStatus {
  return status;
}

export function mapAppointmentToMobile(
  appointment: Appointment,
  patients: Patient[],
  doctors: Doctor[],
  clinicId: string,
  clinicName: string,
  role?: UserRole | "patient"
): MobileStaffAppointment {
  const patient = patients.find((p) => p.id === appointment.patientId);
  const doctor = doctors.find((d) => d.id === appointment.doctorId);
  const showPhone =
    role == null ? true : role !== "patient" && canViewPatientPhone(role);
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patientName: patientDisplayName(patient),
    patientPhone: showPhone ? patient?.phone ?? "" : "",
    doctorId: appointment.doctorId ?? "",
    doctorName: doctor?.name ?? "—",
    clinicId,
    clinicName,
    scheduledAt: appointmentScheduledIso(appointment.date, appointment.startTime),
    reason: appointment.reason ?? appointment.complaints ?? appointment.comment ?? "",
    status: appointment.status,
    notes: appointment.comment,
    price: appointment.price > 0 ? appointment.price : undefined,
  };
}
