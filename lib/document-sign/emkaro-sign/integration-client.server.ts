import "server-only";

import {
  getEmkaroSignTenantForClinic,
  isEmkaroSignConfigured,
  readEmkaroSignEnv,
} from "@/lib/document-sign/emkaro-sign/config.server";
import {
  emkaroSignImportDocument,
  emkaroSignImportPatient,
} from "@/lib/document-sign/emkaro-sign/client.server";
import { redactSignUrl } from "@/lib/document-sign/clinic-sms/crypto";
import type { EmkaroSignTenantConfig } from "@/lib/document-sign/emkaro-sign/types";
import type { Patient } from "@/lib/types";

export interface SignPackageDocumentInput {
  documentId: string;
  documentType: string;
  documentName: string;
  pdfBase64: string;
}

export interface SignCreatePackageResult {
  packageId: string;
  status: string;
  recipientPhone?: string;
  publicSignUrl: string;
  smsText: string;
  expiresAt?: string;
  signOperationId?: string;
  accepted?: Array<{ documentId?: string; title: string; typeCode?: string }>;
  rejected?: Array<{
    documentId?: string;
    title: string;
    typeCode?: string;
    reason: string;
    requiredMethod?: string;
  }>;
}

import { assertProductionGuards } from "@/lib/document-sign/clinic-sms/rules";

function isMockSignEnabled(): boolean {
  const guard = assertProductionGuards({
    NODE_ENV: process.env.NODE_ENV,
    EMKARO_SIGN_MOCK: process.env.EMKARO_SIGN_MOCK,
  });
  if (!guard.ok) {
    throw new Error(guard.error);
  }
  if (process.env.NODE_ENV === "production") return false;
  return process.env.EMKARO_SIGN_MOCK?.trim() === "1";
}

function buildSmsTextFromUrl(publicSignUrl: string): string {
  return `Emkaro Sign: документы для подписания: ${publicSignUrl}`;
}

/**
 * Server-side client: МИС → Emkaro Sign.
 * Секреты только на сервере. В production mock запрещён.
 */
export class SignIntegrationClient {
  constructor(
    private readonly clinicId: string,
    private readonly tenant: EmkaroSignTenantConfig
  ) {}

  static async forClinic(clinicId: string): Promise<
    | { ok: true; client: SignIntegrationClient }
    | { ok: false; error: string }
  > {
    if (isMockSignEnabled()) {
      return {
        ok: true,
        client: new SignIntegrationClient(clinicId, {
          organizationId: "00000000-0000-4000-8000-000000000001",
          clinicId: "00000000-0000-4000-8000-000000000002",
        }),
      };
    }
    if (!isEmkaroSignConfigured()) {
      return {
        ok: false,
        error: "Сервис подписания временно недоступен (Emkaro Sign не настроен)",
      };
    }
    const tenant = await getEmkaroSignTenantForClinic(clinicId);
    if (!tenant) {
      return {
        ok: false,
        error: "Клиника не привязана к Emkaro Sign",
      };
    }
    return { ok: true, client: new SignIntegrationClient(clinicId, tenant) };
  }

  async createSignaturePackage(input: {
    patient: Patient;
    documents: SignPackageDocumentInput[];
    requestedByUserId?: string;
    recipientPhone: string;
  }): Promise<
    | { ok: true; result: SignCreatePackageResult }
    | { ok: false; error: string; result?: Partial<SignCreatePackageResult> }
  > {
    if (isMockSignEnabled()) {
      const packageId = `ES-MOCK-${crypto.randomUUID().slice(0, 8)}`;
      const publicSignUrl = `https://sign.emkaro.ru/s/mock-${packageId}`;
      return {
        ok: true,
        result: {
          packageId,
          status: "READY_TO_SEND",
          recipientPhone: input.recipientPhone,
          publicSignUrl,
          smsText: buildSmsTextFromUrl(publicSignUrl),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          signOperationId: packageId,
          accepted: input.documents.map((d) => ({
            documentId: d.documentId,
            title: d.documentName,
            typeCode: d.documentType,
          })),
          rejected: [],
        },
      };
    }

    const patientImport = await emkaroSignImportPatient({
      tenant: this.tenant,
      patient: input.patient,
    });
    if (!patientImport.ok) {
      return { ok: false, error: patientImport.error };
    }

    const externalDocumentIds: string[] = [];
    for (const doc of input.documents) {
      const imported = await emkaroSignImportDocument({
        tenant: this.tenant,
        signPatientId: patientImport.patientId,
        externalDocumentId: doc.documentId,
        documentTypeCode: doc.documentType,
        documentName: doc.documentName,
        pdfBase64: doc.pdfBase64,
        createdBy: input.requestedByUserId,
      });
      if (!imported.ok) {
        return { ok: false, error: imported.error };
      }
      externalDocumentIds.push(doc.documentId);
    }

    const { apiUrl, apiKey } = readEmkaroSignEnv();
    const controllers: AbortController[] = [];
    const ac = new AbortController();
    controllers.push(ac);
    const timer = setTimeout(() => ac.abort(), 45_000);

    try {
      // Prefer v1 contract; fallback to legacy type=send
      let res = await fetch(`${apiUrl}/api/integration/v1/signature-packages`, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({
          organizationId: this.tenant.organizationId,
          clinicId: this.tenant.clinicId,
          patient: {
            patientId: input.patient.id,
            firstName: input.patient.firstName,
            lastName: input.patient.lastName,
            patronymic: input.patient.middleName,
            dateOfBirth: input.patient.birthDate,
          },
          documents: input.documents.map((d) => ({
            documentId: d.documentId,
            documentType: d.documentType,
            documentName: d.documentName,
            fileReference: d.documentId,
          })),
          externalDocumentIds,
          emkaroPatientId: input.patient.id,
          deliveryMode: "clinic_device",
          requestedByUserId: input.requestedByUserId,
        }),
      });

      if (res.status === 404) {
        res = await fetch(`${apiUrl}/api/integration?type=send`, {
          method: "POST",
          signal: ac.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify({
            organizationId: this.tenant.organizationId,
            clinicId: this.tenant.clinicId,
            emkaroPatientId: input.patient.id,
            externalDocumentIds,
            deliveryMode: "clinic_device",
          }),
        });
      }

      let body: Record<string, unknown> = {};
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }

