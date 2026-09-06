import "server-only";

import { withDb } from "@/lib/db";
import { maskPhoneDisplay } from "@/lib/document-sign/clinic-sms/crypto";
import type {
  ClinicSmsSendTask,
  ClinicSmsTaskDeviceView,
  ClinicSmsTaskStatus,
} from "@/lib/document-sign/clinic-sms/types";

interface TaskRow {
  id: string;
  clinic_id: string;
  package_id: string;
  sign_request_id: string | null;
  patient_id: string;
  patient_display_name: string;
  recipient_phone: string;
  recipient_phone_masked: string;
  sms_text: string;
  public_sign_url: string;
  document_titles: unknown;
  device_id: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  expires_at: Date;
  status: ClinicSmsTaskStatus;
  presented_at: Date | null;
  composer_opened_at: Date | null;
  manual_send_confirmed_at: Date | null;
  manual_send_confirmed_by: string | null;
  idempotency_key: string | null;
}

function mapTask(r: TaskRow): ClinicSmsSendTask {
  const titles = Array.isArray(r.document_titles)
    ? (r.document_titles as string[])
    : [];
  return {
    id: r.id,
    clinicId: r.clinic_id,
    packageId: r.package_id,
    signRequestId: r.sign_request_id ?? undefined,
    patientId: r.patient_id,
    patientDisplayName: r.patient_display_name,
    recipientPhone: r.recipient_phone,
    recipientPhoneMasked: r.recipient_phone_masked || maskPhoneDisplay(r.recipient_phone),
    smsText: r.sms_text,
    publicSignUrl: r.public_sign_url,
    documentTitles: titles,
    deviceId: r.device_id ?? undefined,
    createdByUserId: r.created_by_user_id ?? undefined,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    status: r.status,
    presentedAt: r.presented_at?.toISOString(),
    composerOpenedAt: r.composer_opened_at?.toISOString(),
    manualSendConfirmedAt: r.manual_send_confirmed_at?.toISOString(),
    manualSendConfirmedBy: r.manual_send_confirmed_by ?? undefined,
    idempotencyKey: r.idempotency_key ?? undefined,
  };
}

export function toDeviceView(task: ClinicSmsSendTask): ClinicSmsTaskDeviceView {
  return {
    id: task.id,
    patientDisplayName: task.patientDisplayName,
    recipientPhoneMasked: task.recipientPhoneMasked,
    documentCount: task.documentTitles.length,
    status: task.status,
    expiresAt: task.expiresAt,
    createdAt: task.createdAt,
  };
}

export async function findTaskByIdempotency(
  clinicId: string,
  idempotencyKey: string
): Promise<ClinicSmsSendTask | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<TaskRow>(
        `SELECT * FROM clinic_sms_send_tasks
         WHERE clinic_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [clinicId, idempotencyKey]
      );
      return res.rows[0] ? mapTask(res.rows[0]) : null;
    })) ?? null
  );
}

export async function createClinicSmsSendTask(input: {
  clinicId: string;
  packageId: string;
  signRequestId?: string;
  patientId: string;
  patientDisplayName: string;
  recipientPhone: string;
  smsText: string;
  publicSignUrl: string;
  documentTitles: string[];
  deviceId?: string | null;
  createdByUserId?: string;
  expiresAt: Date;
  idempotencyKey?: string;
}): Promise<ClinicSmsSendTask | null> {
  if (input.idempotencyKey) {
    const existing = await findTaskByIdempotency(input.clinicId, input.idempotencyKey);
    if (existing) return existing;
  }

  const hasDevice = Boolean(input.deviceId);
  const status: ClinicSmsTaskStatus = hasDevice ? "WAITING_FOR_DEVICE" : "CREATED";

  return (
    (await withDb(async (client) => {
      const res = await client.query<TaskRow>(
        `INSERT INTO clinic_sms_send_tasks
          (clinic_id, package_id, sign_request_id, patient_id, patient_display_name,
           recipient_phone, recipient_phone_masked, sms_text, public_sign_url,
           document_titles, device_id, created_by_user_id, expires_at, status, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          input.clinicId,
          input.packageId,
          input.signRequestId ?? null,
          input.patientId,
          input.patientDisplayName,
          input.recipientPhone,
          maskPhoneDisplay(input.recipientPhone),
          input.smsText,
          input.publicSignUrl,
          JSON.stringify(input.documentTitles),
          input.deviceId ?? null,
          input.createdByUserId ?? null,
          input.expiresAt,
          status,
          input.idempotencyKey ?? null,
        ]
      );
      return res.rows[0] ? mapTask(res.rows[0]) : null;
    })) ?? null
  );
}

