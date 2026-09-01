import "server-only";

import { formatPatientDisplayName } from "@/lib/notifications/template-service";
import { getClinicDataDb } from "@/lib/clinic-data-db.server";
import { applyDocumentSignConsents } from "@/lib/document-sign/consents.server";
import { DOCUMENT_SIGN_MAX_OTP_ATTEMPTS } from "@/lib/document-sign/config.server";
import { verifyOtp } from "@/lib/document-sign/otp.server";
import {
  getDocumentSignRequestByTokenHash,
  incrementDocumentSignOtpAttempts,
  markDocumentSignExpired,
  markDocumentSignFailed,
  markDocumentSignSigned,
} from "@/lib/document-sign/requests.server";
import {
  hashDocumentSignToken,
  verifyDocumentSignToken,
} from "@/lib/document-sign/token.server";
import type { DocumentSignPublicView } from "@/lib/document-sign/types";
import { checkRateLimitDb, recordRateLimitFailureDb } from "@/lib/rate-limit.server";

const OTP_RATE_WINDOW_MS = 15 * 60 * 1000;

const FDOC_SIGNING_HINT =
  "Подписание через F.Doc: откройте ссылку из SMS от F.Doc и введите код. Страница Emkaro используется только для собственной SMS-подписи.";

function buildPublicView(input: {
  record: Awaited<ReturnType<typeof getDocumentSignRequestByTokenHash>>;
  clinicName: string;
  patientName: string;
}): DocumentSignPublicView {
  const { record, clinicName, patientName } = input;
  if (!record) throw new Error("record required");

  const view: DocumentSignPublicView = {
    clinicName,
    patientName,
    documents: record.documentRefs,
    status: record.status,
    provider: record.provider,
    expiresAt: record.expiresAt,
    signedAt: record.signedAt,
  };

  if (record.provider === "fdoc" && record.status === "pending") {
    view.signingHint = FDOC_SIGNING_HINT;
  }

  return view;
}

export async function getDocumentSignPublicView(
  token: string
): Promise<{ ok: true; view: DocumentSignPublicView } | { ok: false; error: string; status: number }> {
  const payload = verifyDocumentSignToken(token);
  if (!payload) {
    return { ok: false, error: "Ссылка недействительна или истекла", status: 400 };
  }

  const record = await getDocumentSignRequestByTokenHash(hashDocumentSignToken(token));
  if (!record || record.id !== payload.requestId) {
    return { ok: false, error: "Запрос не найден", status: 404 };
  }

  const snapshot = await getClinicDataDb(record.clinicId);
  const patient = snapshot?.data.patients.find((p) => p.id === record.patientId);
  const clinicName = snapshot?.data.clinicSettings?.name?.trim() || "Клиника";
  const patientName = patient ? formatPatientDisplayName(patient) : "Пациент";

  if (record.provider === "fdoc") {
    return {
      ok: true,
      view: buildPublicView({ record, clinicName, patientName }),
    };
  }

  if (record.status === "signed") {
    return {
      ok: true,
      view: buildPublicView({ record, clinicName, patientName }),
    };
  }

  if (record.status !== "pending") {
    return { ok: false, error: "Запрос недоступен", status: 410 };
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await markDocumentSignExpired(record.id);
    return { ok: false, error: "Срок подписи истёк. Попросите клинику отправить ссылку снова.", status: 410 };
  }

  if (!patient) {
    return { ok: false, error: "Пациент не найден", status: 404 };
  }

  return {
    ok: true,
    view: buildPublicView({ record, clinicName, patientName }),
  };
}

export async function confirmDocumentSign(input: {
  token: string;
  code: string;
  signedIp?: string;
  signedUserAgent?: string;
}): Promise<{ ok: true; signedAt: string } | { ok: false; error: string; status: number }> {
  const payload = verifyDocumentSignToken(input.token);
  if (!payload) {
    return { ok: false, error: "Ссылка недействительна или истекла", status: 400 };
  }

  const record = await getDocumentSignRequestByTokenHash(hashDocumentSignToken(input.token));
  if (!record || record.id !== payload.requestId) {
    return { ok: false, error: "Запрос не найден", status: 404 };
  }

  if (record.provider === "fdoc") {
    return {
      ok: false,
      error: "Этот пакет подписывается через F.Doc — используйте ссылку из SMS F.Doc",
      status: 400,
    };
  }

  if (record.status === "signed") {
    return { ok: true, signedAt: record.signedAt ?? new Date().toISOString() };
  }

  if (record.status !== "pending") {
    return { ok: false, error: "Запрос недоступен", status: 410 };
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await markDocumentSignExpired(record.id);
    return { ok: false, error: "Срок подписи истёк", status: 410 };
  }

  const rateKey = `document-sign-otp:${record.id}`;
  const limited = await checkRateLimitDb(rateKey, DOCUMENT_SIGN_MAX_OTP_ATTEMPTS);
  if (limited && !limited.allowed) {
    await markDocumentSignFailed(record.id);
    return {
      ok: false,
      error: "Превышено число попыток. Запросите новую ссылку в клинике.",
      status: 429,
    };
  }

  if (record.otpAttempts >= DOCUMENT_SIGN_MAX_OTP_ATTEMPTS) {
    await markDocumentSignFailed(record.id);
    return {
      ok: false,
      error: "Превышено число попыток. Запросите новую ссылку в клинике.",
      status: 429,
    };
  }

  const codeOk = verifyOtp(input.code, record.id, record.otpHash);
  if (!codeOk) {
    await incrementDocumentSignOtpAttempts(record.id);
    await recordRateLimitFailureDb(rateKey, OTP_RATE_WINDOW_MS);
    return { ok: false, error: "Неверный код из SMS", status: 400 };
  }

  const signed = await markDocumentSignSigned({
    requestId: record.id,
    signedIp: input.signedIp,
    signedUserAgent: input.signedUserAgent,
  });
  if (!signed) {
    return { ok: false, error: "Не удалось сохранить подпись", status: 500 };
  }

  const signedAt = new Date().toISOString();
  await applyDocumentSignConsents({
    clinicId: record.clinicId,
    patientId: record.patientId,
    requestId: record.id,
    documentRefs: record.documentRefs,
    signedAt,
    source: "emkaro",
  });

  return { ok: true, signedAt };
}