      if (!res.ok && res.status !== 422) {
        const err = body.error as { message?: string } | undefined;
        console.error("[emkaro-sign] create package failed", {
          status: res.status,
          message: err?.message,
        });
        return {
          ok: false,
          error: err?.message ?? "Сервис подписания временно недоступен",
        };
      }

      const packageId =
        (typeof body.packageId === "string" && body.packageId) ||
        (typeof body.id === "string" && body.id) ||
        null;

      const publicSignUrl =
        (typeof body.publicSignUrl === "string" && body.publicSignUrl) ||
        (typeof body.devSignUrl === "string" && body.devSignUrl) ||
        "";

      let smsText =
        typeof body.smsText === "string" && body.smsText.trim()
          ? body.smsText.trim()
          : "";

      if (!packageId) {
        return {
          ok: false,
          error: "Документы нельзя подписать через Emkaro Sign",
          result: {
            rejected: Array.isArray(body.rejected)
              ? (body.rejected as SignCreatePackageResult["rejected"])
              : undefined,
          },
        };
      }

      if (!publicSignUrl) {
        console.error("[emkaro-sign] package without publicSignUrl", {
          packageId,
        });
        return {
          ok: false,
          error: "Sign не вернул ссылку для подписания (publicSignUrl)",
        };
      }

      if (!smsText) {
        smsText = buildSmsTextFromUrl(publicSignUrl);
      }

      console.info("[emkaro-sign] package ready", {
        packageId,
        url: redactSignUrl(publicSignUrl),
      });

      return {
        ok: true,
        result: {
          packageId,
          status: typeof body.status === "string" ? body.status : "READY_TO_SEND",
          recipientPhone:
            typeof body.recipientPhone === "string"
              ? body.recipientPhone
              : input.recipientPhone,
          publicSignUrl,
          smsText,
          expiresAt:
            typeof body.expiresAt === "string" ? body.expiresAt : undefined,
          signOperationId:
            typeof body.signOperationId === "string"
              ? body.signOperationId
              : typeof body.publicId === "string"
                ? body.publicId
                : packageId,
          accepted: Array.isArray(body.accepted)
            ? (body.accepted as SignCreatePackageResult["accepted"])
            : undefined,
          rejected: Array.isArray(body.rejected)
            ? (body.rejected as SignCreatePackageResult["rejected"])
            : undefined,
        },
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        error: aborted
          ? "Таймаут Emkaro Sign"
          : "Сервис подписания временно недоступен",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async cancelPackage(packageId: string): Promise<{ ok: boolean; error?: string }> {
    if (isMockSignEnabled()) return { ok: true };
    const { apiUrl, apiKey } = readEmkaroSignEnv();
    try {
      const res = await fetch(
        `${apiUrl}/api/integration/v1/signature-packages/${encodeURIComponent(packageId)}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: JSON.stringify({
            organizationId: this.tenant.organizationId,
            clinicId: this.tenant.clinicId,
          }),
        }
      );
      if (res.ok || res.status === 404) return { ok: true };
      return { ok: false, error: `Sign cancel HTTP ${res.status}` };
    } catch {
      return { ok: false, error: "Сервис подписания временно недоступен" };
    }
  }
}
