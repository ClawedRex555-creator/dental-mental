import "server-only";

import { formatPatientDisplayName } from "@/lib/notifications/template-service";
import { SmsNotificationProvider } from "@/lib/notifications/providers/sms.server";
import { clinicBaseUrl } from "@/lib/clinic-host";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import {
  DOCUMENT_SIGN_OTP_TTL_MS,
  documentSignProviderLabel,
  isFdocConfigured,
  resolveDocumentSignProvider,
} from "@/lib/document-sign/config.server";
import { fdocCreatePackage } from "@/lib/document-sign/fdoc/client.server";
import { buildFdocDocumentsFromRefs } from "@/lib/document-sign/fdoc/documents.server";
import { hashOtp } from "@/lib/document-sign/otp.server";
import {
  cancelPendingDocumentSignRequests,
  createDocumentSignRequest,
} from "@/lib/document-sign/requests.server";
import {
  buildDocumentSignPageUrl,
  generateOtpCode,
  hashDocumentSignToken,
  signDocumentSignToken,
} from "@/lib/document-sign/token.server";
import type { DocumentSignProvider, DocumentSignRef } from "@/lib/document-sign/types";
import type { Patient } from "@/lib/types";

export interface SendDocumentSignInput {
  clinicId: string;
  clinicSlug: string;
  patient: Patient;
  documentRefs: DocumentSignRef[];
  appointmentId?: string;
  createdBy?: string;
  publicBaseUrl?: string;
  /** Принудительный провайдер (иначе из DOCUMENT_SIGN_PROVIDER) */
  provider?: DocumentSignProvider;
}

export interface SendDocumentSignResult {
  ok: boolean;
  requestId?: string;
  provider?: DocumentSignProvider;
  externalId?: string;
  error?: string;
  debugOtp?: string;
  debugSignUrl?: string;
}

function resolvePublicBaseUrl(clinicSlug: string, override?: string): string {
  return (
    override?.trim() ||
    process.env.APP_PUBLIC_BASE_URL?.trim() ||
    clinicBaseUrl(clinicSlug)
  );
}

function buildSmsText(input: {
  clinicName: string;
  otp: string;
  signUrl: string;
  documentCount: number;
}): string {
  const docs =
    input.documentCount === 1
      ? "документ"
      : input.documentCount < 5
        ? "документа"
        : "документов";
  return `${input.clinicName}: код ${input.otp} для подписи ${input.documentCount} ${docs}. ${input.signUrl}`;
}

async function sendViaEmkaro(input: {
  requestId: string;
  clinicId: string;
  clinicSlug: string;
  patient: Patient;
  documentRefs: DocumentSignRef[];
  appointmentId?: string;
  createdBy?: string;
  publicBaseUrl?: string;
  clinicName: string;
  expiresAt: Date;
}): Promise<SendDocumentSignResult> {
  const phone = input.patient.phone!.trim();
  const token = signDocumentSignToken({
    requestId: input.requestId,
    clinicId: input.clinicId,
    patientId: input.patient.id,
  });
  const tokenHash = hashDocumentSignToken(token);
  const baseUrl = resolvePublicBaseUrl(input.clinicSlug, input.publicBaseUrl);
  const signUrl = buildDocumentSignPageUrl(baseUrl, token);
  const otp = generateOtpCode();
  const otpHash = hashOtp(otp, input.requestId);

  const record = await createDocumentSignRequest({
    id: input.requestId,
    clinicId: input.clinicId,
    patientId: input.patient.id,
    appointmentId: input.appointmentId,
    phone,
    documentRefs: input.documentRefs,
    provider: "emkaro",
    otpHash,
    tokenHash,
    expiresAt: input.expiresAt,
    createdBy: input.createdBy,
  });
  if (!record) {
    return { ok: false, error: "Не удалось сохранить запрос подписи" };
  }

  const sms = new SmsNotificationProvider();
  const smsText = buildSmsText({
    clinicName: input.clinicName,
    otp,
    signUrl,
    documentCount: input.documentRefs.length,
  });

  if (sms.isConfigured()) {
    const sent = await sms.send({
      clinicId: input.clinicId,
      patientId: input.patient.id,
      channel: "sms",
      toAddress: phone,
      body: smsText,
    });
    if (!sent.ok) {
      return { ok: false, error: sent.error ?? "Не удалось отправить SMS" };
    }
  } else if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      error: "SMS-шлюз не настроен (NOTIFICATIONS_SMS_API_URL, NOTIFICATIONS_SMS_API_KEY)",
    };
  }

  const result: SendDocumentSignResult = {
    ok: true,
    requestId: record.id,
    provider: "emkaro",
  };

  if (!sms.isConfigured() && process.env.NODE_ENV !== "production") {
    result.debugOtp = otp;
    result.debugSignUrl = signUrl;
  }

  return result;
}

