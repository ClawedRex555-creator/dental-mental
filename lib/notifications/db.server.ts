import "server-only";

import type {
  NotificationChannel,
  NotificationDeliveryRow,
  NotificationDeliveryStatus,
  NotificationEventType,
} from "@/lib/notifications/types";
import { withDb } from "@/lib/db";

function mapRow(r: Record<string, unknown>): NotificationDeliveryRow {
  return {
    id: String(r.id),
    clinicId: String(r.clinic_id),
    patientId: String(r.patient_id),
    appointmentId: String(r.appointment_id),
    channel: r.channel as NotificationChannel,
    eventType: r.event_type as NotificationEventType,
    reminderOffsetMinutes: Number(r.reminder_offset_minutes),
    status: r.status as NotificationDeliveryStatus,
    scheduledAt: new Date(String(r.scheduled_at)).toISOString(),
    sentAt: r.sent_at ? new Date(String(r.sent_at)).toISOString() : undefined,
    deliveredAt: r.delivered_at ? new Date(String(r.delivered_at)).toISOString() : undefined,
    errorMessage: r.error_message ? String(r.error_message) : undefined,
    retryCount: Number(r.retry_count) || 0,
    providerMessageId: r.provider_message_id ? String(r.provider_message_id) : undefined,
    messagePreview: r.message_preview ? String(r.message_preview) : undefined,
    isTest: r.is_test === true,
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  };
}

export async function insertNotificationDelivery(input: {
  clinicId: string;
  patientId: string;
  appointmentId: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  reminderOffsetMinutes: number;
  scheduledAt: Date;
  isTest?: boolean;
  messagePreview?: string;
}): Promise<string | null> {
  return (
    (await withDb(async (client) => {
      try {
        const res = await client.query<{ id: string }>(
          `INSERT INTO notification_deliveries
            (clinic_id, patient_id, appointment_id, channel, event_type,
             reminder_offset_minutes, scheduled_at, status, is_test, message_preview)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            input.clinicId,
            input.patientId,
            input.appointmentId,
            input.channel,
            input.eventType,
            input.reminderOffsetMinutes,
            input.scheduledAt.toISOString(),
            input.isTest ?? false,
            input.messagePreview?.slice(0, 500) ?? null,
          ]
        );
        return res.rows[0]?.id ?? null;
      } catch {
        return null;
      }
    })) ?? null
  );
}

export async function cancelPendingForAppointment(
  clinicId: string,
  appointmentId: string
): Promise<number> {
  return (
    (await withDb(async (client) => {
      const res = await client.query(
        `UPDATE notification_deliveries SET status = 'cancelled', updated_at = NOW()
         WHERE clinic_id = $1 AND appointment_id = $2
           AND status IN ('pending', 'retry')`,
        [clinicId, appointmentId]
      );
      return res.rowCount ?? 0;
    })) ?? 0
  );
}

export async function listPendingDeliveries(limit = 50, clinicId?: string): Promise<NotificationDeliveryRow[]> {
  return (
    (await withDb(async (client) => {
      const params: unknown[] = [limit];
      let sql = `SELECT * FROM notification_deliveries
        WHERE status IN ('pending', 'retry') AND scheduled_at <= NOW()`;
      if (clinicId) {
        sql += ` AND clinic_id = $2`;
        params.push(clinicId);
      }
      sql += ` ORDER BY scheduled_at ASC LIMIT $1`;
      const res = await client.query(sql, params);
      return res.rows.map((r) => mapRow(r as Record<string, unknown>));
    })) ?? []
  );
}

export async function claimDelivery(id: string, clinicId: string): Promise<boolean> {
  return (
    (await withDb(async (client) => {
      const res = await client.query(
        `UPDATE notification_deliveries SET status = 'sending', updated_at = NOW()
         WHERE id = $1 AND clinic_id = $2 AND status IN ('pending', 'retry')
         RETURNING id`,
        [id, clinicId]
      );
      return (res.rowCount ?? 0) > 0;
    })) ?? false
  );
}

export async function markDeliverySent(input: {
  id: string;
  clinicId: string;
  providerMessageId?: string;
  delivered?: boolean;
  messagePreview?: string;
}): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `UPDATE notification_deliveries SET
         status = $4,
         sent_at = NOW(),
         delivered_at = CASE WHEN $5 THEN NOW() ELSE delivered_at END,
         provider_message_id = COALESCE($3, provider_message_id),
         message_preview = COALESCE($6, message_preview),
         error_message = NULL,
         updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2`,
      [
        input.id,
        input.clinicId,
        input.providerMessageId ?? null,
        input.delivered ? "delivered" : "sent",
        input.delivered ?? false,
        input.messagePreview?.slice(0, 500) ?? null,
      ]
    );
  });
}

export async function markDeliveryFailed(input: {
  id: string;
  clinicId: string;
  error: string;
  retry: boolean;
  retryDelayMinutes?: number;
}): Promise<void> {
  await withDb(async (client) => {
    const delay = input.retryDelayMinutes ?? 15;
    await client.query(
      `UPDATE notification_deliveries SET
         status = $4,
         error_message = $3,
         retry_count = retry_count + 1,
         scheduled_at = CASE WHEN $4 = 'retry' THEN NOW() + ($5::text || ' minutes')::interval ELSE scheduled_at END,
         updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2`,
      [input.id, input.clinicId, input.error.slice(0, 1000), input.retry ? "retry" : "failed", String(delay)]
    );
  });
}

export async function listNotificationLogs(
  clinicId: string,
  options?: { limit?: number; offset?: number }
): Promise<NotificationDeliveryRow[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  return (
    (await withDb(async (client) => {
      const res = await client.query(
        `SELECT * FROM notification_deliveries
         WHERE clinic_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [clinicId, limit, offset]
      );
      return res.rows.map((r) => mapRow(r as Record<string, unknown>));
    })) ?? []
  );
}

export async function getNotificationDelivery(
  clinicId: string,
  id: string
): Promise<NotificationDeliveryRow | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query(
        `SELECT * FROM notification_deliveries WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
        [clinicId, id]
      );
      const row = res.rows[0];
      return row ? mapRow(row as Record<string, unknown>) : null;
    })) ?? null
  );
}

export async function resetDeliveryForRetry(clinicId: string, id: string): Promise<boolean> {
  return (
    (await withDb(async (client) => {
      const res = await client.query(
        `UPDATE notification_deliveries SET status = 'pending', scheduled_at = NOW(), updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2 AND status IN ('failed', 'cancelled')
         RETURNING id`,
        [clinicId, id]
      );
      return (res.rowCount ?? 0) > 0;
    })) ?? false
  );
}
