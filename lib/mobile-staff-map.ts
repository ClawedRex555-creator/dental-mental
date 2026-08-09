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
  status: "scheduled" | "completed" | "cancelled" | "rescheduled" | "noShow";
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

export function mapAppointmentStatusForMobile(
  status: AppointmentStatus
): MobileStaffAppointment["status"] {
  switch (status) {
    case "completed":
    case "ready_for_payment":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "no_show":
      return "noShow";
    default:
      return "scheduled";
  }
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
    status: mapAppointmentStatusForMobile(appointment.status),
    notes: appointment.comment,
    price: appointment.price > 0 ? appointment.price : undefined,
  };
}
