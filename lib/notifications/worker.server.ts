import "server-only";

import { listPendingDeliveries } from "@/lib/notifications/db.server";
import { dispatchNotificationDelivery } from "@/lib/notifications/dispatch.server";
import { syncAppointmentNotifications } from "@/lib/notifications/scheduler.server";
import { getNotificationConfig } from "@/lib/notifications/settings.server";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import { clinicHasModule } from "@/lib/module-access.server";
import { formatPatientDisplayName } from "@/lib/notifications/template-service";
import { resolveActiveProvider } from "@/lib/notifications/providers/index.server";
import { sendWebPushToUsers } from "@/lib/notifications/web-push.server";
import type { NotificationChannel } from "@/lib/notifications/types";
import type { ClinicPersistedState } from "@/lib/clinic-persisted-state";
import { withDb } from "@/lib/db";
import type { Appointment, AppointmentStatus, WorkAct } from "@/lib/types";

export async function processNotificationQueue(input?: {
  clinicId?: string;
  limit?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const limit = input?.limit ?? 30;
  const pending = await listPendingDeliveries(limit, input?.clinicId);
  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const result = await dispatchNotificationDelivery(row);
    if (result.ok) sent++;
    else failed++;
  }

  return { processed: pending.length, sent, failed };
}

/** Пересканировать все активные записи клиники и создать недостающие уведомления */
export async function runNotificationScheduleCheck(clinicId: string): Promise<{ scheduled: number }> {
  if (!(await clinicHasModule(clinicId, "notifications"))) {
    return { scheduled: 0 };
  }
  const config = await getNotificationConfig(clinicId);
  if (!config.settings.enabled) return { scheduled: 0 };

  const snapshot = await getClinicDataDb(clinicId);
  if (!snapshot) return { scheduled: 0 };

  const { scheduleNotificationsForAppointment } = await import(
    "@/lib/notifications/scheduler.server"
  );

  let scheduled = 0;
  for (const apt of snapshot.data.appointments) {
    scheduled += await scheduleNotificationsForAppointment({
      clinicId,
      appointment: apt,
      snapshot: snapshot.data,
    });
  }
  return { scheduled };
}

export async function maybeSyncAppointmentNotifications(
  clinicId: string,
  prevAppointments: Appointment[],
  nextAppointments: Appointment[]
): Promise<void> {
  if (!(await clinicHasModule(clinicId, "notifications"))) return;
  const snapshot = await getClinicDataDb(clinicId);
  if (!snapshot) return;
  await syncAppointmentNotifications({
    clinicId,
    prevAppointments,
    nextAppointments,
    snapshot: snapshot.data,
  });
}

type StaffAudience = "doctor" | "owner" | "admin";

interface StaffNotificationEvent {
  audience: StaffAudience;
  doctorId?: string;
  patientId?: string;
  subject: string;
  body: string;
}

interface StaffRecipient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  telegramChatId?: string;
}

const OWNER_STATUS_LABELS: Partial<Record<AppointmentStatus, string>> = {
  arrived: "Пациент пришел",
  no_show: "Пациент не пришел",
  cancelled: "Запись отменена",
};

function formatPatientName(snapshot: ClinicPersistedState, patientId?: string): string {
  if (!patientId) return "Пациент";
  const patient = snapshot.patients.find((p) => p.id === patientId);
  if (!patient) return "Пациент";
  return formatPatientDisplayName(patient);
}

function formatAppointmentPoint(appointment: Appointment): string {
  return `${appointment.date} ${appointment.startTime}`;
}

function isServiceWorkAct(act: WorkAct): boolean {
  return act.actType !== "prepayment";
}