export async function listOpenTasksForClinic(
  clinicId: string,
  limit = 20
): Promise<ClinicSmsSendTask[]> {
  return (
    (await withDb(async (client) => {
      await client.query(
        `UPDATE clinic_sms_send_tasks
         SET status = 'EXPIRED', updated_at = NOW()
         WHERE clinic_id = $1 AND status IN ('CREATED','WAITING_FOR_DEVICE','PRESENTED_TO_DEVICE','SMS_COMPOSER_OPENED')
           AND expires_at < NOW()`,
        [clinicId]
      );
      const res = await client.query<TaskRow>(
        `SELECT * FROM clinic_sms_send_tasks
         WHERE clinic_id = $1
           AND status IN ('CREATED','WAITING_FOR_DEVICE','PRESENTED_TO_DEVICE','SMS_COMPOSER_OPENED')
         ORDER BY created_at DESC
         LIMIT $2`,
        [clinicId, limit]
      );
      return res.rows.map(mapTask);
    })) ?? []
  );
}

export async function getTaskForClinic(
  clinicId: string,
  taskId: string
): Promise<ClinicSmsSendTask | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<TaskRow>(
        `SELECT * FROM clinic_sms_send_tasks WHERE clinic_id = $1 AND id = $2`,
        [clinicId, taskId]
      );
      return res.rows[0] ? mapTask(res.rows[0]) : null;
    })) ?? null
  );
}

export async function markTaskPresented(
  clinicId: string,
  taskId: string,
  deviceId: string
): Promise<ClinicSmsSendTask | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<TaskRow>(
        `UPDATE clinic_sms_send_tasks
         SET status = CASE
               WHEN status IN ('CREATED','WAITING_FOR_DEVICE') THEN 'PRESENTED_TO_DEVICE'
               ELSE status
             END,
             device_id = COALESCE(device_id, $3),
             presented_at = COALESCE(presented_at, NOW()),
             updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2
           AND status IN ('CREATED','WAITING_FOR_DEVICE','PRESENTED_TO_DEVICE','SMS_COMPOSER_OPENED')
         RETURNING *`,
        [clinicId, taskId, deviceId]
      );
      return res.rows[0] ? mapTask(res.rows[0]) : null;
    })) ?? null
  );
}

export async function markComposerOpened(
  clinicId: string,
  taskId: string
): Promise<ClinicSmsSendTask | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<TaskRow>(
        `UPDATE clinic_sms_send_tasks
         SET status = 'SMS_COMPOSER_OPENED',
             composer_opened_at = COALESCE(composer_opened_at, NOW()),
             updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2
           AND status IN ('PRESENTED_TO_DEVICE','WAITING_FOR_DEVICE','CREATED','SMS_COMPOSER_OPENED')
         RETURNING *`,
        [clinicId, taskId]
      );
      return res.rows[0] ? mapTask(res.rows[0]) : null;
    })) ?? null
  );
}

export async function confirmManualSend(input: {
  clinicId: string;
  taskId: string;
  confirmedBy: string;
}): Promise<ClinicSmsSendTask | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<TaskRow>(
        `UPDATE clinic_sms_send_tasks
         SET status = 'MANUAL_SEND_CONFIRMED',
             manual_send_confirmed_at = NOW(),
             manual_send_confirmed_by = $3,
             updated_at = NOW()
         WHERE clinic_id = $1 AND id = $2
           AND status IN ('SMS_COMPOSER_OPENED','PRESENTED_TO_DEVICE','WAITING_FOR_DEVICE','CREATED')
         RETURNING *`,
        [input.clinicId, input.taskId, input.confirmedBy]
      );
      return res.rows[0] ? mapTask(res.rows[0]) : null;
    })) ?? null
  );
}

export async function cancelSmsTask(
  clinicId: string,
  taskId: string
): Promise<boolean> {
  const ok = await withDb(async (client) => {
    const res = await client.query(
      `UPDATE clinic_sms_send_tasks
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE clinic_id = $1 AND id = $2
         AND status NOT IN ('MANUAL_SEND_CONFIRMED','CANCELLED','EXPIRED')`,
      [clinicId, taskId]
    );
    return (res.rowCount ?? 0) > 0;
  });
  return Boolean(ok);
}

export async function getLatestTaskForPackage(
  clinicId: string,
  packageId: string
): Promise<ClinicSmsSendTask | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<TaskRow>(
        `SELECT * FROM clinic_sms_send_tasks
         WHERE clinic_id = $1 AND package_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [clinicId, packageId]
      );
      return res.rows[0] ? mapTask(res.rows[0]) : null;
    })) ?? null
  );
}
