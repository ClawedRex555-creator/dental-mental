import "server-only";

import { formatPatientDisplayName } from "@/lib/notifications/template-service";
import { SmsNotificationProvider } from "@/lib/notifications/providers/sms.server";
import { clinicBaseUrl } from "@/lib/clinic-host";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import { buildArrivalDocumentPdf } from "@/lib/document-sign/arrival-pdf.server";
import {
  getEmkaroSignTenantForClinic,
  isEmkaroSignConfigured,
} from "@/lib/document-sign/emkaro-sign/config.server";
import { SignIntegrationClient } from "@/lib/document-sign/emkaro-sign/integration-client.server";
import {
  maskPhoneForSign,
  resolveSignDocumentType,
} from "@/lib/document-sign/emkaro-sign/document-types";
import { getPrimaryDeviceId } from "@/lib/document-sign/clinic-sms/devices.server";
import { createClinicSmsSendTask } from "@/lib/document-sign/clinic-sms/tasks.server";
import {
  shortPatientName,
  sha256Hex,
} from "@/lib/document-sign/clinic-sms/crypto";
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
  findActiveEmkaroSignRequest,
  getDocumentSignRequestByIdempotency,
} from "@/lib/document-sign/requests.server";
import { buildSignIdempotencyKey } from "@/lib/document-sign/clinic-sms/rules";
import {
  buildDocumentSignPageUrl,
  generateOtpCode,
  hashDocumentSignToken,
  signDocumentSignToken,
} from "@/lib/document-sign/token.server";
import type { DocumentSignProvider, DocumentSignRef } from "@/lib/document-sign/types";
import { legalDocumentToArrival, type ArrivalPrintDocument } from "@/lib/legal-categories";
import { clinicHasModule } from "@/lib/module-access.server";
import type { Doctor, LegalDocument, Patient, ClinicSettings } from "@/lib/types";

