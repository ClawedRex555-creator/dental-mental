import type { AppointmentConflict } from "@/lib/appointment-utils";
import type { Appointment, Doctor, Patient } from "@/lib/types";
import { getFullName } from "@/lib/utils";

function formatTimeRange(apt: Appointment): string {
  const end = apt.endTime ?? apt.startTime;
  return `${apt.date} ${apt.startTime}–${end}`;
}

export function formatAppointmentConflictMessage(
  conflict: AppointmentConflict,
  patients: Patient[],
  doctors: Doctor[]
): string {
  const apt = conflict.appointment;
  const when = formatTimeRange(apt);

  if (conflict.kind === "doctor") {
    const doc = doctors.find((d) => d.id === apt.doctorId);
    const docName = doc?.name ?? "Врач";
    const other = patients.find((p) => p.id === apt.patientId);
    const patientName = other
      ? getFullName(other.firstName, other.lastName, other.middleName)
      : "другой пациент";
    return `${docName} занят (${when}, ${patientName}). Выберите другое время — пациент не должен ждать.`;
  }

  if (conflict.kind === "cabinet") {
    return `Кабинет занят в это время (${when}). Выберите другой кабинет или время.`;
  }

  return `У пациента уже есть запись на это время (${when}).`;
}

export function getPrimaryScheduleConflict(
  conflicts: AppointmentConflict[]
): AppointmentConflict | undefined {
  return (
    conflicts.find((c) => c.kind === "doctor") ??
    conflicts.find((c) => c.kind === "cabinet") ??
    conflicts[0]
  );
}
