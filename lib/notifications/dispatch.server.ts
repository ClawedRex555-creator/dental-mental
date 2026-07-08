import "server-only";

import {
  claimDelivery,
  getNotificationDelivery,
  markDeliveryFailed,
  markDeliverySent,
} from "@/lib/notifications/db.server";
import {
  buildTemplateContext,
  findTemplateForChannel,
  renderNotificationTemplate,
  resolveRecipientAddress,
} from "@/lib/notifications/context.server";
import { getNotificationConfig } from "@/lib/notifications/settings.server";
import { resolveActiveProvider } from "@/lib/notifications/providers/index.server";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import type { NotificationDeliveryRow } from "@/lib/notifications/types";

export async function dispatchNotificationDelivery(
  row: NotificationDeliveryRow
): Promise<{ ok: boolean; error?: string }> {
  const claimed = await claimDelivery(row.id, row.clinicId);
  if (!claimed) return { ok: false, error: "Already processing" };

  const config = await getNotificationConfig(row.clinicId);
  const settings = config.settings;

  if (row.retryCount >= settings.retryCount && row.status === "retry") {
    await markDeliveryFailed({
      id: row.id,
      clinicId: row.clinicId,
      error: "Превышено число повторов",
      retry: false,
    });
    return { ok: false, error: "Max retries exceeded" };
  }

  const snapshot = await getClinicDataDb(row.clinicId);
  if (!snapshot) {
    await markDeliveryFailed({
      id: row.id,
      clinicId: row.clinicId,
      error: "Нет данных клиники",
      retry: false,
    });
    return { ok: false, error: "No snapshot" };
  }

  const patient = snapshot.data.patients.find((p) => p.id === row.patientId);
  const appointment = snapshot.data.appointments.find((a) => a.id === row.appointmentId);
  if (!patient || !appointment) {
    await markDeliveryFailed({
      id: row.id,
      clinicId: row.clinicId,
      error: "Пациент или запись не найдены",
      retry: false,
    });
    return { ok: false, error: "Missing patient/appointment" };
  }

  const tpl = findTemplateForChannel(config.templates, row.channel, row.eventType);
  const ctx = buildTemplateContext({
    patient,
    appointment,
    snapshot: snapshot.data,
    settings,
    clinicId: row.clinicId,
  });
  const body = tpl
    ? renderNotificationTemplate(tpl.body, ctx)
    : row.messagePreview ?? "";
  const subject = tpl?.subject
    ? renderNotificationTemplate(tpl.subject, ctx)
    : "Напоминание о записи";

  const toAddress = resolveRecipientAddress(row.channel, patient);
  const provider = resolveActiveProvider(row.channel, settings.testMode || row.isTest);

  const result = await provider.send({
    clinicId: row.clinicId,
    patientId: row.patientId,
    channel: row.channel,
    toAddress,
    subject,
    body,
    isTest: row.isTest,
  });

  if (result.ok) {
    await markDeliverySent({
      id: row.id,
      clinicId: row.clinicId,
      providerMessageId: result.providerMessageId,
      delivered: result.delivered,
      messagePreview: body.slice(0, 200),
    });
    return { ok: true };
  }

  const canRetry =
    settings.retryEnabled && row.retryCount + 1 < settings.retryCount;
  await markDeliveryFailed({
    id: row.id,
    clinicId: row.clinicId,
    error: result.error ?? "Ошибка отправки",
    retry: canRetry,
    retryDelayMinutes: settings.retryDelayMinutes,
  });
  return { ok: false, error: result.error };
}

export async function dispatchNotificationById(
  clinicId: string,
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const row = await getNotificationDelivery(clinicId, id);
  if (!row) return { ok: false, error: "Запись не найдена" };
  return dispatchNotificationDelivery(row);
}