export interface SendDocumentSignInput {
  clinicId: string;
  clinicSlug: string;
  patient: Patient;
  documentRefs: DocumentSignRef[];
  appointmentId?: string;
  createdBy?: string;
  publicBaseUrl?: string;
  doctor?: Doctor;
  appointmentDate?: string;
  sendToEgisz?: "yes" | "no";
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
  acceptedTitles?: string[];
  rejected?: Array<{ title: string; reason: string; requiredMethod?: string }>;
  smsTaskId?: string;
  smsTaskStatus?: string;
  desktopStatus?: string;
  alreadyExists?: boolean;
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

function resolveArrivalDocuments(
  legalDocuments: LegalDocument[],
  refs: DocumentSignRef[]
): ArrivalPrintDocument[] {
  const byId = new Map<string, ArrivalPrintDocument>();
  for (const doc of legalDocuments) {
    const arrival = legalDocumentToArrival(doc);
    if (arrival) byId.set(arrival.id, arrival);
  }

  const out: ArrivalPrintDocument[] = [];
  for (const ref of refs) {
    const found = byId.get(ref.id);
    if (found) {
      out.push(found);
      continue;
    }
    if (ref.id === "builtin-egisz-refusal") {
      out.push({
        id: ref.id,
        name: ref.name,
        kind: "egisz_refusal",
        notes: "Отказ от передачи данных в ЕГИСЗ",
      });
      continue;
    }
    out.push({
      id: ref.id,
      name: ref.name,
      kind: (ref.kind as ArrivalPrintDocument["kind"]) ?? "consent",
    });
  }
  return out;
}

function formatRejectedMessage(
  rejected: Array<{ title: string; reason: string; requiredMethod?: string }>
): string {
  return rejected
    .map((r) => {
      const method = r.requiredMethod ? ` (${r.requiredMethod})` : "";
      return `• ${r.title}: ${r.reason}${method}`;
    })
    .join("\n");
}

async function sendViaEmkaroSign(input: {
  requestId: string;
  clinicId: string;
  clinicSlug: string;
  patient: Patient;
  documentRefs: DocumentSignRef[];
  legalDocuments: LegalDocument[];
  clinicSettings: ClinicSettings;
  doctor?: Doctor;
  appointmentId?: string;
  appointmentDate?: string;
  sendToEgisz?: "yes" | "no";
  createdBy?: string;
  expiresAt: Date;
}): Promise<SendDocumentSignResult> {
  const mockOk =
    process.env.NODE_ENV !== "production" &&
    process.env.EMKARO_SIGN_MOCK?.trim() === "1";
  if (!mockOk && !isEmkaroSignConfigured()) {
    return {
      ok: false,
      error:
        "Emkaro Sign не настроен: задайте EMKARO_SIGN_API_URL и EMKARO_SIGN_API_KEY",
    };
  }
  if (!mockOk && !(await getEmkaroSignTenantForClinic(input.clinicId))) {
    return {
      ok: false,
      error:
        "Клиника не привязана к Emkaro Sign (emkaro_sign_config или EMKARO_SIGN_TENANT_MAP)",
    };
  }

  const docIds = input.documentRefs.map((d) => d.id).sort();
  const idempotencyKey = sha256Hex(
    buildSignIdempotencyKey({
      clinicId: input.clinicId,
      patientId: input.patient.id,
      documentIds: docIds,
    })
  );

  const byIdempotency = await getDocumentSignRequestByIdempotency(
    input.clinicId,
    idempotencyKey
  );
  if (byIdempotency?.status === "pending" && byIdempotency.externalId) {
    return {
      ok: true,
      alreadyExists: true,
      requestId: byIdempotency.id,
      provider: "emkaro_sign",
      externalId: byIdempotency.externalId,
      desktopStatus: "Уже есть активный пакет на эти документы",
      acceptedTitles: byIdempotency.documentRefs.map((d) => d.name),
    };
  }

  const active = await findActiveEmkaroSignRequest({
    clinicId: input.clinicId,
    patientId: input.patient.id,
    documentIds: docIds,
  });
  if (active?.externalId) {
    return {
      ok: true,
      alreadyExists: true,
      requestId: active.id,
      provider: "emkaro_sign",
      externalId: active.externalId,
      desktopStatus: "Уже есть активный пакет на эти документы",
      error: undefined,
      acceptedTitles: active.documentRefs.map((d) => d.name),
    };
  }

  const arrivalDocs = resolveArrivalDocuments(input.legalDocuments, input.documentRefs);
  const localRejected: Array<{ title: string; reason: string; requiredMethod?: string }> = [];
  const toImport: Array<{ doc: ArrivalPrintDocument; typeCode: string }> = [];

  for (const doc of arrivalDocs) {
    const mapped = resolveSignDocumentType({ kind: doc.kind, name: doc.name });
    if (!mapped.ok) {
      localRejected.push({ title: doc.name, reason: mapped.reason });
      continue;
    }
    if (!mapped.smsAllowed) {
      localRejected.push({
        title: doc.name,
        reason: "Требуется квалифицированная подпись (УКЭП), SMS-ПЭП недоступен",
        requiredMethod: "UKEP",
      });
      continue;
    }
    toImport.push({ doc, typeCode: mapped.code });
  }

  if (toImport.length === 0) {
    return {
      ok: false,
      provider: "emkaro_sign",
      error:
        "Ни один выбранный документ нельзя подписать по SMS через Emkaro Sign:\n" +
        formatRejectedMessage(localRejected),
      rejected: localRejected,
    };
  }

  const ctx = {
    patient: input.patient,
    clinic: input.clinicSettings,
    doctor: input.doctor,
    appointmentDate: input.appointmentDate,
  };

  const prepared: Array<{
    documentId: string;
    documentType: string;
    documentName: string;
    pdfBase64: string;
  }> = [];

  for (const { doc, typeCode } of toImport) {
    const pdf = await buildArrivalDocumentPdf(doc, ctx, {
      sendToEgisz: input.sendToEgisz,
    });
    if (!pdf.ok || !pdf.pdfBytes) {
      localRejected.push({
        title: doc.name,
        reason: pdf.error ?? "Не удалось подготовить PDF",
      });
      continue;
    }
    prepared.push({
      documentId: doc.id,
      documentType: typeCode,
      documentName: doc.name,
      pdfBase64: Buffer.from(pdf.pdfBytes).toString("base64"),
    });
  }

  if (prepared.length === 0) {
    return {
      ok: false,
      provider: "emkaro_sign",
      error:
        "Не удалось подготовить документы для Emkaro Sign:\n" +
        formatRejectedMessage(localRejected),
      rejected: localRejected,
    };
  }

  const clientRes = await SignIntegrationClient.forClinic(input.clinicId);
  if (!clientRes.ok) {
    return { ok: false, error: clientRes.error };
  }

  const phone = input.patient.phone!.trim();
  const sent = await clientRes.client.createSignaturePackage({
    patient: input.patient,
    documents: prepared,
    requestedByUserId: input.createdBy,
    recipientPhone: phone,
  });

  const signRejected: Array<{ title: string; reason: string; requiredMethod?: string }> = (
    sent.result?.rejected ?? []
  ).map((r) => ({
    title: r.title,
    reason: r.reason,
    requiredMethod: r.requiredMethod,
  }));
  const allRejected = [...localRejected, ...signRejected];

  if (!sent.ok || !sent.result?.packageId) {
    const errMsg = sent.ok ? undefined : sent.error;
    return {
      ok: false,
      provider: "emkaro_sign",
      error:
        errMsg ??
        "Документы нельзя подписать через Emkaro Sign:\n" +
          formatRejectedMessage(allRejected),
      rejected: allRejected.length > 0 ? allRejected : undefined,
    };
  }

  const packageResult = sent.result;
  const phoneMasked = maskPhoneForSign(phone);
  const expiresAt = packageResult.expiresAt
    ? new Date(packageResult.expiresAt)
    : input.expiresAt;

  const record = await createDocumentSignRequest({
    id: input.requestId,
    clinicId: input.clinicId,
    patientId: input.patient.id,
    appointmentId: input.appointmentId,
    phone: phoneMasked,
    documentRefs: input.documentRefs,
    provider: "emkaro_sign",
    externalId: packageResult.packageId,
    expiresAt,
    createdBy: input.createdBy,
    signatureStatus: packageResult.status || "READY_TO_SEND",
    signatureMethod: "Emkaro Sign",
    signPackageId: packageResult.packageId,
    signOperationId: packageResult.signOperationId,
    idempotencyKey,
  });
  if (!record) {
    return { ok: false, error: "Не удалось сохранить запрос подписи" };
  }

  const deviceId = await getPrimaryDeviceId(input.clinicId);
  const smsTask = await createClinicSmsSendTask({
    clinicId: input.clinicId,
    packageId: packageResult.packageId,
    signRequestId: record.id,
    patientId: input.patient.id,
    patientDisplayName: shortPatientName(input.patient),
    recipientPhone: phone,
    smsText: packageResult.smsText,
    publicSignUrl: packageResult.publicSignUrl,
    documentTitles: prepared.map((d) => d.documentName),
    deviceId,
    createdByUserId: input.createdBy,
    expiresAt,
    idempotencyKey: `sms:${idempotencyKey}`,
  });

  const acceptedTitles =
    packageResult.accepted?.map((a) => a.title) ??
    prepared.map((d) => d.documentName);

  return {
    ok: true,
    requestId: record.id,
    provider: "emkaro_sign",
    externalId: packageResult.packageId,
    acceptedTitles,
    rejected: allRejected.length > 0 ? allRejected : undefined,
    smsTaskId: smsTask?.id,
    smsTaskStatus: smsTask?.status,
    desktopStatus: deviceId
      ? "Пакет создан. Передано на телефон клиники"
      : "Пакет создан. Привяжите телефон клиники в Настройках → Emkaro Sign",
    debugSignUrl:
      process.env.NODE_ENV !== "production" ? packageResult.publicSignUrl : undefined,
  };
}

export async function sendDocumentSignPackage(
  input: SendDocumentSignInput
): Promise<SendDocumentSignResult> {
  const moduleEnabled = await clinicHasModule(input.clinicId, "document_sign");
  if (!moduleEnabled) {
    return {
      ok: false,
      error: "Подпись документов по SMS отключена для этой клиники",
    };
  }

  const phone = input.patient.phone?.trim();
  if (!phone) {
    return { ok: false, error: "У пациента не указан телефон" };
  }
  if (input.documentRefs.length === 0) {
    return { ok: false, error: "Выберите документы для подписи" };
  }

  const snapshot = await getClinicDataDb(input.clinicId);
  const clinicName = snapshot?.data.clinicSettings?.name?.trim() || "Клиника";
  const clinicInn = snapshot?.data.clinicSettings?.inn?.trim();
  const legalDocuments = snapshot?.data.legalDocuments ?? [];
  const clinicSettings = snapshot?.data.clinicSettings;

  const configured = input.provider ?? resolveDocumentSignProvider();

  if (configured === "emkaro_sign") {
    const mockOk =
      process.env.NODE_ENV !== "production" &&
      process.env.EMKARO_SIGN_MOCK?.trim() === "1";
    if (!mockOk && !isEmkaroSignConfigured()) {
      return {
        ok: false,
        error:
          "DOCUMENT_SIGN_PROVIDER=emkaro_sign, но Emkaro Sign не настроен (EMKARO_SIGN_API_URL, EMKARO_SIGN_API_KEY)",
      };
    }
    if (!mockOk && !(await getEmkaroSignTenantForClinic(input.clinicId))) {
      return {
        ok: false,
        error:
          "DOCUMENT_SIGN_PROVIDER=emkaro_sign, но клиника не привязана (emkaro_sign_config / EMKARO_SIGN_TENANT_MAP)",
      };
    }

    const docIds = input.documentRefs.map((d) => d.id).sort();
    const active = await findActiveEmkaroSignRequest({
      clinicId: input.clinicId,
      patientId: input.patient.id,
      documentIds: docIds,
    });
    if (active?.externalId) {
      return {
        ok: true,
        alreadyExists: true,
        requestId: active.id,
        provider: "emkaro_sign",
        externalId: active.externalId,
        desktopStatus: "Уже есть активный пакет на эти документы",
        acceptedTitles: active.documentRefs.map((d) => d.name),
      };
    }
  }

  if (configured === "fdoc" && process.env.DOCUMENT_SIGN_PROVIDER?.trim().toLowerCase() === "fdoc") {
    if (!isFdocConfigured()) {
      return {
        ok: false,
        error:
          "DOCUMENT_SIGN_PROVIDER=fdoc, но не заданы FDOC_* переменные. См. docs/FDOC-INTEGRATION.md",
      };
    }
  }

  if (configured !== "emkaro_sign") {
    await cancelPendingDocumentSignRequests(input.clinicId, input.patient.id);
  } else {
    // Для Sign не отменяем активный пакет тех же documentVersion — проверка выше.
    // Отменяем только прочие pending без совпадения (через cancel всех кроме active handled).
    await cancelPendingDocumentSignRequests(input.clinicId, input.patient.id);
  }

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

  if (configured === "emkaro_sign") {
    if (!clinicSettings) {
      return { ok: false, error: "Не удалось загрузить настройки клиники" };
    }
    return sendViaEmkaroSign({
      ...common,
      legalDocuments,
      clinicSettings,
      doctor: input.doctor,
      appointmentDate: input.appointmentDate,
      sendToEgisz: input.sendToEgisz,
    });
  }

  if (configured === "fdoc") {
    return sendViaFdoc({ ...common, clinicInn });
  }

  return sendViaEmkaro(common);
}

export async function getDocumentSignConfigView(clinicId: string): Promise<{
  activeProvider: DocumentSignProvider;
  configuredProvider: DocumentSignProvider;
  fdocConfigured: boolean;
  emkaroSmsConfigured: boolean;
  emkaroSignConfigured: boolean;
  emkaroSignTenantConfigured: boolean;
  moduleEnabled: boolean;
  ready: boolean;
  label: string;
}> {
  const moduleEnabled = await clinicHasModule(clinicId, "document_sign");
  const configuredRaw = process.env.DOCUMENT_SIGN_PROVIDER?.trim().toLowerCase();
  const configuredProvider: DocumentSignProvider =
    configuredRaw === "fdoc"
      ? "fdoc"
      : configuredRaw === "emkaro_sign"
        ? "emkaro_sign"
        : "emkaro";

  const emkaroSignConfigured =
    isEmkaroSignConfigured() ||
    (process.env.NODE_ENV !== "production" &&
      process.env.EMKARO_SIGN_MOCK?.trim() === "1");
  const emkaroSignTenantConfigured =
    Boolean(await getEmkaroSignTenantForClinic(clinicId)) ||
    (process.env.NODE_ENV !== "production" &&
      process.env.EMKARO_SIGN_MOCK?.trim() === "1");
  const activeProvider = resolveDocumentSignProvider();

  const ready =
    activeProvider !== "emkaro_sign" ||
    (emkaroSignConfigured && emkaroSignTenantConfigured);

  const sms = new SmsNotificationProvider();

  return {
    activeProvider,
    configuredProvider,
    fdocConfigured: isFdocConfigured(),
    emkaroSmsConfigured: sms.isConfigured(),
    emkaroSignConfigured,
    emkaroSignTenantConfigured,
    moduleEnabled,
    ready,
    label: documentSignProviderLabel(activeProvider),
  };
}

export { DOCUMENT_SIGN_OTP_TTL_MS, DOCUMENT_SIGN_MAX_OTP_ATTEMPTS } from "@/lib/document-sign/config.server";