function buildStaffEvents(input: {
  prevSnapshot: ClinicPersistedState;
  nextSnapshot: ClinicPersistedState;
}): StaffNotificationEvent[] {
  const events: StaffNotificationEvent[] = [];
  const prevAppointments = new Map(input.prevSnapshot.appointments.map((a) => [a.id, a]));
  const nextAppointments = new Map(input.nextSnapshot.appointments.map((a) => [a.id, a]));
  const nextDoctors = new Map(input.nextSnapshot.doctors.map((d) => [d.id, d]));
  const prevActs = new Map(input.prevSnapshot.workActs.map((a) => [a.id, a]));

  for (const [id, next] of nextAppointments) {
    const prev = prevAppointments.get(id);
    const patientName = formatPatientName(input.nextSnapshot, next.patientId);
    const doctor = next.doctorId ? nextDoctors.get(next.doctorId) : undefined;

    // Врачу: новая запись к нему (новая запись или сменился врач).
    const doctorAssignedNow = Boolean(next.doctorId && (!prev || prev.doctorId !== next.doctorId));
    const isPlanned =
      next.status === "scheduled" || next.status === "confirmed";
    if (doctorAssignedNow && isPlanned && next.doctorId) {
      events.push({
        audience: "doctor",
        doctorId: next.doctorId,
        patientId: next.patientId,
        subject: "Новая запись пациента",
        body: `Новая запись: ${patientName}, ${formatAppointmentPoint(next)}${
          doctor?.name ? `, врач: ${doctor.name}` : ""
        }.`,
      });
      events.push({
        audience: "admin",
        doctorId: next.doctorId,
        patientId: next.patientId,
        subject: "Новая запись пациента",
        body: `Записан пациент: ${patientName}, ${formatAppointmentPoint(next)}${
          doctor?.name ? `, врач: ${doctor.name}` : ""
        }.`,
      });
    }

    // Владельцу: ключевые статусы пациента в расписании.
    if (prev && prev.status !== next.status) {
      const statusLabel = OWNER_STATUS_LABELS[next.status];
      if (statusLabel) {
        events.push({
          audience: "owner",
          patientId: next.patientId,
          subject: "Изменение статуса записи",
          body: `${statusLabel}: ${patientName}, ${formatAppointmentPoint(next)}${
            doctor?.name ? `, врач: ${doctor.name}` : ""
          }.`,
        });
      }
    }
  }

  for (const nextAct of input.nextSnapshot.workActs) {
    if (!isServiceWorkAct(nextAct)) continue;
    const prevAct = prevActs.get(nextAct.id);
    const patientName = formatPatientName(input.nextSnapshot, nextAct.patientId);
    const actNo = nextAct.actNumber?.trim() || "без номера";

    // Владельцу: сформирован новый акт.
    if (!prevAct) {
      events.push({
        audience: "owner",
        patientId: nextAct.patientId,
        subject: "Сформирован акт",
        body: `Сформирован акт № ${actNo} по пациенту ${patientName}. Сумма: ${Math.max(
          0,
          nextAct.totalAmount
        ).toLocaleString("ru-RU")} ₽.`,
      });
    }

    // Владельцу: акт оплачен.
    const becamePaid =
      (!prevAct && nextAct.paymentStatus === "paid") ||
      (prevAct && prevAct.paymentStatus !== "paid" && nextAct.paymentStatus === "paid");
    if (becamePaid) {
      events.push({
        audience: "owner",
        patientId: nextAct.patientId,
        subject: "Акт оплачен",
        body: `Оплачен акт № ${actNo} по пациенту ${patientName}. Сумма: ${Math.max(
          0,
          nextAct.totalAmount
        ).toLocaleString("ru-RU")} ₽.`,
      });
    }
  }

  return events;
}

/** Доп. каналы (SMS/email) — только если явно выбраны и не testMode. Основной путь — Web Push. */
function pickStaffNotificationChannels(
  enabledChannels: NotificationChannel[],
  testMode: boolean
): NotificationChannel[] {
  if (testMode) return [];
  return enabledChannels.filter((c) => c !== "mock");
}

function staffEventUrl(audience: StaffAudience): string {
  if (audience === "doctor") return "/schedule";
  if (audience === "owner") return "/finance";
  return "/schedule";
}

function resolveStaffRecipientAddress(
  channel: NotificationChannel,
  recipient: StaffRecipient
): string | null {
  switch (channel) {
    case "email":
      return recipient.email?.trim() || null;
    case "sms":
    case "whatsapp":
      return recipient.phone?.trim() || null;
    case "telegram":
      return recipient.telegramChatId?.trim() || null;
    case "mock":
      return recipient.email?.trim() || recipient.phone?.trim() || recipient.id;
    case "vk":
    case "max":
      return recipient.email?.trim() || recipient.phone?.trim() || null;
    default:
      return null;
  }
}

async function listOwnerRecipients(clinicId: string): Promise<StaffRecipient[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string; name: string; login: string }>(
        `SELECT id, name, login
         FROM auth_users
         WHERE clinic_id = $1 AND role = 'owner'`,
        [clinicId]
      );
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name || "Владелец",
        email: row.login || undefined,
      }));
    })) ?? []
  );
}

