import "server-only";

import { applyDocumentSignConsents } from "@/lib/document-sign/consents.server";
import { readFdocEnv } from "@/lib/document-sign/fdoc/config.server";
import { fdocGetPackageStatus } from "@/lib/document-sign/fdoc/client.server";
import type { FdocWebhookPayload } from "@/lib/document-sign/fdoc/types";
import {
  getDocumentSignRequestByExternalId,
  markDocumentSignSigned,
  updateDocumentSignFdocMeta,
} from "@/lib/document-sign/requests.server";

export function verifyFdocWebhookAuth(request: Request): boolean {
  const secret = readFdocEnv().webhookSecret;
  if (!secret) return true;
  const header =
    request.headers.get("x-fdoc-signature")?.trim() ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return header === secret;
}

function extractExternalId(payload: FdocWebhookPayload): string | null {
  return (
    payload.packageId?.trim() ||
    payload.externalId?.trim() ||
    (typeof payload.id === "string" ? payload.id.trim() : null)
  );
}

function isSignedStatus(status: string | undefined): boolean {
  const s = status?.trim().toLowerCase() ?? "";
  return s === "signed" || s === "completed" || s === "done";
}

export async function handleFdocWebhookPayload(
  payload: FdocWebhookPayload
): Promise<{ ok: boolean; handled: boolean; error?: string }> {
  const externalId = extractExternalId(payload);
  if (!externalId) {
    return { ok: true, handled: false, error: "Нет packageId в webhook" };
  }

  const record = await getDocumentSignRequestByExternalId(externalId);
  if (!record) {
    return { ok: true, handled: false, error: "Пакет не найден в Emkaro" };
  }

  const fdocStatus = payload.status?.trim() ?? record.fdocStatus;
  await updateDocumentSignFdocMeta({
    requestId: record.id,
    fdocStatus: fdocStatus ?? undefined,
    fdocSignUrl: record.fdocSignUrl,
    signedDocumentUrl:
      (payload.signedDocumentUrl as string | undefined) ?? record.signedDocumentUrl,
  });

  if (!isSignedStatus(payload.status)) {
    return { ok: true, handled: true };
  }

  if (record.status === "signed") {
    return { ok: true, handled: true };
  }

  const signed = await markDocumentSignSigned({ requestId: record.id });
  if (!signed) {
    return { ok: false, handled: false, error: "Не удалось обновить статус" };
  }

  const signedAt = payload.signedAt ?? new Date().toISOString();
  await applyDocumentSignConsents({
    clinicId: record.clinicId,
    patientId: record.patientId,
    requestId: record.id,
    documentRefs: record.documentRefs,
    signedAt,
    source: "fdoc",
  });

  return { ok: true, handled: true };
}

/** Опрос статуса pending-пакетов F.Doc (cron или ручной вызов). */
export async function syncFdocPackageStatus(record: {
  id: string;
  clinicId: string;
  patientId: string;
  externalId?: string;
  documentRefs: import("@/lib/document-sign/types").DocumentSignRef[];
  status: string;
}): Promise<{ updated: boolean; error?: string }> {
  if (!record.externalId || record.status !== "pending") {
    return { updated: false };
  }

  const remote = await fdocGetPackageStatus(record.externalId);
  if (!remote.ok) {
    return { updated: false, error: remote.error };
  }

  await updateDocumentSignFdocMeta({
    requestId: record.id,
    fdocStatus: remote.status,
    signedDocumentUrl: remote.signedDocumentUrl,
  });

  if (remote.status !== "signed") {
    return { updated: false };
  }

  const signed = await markDocumentSignSigned({ requestId: record.id });
  if (!signed) return { updated: false };

  const signedAt = remote.signedAt ?? new Date().toISOString();
  await applyDocumentSignConsents({
    clinicId: record.clinicId,
    patientId: record.patientId,
    requestId: record.id,
    documentRefs: record.documentRefs,
    signedAt,
    source: "fdoc",
  });

  return { updated: true };
}

export async function syncPendingFdocPackages(limit = 50): Promise<{
  scanned: number;
  signed: number;
  errors: string[];
}> {
  const { listPendingFdocDocumentSignRequests } = await import(
    "@/lib/document-sign/requests.server"
  );
  const pending = await listPendingFdocDocumentSignRequests(limit);
  let signed = 0;
  const errors: string[] = [];

  for (const row of pending) {
    const result = await syncFdocPackageStatus(row);
    if (result.updated) signed += 1;
    if (result.error) errors.push(`${row.id}: ${result.error}`);
  }

  return { scanned: pending.length, signed, errors };
}
