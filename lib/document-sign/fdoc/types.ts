/** Типы интеграции F.Doc (REST API партнёра). Детали — после выдачи документации fdoc.ru. */

export type FdocPackageStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "unknown";

export interface FdocDocumentPayload {
  title: string;
  fileName?: string;
  /** Base64 PDF — заполним после сборки комплекта из юр. шаблонов */
  contentBase64?: string;
}

export interface FdocCreatePackageInput {
  misRequestId: string;
  clinicLegalName: string;
  clinicInn?: string;
  recipientPhone: string;
  recipientName: string;
  recipientEmail?: string;
  documents: FdocDocumentPayload[];
  webhookUrl?: string;
  /** ID сотрудника в F.Doc (если требуется API) */
  fdocEmployeeId?: string;
}

export interface FdocCreatePackageResult {
  ok: boolean;
  externalId?: string;
  signUrl?: string;
  status?: FdocPackageStatus;
  error?: string;
  raw?: unknown;
}

export interface FdocPackageStatusResult {
  ok: boolean;
  externalId: string;
  status: FdocPackageStatus;
  signedAt?: string;
  signedDocumentUrl?: string;
  error?: string;
  raw?: unknown;
}

export interface FdocWebhookPayload {
  packageId?: string;
  externalId?: string;
  status?: string;
  signedAt?: string;
  signedDocumentUrl?: string;
  misRequestId?: string;
  [key: string]: unknown;
}
