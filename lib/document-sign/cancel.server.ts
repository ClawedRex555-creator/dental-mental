import "server-only";

import { SignIntegrationClient } from "@/lib/document-sign/emkaro-sign/integration-client.server";
import { canCancelSignPackage } from "@/lib/document-sign/clinic-sms/rules";
import {
  cancelSmsTask,
  getLatestTaskForPackage,
} from "@/lib/document-sign/clinic-sms/tasks.server";
import {
  getDocumentSignRequestById,
  getDocumentSignRequestByExternalId,
} from "@/lib/document-sign/requests.server";
import { withDb } from "@/lib/db";

export async function cancelEmkaroSignPackage(input: {
  clinicId: string;
  requestId?: string;
  packageId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  let record = input.requestId
    ? await getDocumentSignRequestById(input.clinicId, input.requestId)
    : null;
  if (!record && input.packageId) {
    record = await getDocumentSignRequestByExternalId(input.packageId, "emkaro_sign");
    if (record && record.clinicId !== input.clinicId) {
      return { ok: false, error: "Пакет не найден" };
    }
  }
  if (!record || record.provider !== "emkaro_sign") {
    return { ok: false, error: "Пакет не найден" };
  }
  if (!canCancelSignPackage(record.signatureStatus, record.status)) {
    return { ok: false, error: "Подписанный пакет нельзя отменить" };
  }

  const packageId = record.externalId ?? record.signPackageId;
  if (!packageId) {
    return { ok: false, error: "У пакета нет external id" };
  }

  const clientRes = await SignIntegrationClient.forClinic(input.clinicId);
  if (!clientRes.ok) {
    return { ok: false, error: clientRes.error };
  }
  const cancelled = await clientRes.client.cancelPackage(packageId);
  if (!cancelled.ok) {
    return { ok: false, error: cancelled.error ?? "Не удалось отменить в Sign" };
  }

  await withDb(async (client) => {
    await client.query(
      `UPDATE document_sign_requests
       SET status = 'cancelled',
           signature_status = 'CANCELLED',
           last_sign_sync_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND clinic_id = $2 AND status = 'pending'`,
      [record!.id, input.clinicId]
    );
  });

  const task = await getLatestTaskForPackage(input.clinicId, packageId);
  if (task) {
    await cancelSmsTask(input.clinicId, task.id);
  }

  return { ok: true };
}
