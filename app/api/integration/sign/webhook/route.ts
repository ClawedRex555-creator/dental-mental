import { NextResponse } from "next/server";
import { withDb } from "@/lib/db";
import { verifyEmkaroSignHmac } from "@/lib/document-sign/emkaro-sign/hmac";
import { readEmkaroSignEnv } from "@/lib/document-sign/emkaro-sign/config.server";
import { applySignWebhookStatus } from "@/lib/document-sign/requests.server";
import { applyDocumentSignConsents } from "@/lib/document-sign/consents.server";
import { auditFromRequest, writeAuditLog } from "@/lib/audit-log.server";
import {
  isSupportedSignWebhookEvent,
  isWebhookTimestampFresh,
  mapWebhookEventToSignatureStatus,
} from "@/lib/document-sign/clinic-sms/rules";
import { isDatabaseEnabled } from "@/lib/db";

interface Payload {
  event?: string;
  eventId?: string;
  timestamp?: string;
  packageId?: string;
  publicId?: string;
  signatureStatus?: string;
  signatureMethod?: string;
  signedAt?: string;
}

async function claimEventId(eventId: string, payload: Payload): Promise<boolean> {
  const inserted = await withDb(async (client) => {
    try {
      await client.query(
        `INSERT INTO emkaro_sign_webhook_events (event_id, package_id, event_type, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [
          eventId,
          payload.packageId ?? null,
          payload.event ?? "unknown",
          JSON.stringify(payload),
        ]
      );
      return true;
    } catch {
      return false;
    }
  });
  return Boolean(inserted);
}

export async function POST(request: Request) {
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 });
  }

  const { webhookSecret } = readEmkaroSignEnv();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook не настроен" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-emkaro-signature")?.trim() ?? "";
  if (!signature || !verifyEmkaroSignHmac(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: "Неверная подпись" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = JSON.parse(rawBody) as Payload;
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  if (!payload.event || !isSupportedSignWebhookEvent(payload.event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!isWebhookTimestampFresh(payload.timestamp)) {
    return NextResponse.json({ error: "Устаревшее событие" }, { status: 400 });
  }

  const eventId =
    payload.eventId?.trim() ||
    `${payload.packageId ?? "unknown"}-${payload.event}-${payload.timestamp ?? Date.now()}`;

  const claimed = await claimEventId(eventId, payload);
  if (!claimed) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!payload.packageId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const updated = await applySignWebhookStatus({
    packageId: payload.packageId,
    signatureStatus:
      payload.signatureStatus ?? mapWebhookEventToSignatureStatus(payload.event),
    signatureMethod: payload.signatureMethod ?? "Emkaro Sign",
    signedAt: payload.signedAt,
    signOperationId: payload.publicId,
  });

  if (payload.event === "signature.package.signed" && updated) {
    await applyDocumentSignConsents({
      clinicId: updated.clinicId,
      patientId: updated.patientId,
      requestId: updated.id,
      documentRefs: updated.documentRefs,
      signedAt: payload.signedAt ?? new Date().toISOString(),
      source: "emkaro_sign",
    });
    await writeAuditLog(
      auditFromRequest(request, {
        clinicId: updated.clinicId,
        action: "update",
        resourceType: "patient",
        resourceId: updated.patientId,
        metadata: {
          documentSignRequestId: updated.id,
          provider: "emkaro_sign",
          externalId: payload.packageId,
          eventId,
          event: payload.event,
        },
      })
    );
  }

  return NextResponse.json({ ok: true });
}
