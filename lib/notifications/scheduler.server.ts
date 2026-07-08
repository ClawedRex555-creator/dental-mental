import "server-only";

import {
  cancelPendingForAppointment,
  insertNotificationDelivery,
} from "@/lib/notifications/db.server";
import { getNotificationConfig } from "@/lib/notifications/settings.server";
import {
  appointmentStartsAt,
  buildTemplateContext,
  canNotifyPatient,
  findTemplateForChannel,
  pickChannelsForPatient,
  renderNotificationTemplate,
  shouldScheduleAppointmentNotifications,
} from "@/lib/notifications/context.server";
import type { NotificationChannel } from "@/lib/notifications/types";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import type { Appointment } from "@/lib/types";
import { clinicHasModule } from "@/lib/module-access.server";

function isInQuietHours(now: Date, start: string, end: string): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const startM = (sh ?? 0) * 60 + (sm ?? 0);
  const endM = (eh ?? 0) * 60 + (em ?? 0);
  if (startM <= endM) return mins >= startM && mins < endM;
  return mins >= startM || mins < endM;
}

function adjustForQuietHours(
  scheduled: Date,
  settings: { quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string }
): Date {
  if (!settings.quietHoursEnabled) return scheduled;
  const out = new Date(scheduled);
  let guard = 0;
  while (isInQuietHours(out, settings.quietHoursStart, settings.quietHoursEnd) && guard < 48) {
    out.setMinutes(out.getMinutes() + 30);
    guard++;
  }
  return out;
}

export async function scheduleNotificationsForAppointment(input: {
  clinicId: string;
  appointment: Appointment;
  snapshot: ClinicPersistedState;
  isTest?: boolean;
}): Promise<number> {
  if (!(await clinicHasModule(input.clinicId, "notifications"))) return 0;

  const config = await getNotificationConfig(input.clinicId);
  if (!config.settings.enabled && !input.isTest) return 0;
  if (!shouldScheduleAppointmentNotifications(input.appointment)) return 0;

  const patient = input.snapshot.patients.find((p) => p.id === input.appointment.patientId);
  if (!patient || !canNotifyPatient(patient)) return 0;

  const channels = pickChannelsForPatient(config.settings, patient);
  const starts = appointmentStartsAt(input.appointment);
  const now = new Date();
  let scheduled = 0;

  for (const offsetMin of config.settings.reminderOffsetsMinutes) {
    const fireAt = new Date(starts.getTime() - offsetMin * 60_000);
    if (fireAt <= now && !input.isTest) continue;

    const scheduledAt = adjustForQuietHours(
      input.isTest ? now : fireAt,
      config.settings
    );

    for (const channel of channels) {
      const tpl = findTemplateForChannel(
        config.templates,
        channel,
        "appointment_reminder"
      );
      const ctx = buildTemplateContext({
        patient,
        appointment: input.appointment,
        snapshot: input.snapshot,
        settings: config.settings,
        clinicId: input.clinicId,
      });
      const body = tpl
        ? renderNotificationTemplate(tpl.body, ctx)
        : renderNotificationTemplate(
            "Здравствуйте, {{patientName}}. Напоминаем о записи {{appointmentDate}} в {{appointmentTime}}.",
            ctx
          );
      const preview = body.slice(0, 200);

      const id = await insertNotificationDelivery({
        clinicId: input.clinicId,
        patientId: patient.id,
        appointmentId: input.appointment.id,
        channel: channel as NotificationChannel,
        eventType: "appointment_reminder",
        reminderOffsetMinutes: offsetMin,
        scheduledAt,
        isTest: input.isTest ?? false,
        messagePreview: preview,
      });
      if (id) scheduled++;
    }
  }
  return scheduled;
}

export async function rescheduleAppointmentNotifications(input: {
  clinicId: string;
  appointment: Appointment;
  snapshot: ClinicPersistedState;
}): Promise<void> {
  await cancelPendingForAppointment(input.clinicId, input.appointment.id);
  await scheduleNotificationsForAppointment(input);
}

export async function syncAppointmentNotifications(input: {
  clinicId: string;
  prevAppointments: Appointment[];
  nextAppointments: Appointment[];
  snapshot: ClinicPersistedState;
}): Promise<void> {
  if (!(await clinicHasModule(input.clinicId, "notifications"))) return;
  const config = await getNotificationConfig(input.clinicId);
  if (!config.settings.enabled) return;

  const prevById = new Map(input.prevAppointments.map((a) => [a.id, a]));
  const nextById = new Map(input.nextAppointments.map((a) => [a.id, a]));

  for (const [id, next] of nextById) {
    const prev = prevById.get(id);
    if (!prev) {
      await scheduleNotificationsForAppointment({
        clinicId: input.clinicId,
        appointment: next,
        snapshot: input.snapshot,
      });
      continue;
    }
    const changed =
      prev.date !== next.date ||
      prev.startTime !== next.startTime ||
      prev.status !== next.status ||
      prev.patientId !== next.patientId;
    if (!changed) continue;

    if (!shouldScheduleAppointmentNotifications(next)) {
      await cancelPendingForAppointment(input.clinicId, id);
      continue;
    }
    await rescheduleAppointmentNotifications({
      clinicId: input.clinicId,
      appointment: next,
      snapshot: input.snapshot,
    });
  }

  for (const [id] of prevById) {
    if (!nextById.has(id)) {
      await cancelPendingForAppointment(input.clinicId, id);
    }
  }
}
