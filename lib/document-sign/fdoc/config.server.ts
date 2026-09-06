import "server-only";

import type { DocumentSignProvider } from "@/lib/document-sign/types";

export interface FdocEnvConfig {
  apiUrl: string;
  apiKey: string;
  login: string;
  password: string;
  webhookSecret: string;
  employeeId: string;
  testMode: boolean;
}

export function readFdocEnv(): FdocEnvConfig {
  return {
    apiUrl: process.env.FDOC_API_URL?.trim().replace(/\/$/, "") ?? "",
    apiKey: process.env.FDOC_API_KEY?.trim() ?? "",
    login: process.env.FDOC_LOGIN?.trim() ?? "",
    password: process.env.FDOC_PASSWORD?.trim() ?? "",
    webhookSecret: process.env.FDOC_WEBHOOK_SECRET?.trim() ?? "",
    employeeId: process.env.FDOC_EMPLOYEE_ID?.trim() ?? "",
    testMode: process.env.FDOC_TEST_MODE?.trim() === "1",
  };
}

export function isFdocConfigured(): boolean {
  const c = readFdocEnv();
  return Boolean(c.apiUrl && c.apiKey && c.login && c.password);
}

export function resolveDocumentSignProvider(): DocumentSignProvider {
  const raw = process.env.DOCUMENT_SIGN_PROVIDER?.trim().toLowerCase();
  if (raw === "emkaro_sign") return "emkaro_sign";
  if (raw === "fdoc" && isFdocConfigured()) return "fdoc";
  if (raw === "fdoc" && !isFdocConfigured()) return "emkaro";
  return "emkaro";
}

export function documentSignProviderLabel(provider: DocumentSignProvider): string {
  if (provider === "fdoc") return "F.Doc";
  if (provider === "emkaro_sign") return "Emkaro Sign";
  return "SMS (Emkaro)";
}