async function sendViaFdoc(input: {
  requestId: string;
  clinicId: string;
  clinicSlug: string;
  patient: Patient;
  documentRefs: DocumentSignRef[];
  appointmentId?: string;
  createdBy?: string;
  publicBaseUrl?: string;
  clinicName: string;
  clinicInn?: string;
  expiresAt: Date;
}): Promise<SendDocumentSignResult> {
  const phone = input.patient.phone!.trim();
  const baseUrl = resolvePublicBaseUrl(input.clinicSlug, input.publicBaseUrl);
  const patientName = formatPatientDisplayName(input.patient);

  const fdocResult = await fdocCreatePackage({
    misRequestId: input.requestId,
    clinicLegalName: input.clinicName,
    clinicInn: input.clinicInn,
    recipientPhone: phone,
    recipientName: patientName,
    recipientEmail: input.patient.email,
    documents: buildFdocDocumentsFromRefs(input.documentRefs),
    webhookUrl: `${baseUrl}/api/document-sign/fdoc-webhook`,
  });

  if (!fdocResult.ok) {
    return { ok: false, error: fdocResult.error ?? "F.Doc: не удалось создать пакет" };
  }

  const record = await createDocumentSignRequest({
    id: input.requestId,
    clinicId: input.clinicId,
    patientId: input.patient.id,
    appointmentId: input.appointmentId,
    phone,
    documentRefs: input.documentRefs,
    provider: "fdoc",
    externalId: fdocResult.externalId,
    fdocStatus: fdocResult.status,
    fdocSignUrl: fdocResult.signUrl,
    expiresAt: input.expiresAt,
    createdBy: input.createdBy,
  });
  if (!record) {
    return { ok: false, error: "Не удалось сохранить запрос подписи" };
  }

  return {
    ok: true,
    requestId: record.id,
    provider: "fdoc",
    externalId: fdocResult.externalId,
  };
}

export async function sendDocumentSignPackage(
  input: SendDocumentSignInput
): Promise<SendDocumentSignResult> {
  const phone = input.patient.phone?.trim();
  if (!phone) {
    return { ok: false, error: "У пациента не указан телефон" };
  }
  if (input.documentRefs.length === 0) {
    return { ok: false, error: "Выберите документы для подписи" };
  }

  const configured = input.provider ?? resolveDocumentSignProvider();
  if (configured === "fdoc" && process.env.DOCUMENT_SIGN_PROVIDER?.trim().toLowerCase() === "fdoc") {
    const { isFdocConfigured } = await import("@/lib/document-sign/fdoc/config.server");
    if (!isFdocConfigured()) {
      return {
        ok: false,
        error:
          "DOCUMENT_SIGN_PROVIDER=fdoc, но не заданы FDOC_* переменные. См. docs/FDOC-INTEGRATION.md",
      };
    }
  }

  const snapshot = await getClinicDataDb(input.clinicId);
  const clinicName = snapshot?.data.clinicSettings?.name?.trim() || "Клиника";
  const clinicInn = snapshot?.data.clinicSettings?.inn?.trim();

  await cancelPendingDocumentSignRequests(input.clinicId, input.patient.id);

  const requestId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + DOCUMENT_SIGN_OTP_TTL_MS);

  const common = {
    requestId,
    clinicId: input.clinicId,
    clinicSlug: input.clinicSlug,
    patient: input.patient,
    documentRefs: input.documentRefs,
    appointmentId: input.appointmentId,
    createdBy: input.createdBy,
    publicBaseUrl: input.publicBaseUrl,
    clinicName,
    expiresAt,
  };

  if (configured === "fdoc") {
    return sendViaFdoc({ ...common, clinicInn });
  }

  return sendViaEmkaro(common);
}

export function getDocumentSignConfigView(): {
  activeProvider: DocumentSignProvider;
  configuredProvider: DocumentSignProvider;
  fdocConfigured: boolean;
  emkaroSmsConfigured: boolean;
  label: string;
} {
  const configuredRaw = process.env.DOCUMENT_SIGN_PROVIDER?.trim().toLowerCase();
  const configuredProvider: DocumentSignProvider =
    configuredRaw === "fdoc" ? "fdoc" : "emkaro";
  const activeProvider = resolveDocumentSignProvider();
  const sms = new SmsNotificationProvider();

  return {
    activeProvider,
    configuredProvider,
    fdocConfigured: isFdocConfigured(),
    emkaroSmsConfigured: sms.isConfigured(),
    label: documentSignProviderLabel(activeProvider),
  };
}

export { DOCUMENT_SIGN_OTP_TTL_MS, DOCUMENT_SIGN_MAX_OTP_ATTEMPTS } from "@/lib/document-sign/config.server";
