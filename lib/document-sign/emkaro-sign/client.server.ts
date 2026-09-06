import "server-only";

import { readEmkaroSignEnv } from "@/lib/document-sign/emkaro-sign/config.server";
import { maskPhoneForSign } from "@/lib/document-sign/emkaro-sign/document-types";
import type {
  EmkaroSignImportDocumentResult,
  EmkaroSignImportPatientResult,
  EmkaroSignPackageStatus,
  EmkaroSignSendPackageResult,
  EmkaroSignTenantConfig,
} from "@/lib/document-sign/emkaro-sign/types";
import type { Patient } from "@/lib/types";

interface ApiErrorBody {
  error?: { message?: string; code?: string };
}

async function signFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { acceptStatuses?: number[] }
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status?: number; data?: T }> {
  const { apiUrl, apiKey } = readEmkaroSignEnv();
  if (!apiUrl || !apiKey) {
    return { ok: false, error: "Emkaro Sign не настроен (EMKARO_SIGN_API_URL, EMKARO_SIGN_API_KEY)" };
  }

  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      ...(init?.headers ?? {}),
    },
  });

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const accepted = options?.acceptStatuses ?? [];
  if (!res.ok && !accepted.includes(res.status)) {
    const err = body as ApiErrorBody;
    return {
      ok: false,
      status: res.status,
      error: err.error?.message ?? `Emkaro Sign: HTTP ${res.status}`,
      data: body as T,
    };
  }

  return { ok: true, data: body as T, status: res.status };
}

/**
 * Импорт пациента без полного номера (152-ФЗ).
 * Sign хранит emkaroPatientId + маску; SMS-номер запрашивает через delivery-destination.
 */
export async function emkaroSignImportPatient(input: {
  tenant: EmkaroSignTenantConfig;
  patient: Patient;
}): Promise<{ ok: true; patientId: string } | { ok: false; error: string }> {
  const hasPhone = Boolean(input.patient.phone?.trim());
  const body: Record<string, unknown> = {
    emkaroPatientId: input.patient.id,
    organizationId: input.tenant.organizationId,
    clinicId: input.tenant.clinicId,
    firstName: input.patient.firstName,
    lastName: input.patient.lastName,
    patronymic: input.patient.middleName,
    dateOfBirth: input.patient.birthDate,
    phoneStatus: hasPhone ? "VERIFIED" : "UNVERIFIED",
  };
  if (hasPhone) {
    body.phoneMasked = maskPhoneForSign(input.patient.phone!);
  }

  const result = await signFetch<EmkaroSignImportPatientResult>(
    "/api/integration?type=patient",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  if (!result.ok) return result;
  return { ok: true, patientId: result.data.patientId };
}

export async function emkaroSignImportDocument(input: {
  tenant: EmkaroSignTenantConfig;
  signPatientId: string;
  externalDocumentId: string;
  documentTypeCode: string;
  documentName: string;
  pdfBase64: string;
  createdBy?: string;
}): Promise<{ ok: true; documentId: string } | { ok: false; error: string }> {
  const result = await signFetch<EmkaroSignImportDocumentResult>(
    "/api/integration?type=document",
    {
      method: "POST",
      body: JSON.stringify({
        externalDocumentId: input.externalDocumentId,
        organizationId: input.tenant.organizationId,
        clinicId: input.tenant.clinicId,
        patientId: input.signPatientId,
        documentTypeCode: input.documentTypeCode,
        documentName: input.documentName,
        pdfBase64: input.pdfBase64,
        createdBy: input.createdBy,
      }),
    }
  );
  if (!result.ok) return result;
  return { ok: true, documentId: result.data.documentId };
}

/** Создать и отправить пакет: SMS только на стороне Sign, номер не передаём. */
export async function emkaroSignCreateAndSendPackage(input: {
  tenant: EmkaroSignTenantConfig;
  emkaroPatientId: string;
  externalDocumentIds: string[];
}): Promise<
  | { ok: true; result: EmkaroSignSendPackageResult }
  | { ok: false; error: string; result?: EmkaroSignSendPackageResult }
> {
  const result = await signFetch<EmkaroSignSendPackageResult>(
    "/api/integration?type=send",
    {
      method: "POST",
      body: JSON.stringify({
        organizationId: input.tenant.organizationId,
        clinicId: input.tenant.clinicId,
        emkaroPatientId: input.emkaroPatientId,
        externalDocumentIds: input.externalDocumentIds,
      }),
    },
    { acceptStatuses: [422] }
  );

  if (!result.ok) {
    return { ok: false, error: result.error, result: result.data };
  }

  return { ok: true, result: result.data };
}

export async function emkaroSignGetPackageStatus(
  packageId: string
): Promise<{ ok: true; status: EmkaroSignPackageStatus } | { ok: false; error: string }> {
  const result = await signFetch<EmkaroSignPackageStatus>(
    `/api/integration?packageId=${encodeURIComponent(packageId)}`,
    { method: "GET" }
  );
  if (!result.ok) return result;
  return { ok: true, status: result.data };
}
