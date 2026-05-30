import type { Appointment, ClinicUser, Doctor } from "@/lib/types";

export function resolveAssistantRecord(
  currentUser: ClinicUser,
  doctors: Doctor[]
): Doctor | undefined {
  const id =
    currentUser.staffId ??
    doctors.find(
      (d) =>
        d.role === "assistant" &&
        d.email.trim().toLowerCase() === currentUser.email.trim().toLowerCase()
    )?.id;
  if (!id) return undefined;
  return doctors.find((d) => d.id === id && d.role === "assistant");
}

/** Только записи, где администратор указал этого ассистента */
export function filterAppointmentsForAssistant(
  appointments: Appointment[],
  assistantId: string
): Appointment[] {
  return appointments.filter((a) => a.assistantId === assistantId);
}

/** Врачи из приёмов, на которые назначен ассистент (колонки расписания) */
export function getDoctorsFromAssistantAppointments(
  assistantAppointments: Appointment[],
  doctors: Doctor[]
): Doctor[] {
  const ids = new Set(
    assistantAppointments.map((a) => a.doctorId).filter((id): id is string => !!id)
  );
  return doctors
    .filter((d) => d.role === "doctor" && ids.has(d.id))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
