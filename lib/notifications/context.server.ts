import "server-only";

import { isAppointmentActive } from "@/lib/appointment-utils";
import { buildConfirmUrl } from "@/lib/notifications/action-token.server";
import { formatPatientDisplayName, findTemplateForChannel, renderNotificationTemplate } from "@/lib/notifications/template-service";
import type { NotificationChannel, NotificationSettings, NotificationTemplateContext } from "@/lib/notifications/types";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { Appointment, Doctor, Patient, PatientNotificationPrefs } from "@/lib/types";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export function getPatientNotificationPrefs(patient: Patient): PatientNotificationPrefs {
  const prefs = patient.notificationPrefs;
  return {
    consentForNotifications: prefs?.consentForNotifications ?? false,
    consentDate: prefs?.consentDate,
    notificationsEnabled: prefs?.notificationsEnabled ?? prefs?.consentForNotifications ?? false,
    preferredChannels: prefs?.preferredChannels,
    telegramChatId: prefs?.telegramChatId,
  };
}

export function canNotifyPatient(patient: Patient): boolean {
  const prefs = getPatientNotificationPrefs(patient);
  if (!prefs.consentForNotifications || !prefs.notificationsEnabled) return false;
  if (patient.status === "archived") return false;
  return true;
}

export function shouldScheduleAppointmentNotifications(apt: Appointment): boolean {
  if (!isAppointmentActive(apt)) return false;
  if (apt.status === "cancelled" || apt.status === "no_show") return false;
  if (apt.status === "completed" || apt.status === "arrived" || apt.status === "in_progress") {
    return false;
  }
  return apt.status === "scheduled" || apt.status === "confirmed";
}

export function appointmentStartsAt(apt: Appointment): Date {
  const [y, m, d] = apt.date.split("-").map(Number);
  const [hh, mm] = apt.startTime.split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

export function buildTemplateContext(input: {
  patient: Patient;
  appointment: Appointment;
  snapshot: ClinicPersistedState;
  settings: NotificationSettings;
  clinicId: string;
  publicBaseUrl?: string;
}): NotificationTemplateContext {
  const doctor = input.snapshot.doctors.find((d) => d.id === input.appointment.doctorId);
  const cabinet = input.snapshot.cabinets.find((c) => c.id === input.appointment.cabinetId);
  const aptDate = appointmentStartsAt(input.appointment);
  const base =
    input.publicBaseUrl?.trim() ||
    input.settings.publicBaseUrl?.trim() ||
    process.env.APP_PUBLIC_BASE_URL?.trim() ||
    "";

  let confirmUrl: string | undefined;
  if (base) {
    confirmUrl = buildConfirmUrl(base, {
      clinicId: input.clinicId,
      appointmentId: input.appointment.id,
      patientId: input.patient.id,
      action: "confirm",
    });
  }

  return {
    patientName: formatPatientDisplayName(input.patient),
    appointmentDate: format(aptDate, "d MMMM yyyy", { locale: ru }),
    appointmentTime: input.appointment.startTime,
    doctorName: doctor ? formatDoctorName(doctor) : "—",
    cabinetName: cabinet?.name ?? "—",
    clinicName: input.settings.clinicName || input.snapshot.clinicSettings?.name || "Клиника",
    clinicPhone: input.settings.clinicPhone || input.snapshot.clinicSettings?.phone || "",
    clinicAddress: input.settings.clinicAddress || input.snapshot.clinicSettings?.address || "",
    confirmUrl,
    rescheduleUrl: undefined,
  };
}

function formatDoctorName(doctor: Doctor): string {
  return doctor.name.trim() || "—";
}

export function resolveRecipientAddress(
  channel: NotificationChannel,
  patient: Patient
): string {
  const prefs = getPatientNotificationPrefs(patient);
  switch (channel) {
    case "telegram":
      return prefs.telegramChatId?.trim() ?? "";
    case "email":
      return patient.email?.trim() ?? "";
    case "whatsapp":
    case "sms":
      return patient.phone?.trim() ?? "";
    case "mock":
      return patient.phone?.trim() || patient.id;
    default:
      return patient.phone?.trim() ?? "";
  }
}

export function pickChannelsForPatient(
  settings: NotificationSettings,
  patient: Patient
): NotificationChannel[] {
  const prefs = getPatientNotificationPrefs(patient);
  const enabled = settings.testMode
    ? (["mock"] as NotificationChannel[])
    : settings.enabledChannels.filter((c) => c !== "mock");
  const channels = enabled.length ? enabled : (["mock"] as NotificationChannel[]);
  if (prefs.preferredChannels?.length) {
    return channels.filter((c) => prefs.preferredChannels!.includes(c));
  }
  return channels;
}

export { findTemplateForChannel, renderNotificationTemplate };