async function listDoctorAuthRecipientsByStaffId(
  clinicId: string
): Promise<Map<string, StaffRecipient>> {
  const rows =
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        name: string;
        login: string;
        staff_id: string | null;
      }>(
        `SELECT id, name, login, staff_id
         FROM auth_users
         WHERE clinic_id = $1 AND role = 'doctor' AND staff_id IS NOT NULL`,
        [clinicId]
      );
      return res.rows;
    })) ?? [];
  const byStaffId = new Map<string, StaffRecipient>();
  for (const row of rows) {
    const staffId = row.staff_id?.trim();
    if (!staffId) continue;
    byStaffId.set(staffId, {
      id: row.id,
      name: row.name || "Врач",
      email: row.login || undefined,
    });
  }
  return byStaffId;
}

async function listAdminRecipients(clinicId: string): Promise<StaffRecipient[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string; name: string; login: string }>(
        `SELECT id, name, login
         FROM auth_users
         WHERE clinic_id = $1 AND role = 'admin'`,
        [clinicId]
      );
      return res.rows.map((row) => ({
        id: row.id,
        name: row.name || "Администратор",
        email: row.login || undefined,
      }));
    })) ?? []
  );
}

export async function maybeNotifyClinicStaffEvents(input: {
  clinicId: string;
  prevSnapshot: ClinicPersistedState;
  nextSnapshot: ClinicPersistedState;
}): Promise<void> {
  if (!(await clinicHasModule(input.clinicId, "notifications"))) return;

  const config = await getNotificationConfig(input.clinicId);
  if (!config.settings.enabled) return;

  const events = buildStaffEvents({
    prevSnapshot: input.prevSnapshot,
    nextSnapshot: input.nextSnapshot,
  });
  if (!events.length) return;

  const channels = pickStaffNotificationChannels(
    config.settings.enabledChannels,
    config.settings.testMode
  );

  const doctorAuthByStaffId = events.some((e) => e.audience === "doctor")
    ? await listDoctorAuthRecipientsByStaffId(input.clinicId)
    : new Map<string, StaffRecipient>();
  const doctorRecipients = new Map<string, StaffRecipient>();
  for (const doctor of input.nextSnapshot.doctors) {
    const authDoctor = doctorAuthByStaffId.get(doctor.id);
    doctorRecipients.set(doctor.id, {
      id: authDoctor?.id ?? doctor.id,
      name: doctor.name || authDoctor?.name || "Врач",
      email: doctor.email || authDoctor?.email || undefined,
      phone: doctor.phone || undefined,
    });
  }
  const ownerRecipients = events.some((e) => e.audience === "owner")
    ? await listOwnerRecipients(input.clinicId)
    : [];
  const adminRecipients = events.some((e) => e.audience === "admin")
    ? await listAdminRecipients(input.clinicId)
    : [];

  for (const event of events) {
    let recipients: StaffRecipient[] = ownerRecipients;
    if (event.audience === "doctor") {
      const doctorRecipient = event.doctorId
        ? doctorRecipients.get(event.doctorId)
        : undefined;
      recipients = doctorRecipient ? [doctorRecipient] : [];
    } else if (event.audience === "admin") {
      recipients = adminRecipients;
    }
    if (!recipients.length) continue;

    const pushResult = await sendWebPushToUsers({
      clinicId: input.clinicId,
      userIds: recipients.map((r) => r.id),
      title: event.subject,
      body: event.body,
      url: staffEventUrl(event.audience),
    });
    if (pushResult.sent === 0 && pushResult.failed === 0) {
      console.info("[notifications] staff web-push: no subscriptions", {
        clinicId: input.clinicId,
        audience: event.audience,
        recipientIds: recipients.map((r) => r.id),
      });
    }

    for (const recipient of recipients) {
      for (const channel of channels) {
        const toAddress = resolveStaffRecipientAddress(channel, recipient);
        if (!toAddress) continue;
        const provider = resolveActiveProvider(channel, config.settings.testMode);
        const result = await provider
          .send({
            clinicId: input.clinicId,
            patientId: event.patientId ?? recipient.id,
            channel,
            toAddress,
            subject: event.subject,
            body: event.body,
            isTest: config.settings.testMode,
          })
          .catch((error) => ({
            ok: false as const,
            error: error instanceof Error ? error.message : "send failed",
          }));
        if (!result.ok) {
          console.warn("[notifications] staff delivery failed", {
            clinicId: input.clinicId,
            audience: event.audience,
            recipientId: recipient.id,
            channel,
            error: result.error ?? "unknown",
          });
        }
      }
    }
  }
}

export async function listClinicIdsWithNotificationsModule(): Promise<string[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM clinics WHERE COALESCE((modules->>'notifications')::boolean, false) = true`
      );
      return res.rows.map((r) => r.id);
    })) ?? []
  );
}
