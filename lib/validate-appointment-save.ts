import {
  findAppointmentConflicts,
} from "@/lib/appointment-utils";
import {
  formatAppointmentConflictMessage,
  getPrimaryScheduleConflict,
} from "@/lib/appointment-schedule-messages";
import { isIntervalWithinDoctorHours } from "@/lib/clinic-schedule";
import type { Appointment, Doctor, DoctorMonthSchedule, Patient } from "@/lib/types";

export function validateAppointmentSave(
  appointments: Appointment[],
  payload: Pick<
    Appointment,
    "id" | "date" | "startTime" | "endTime" | "doctorId" | "cabinetId" | "patientId" | "status"
  >,
  patients: Patient[],
  doctors: Doctor[],
  doctorSchedules: DoctorMonthSchedule[] = []
): string | null {
  if (payload.status === "cancelled") return null;

  if (!payload.doctorId) {
    return "Укажите врача — иначе в одно время могут оказаться несколько пациентов";
  }

  if (
    !isIntervalWithinDoctorHours(
      payload.doctorId,
      payload.date,
      payload.startTime,
      payload.endTime,
      doctorSchedules
    )
  ) {
    return "Выбранное время вне графика смены врача";
  }

  const conflicts = findAppointmentConflicts(appointments, {
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    doctorId: payload.doctorId,
    cabinetId: payload.cabinetId,
    patientId: payload.patientId,
    excludeId: payload.id,
  });

  if (conflicts.length === 0) return null;

  return formatAppointmentConflictMessage(
    getPrimaryScheduleConflict(conflicts)!,
    patients,
    doctors
  );
}
