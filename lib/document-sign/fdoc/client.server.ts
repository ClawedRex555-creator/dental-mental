import "server-only";

import type {
  FdocCreatePackageInput,
  FdocCreatePackageResult,
  FdocPackageStatus,
  FdocPackageStatusResult,
} from "@/lib/document-sign/fdoc/types";
import { isFdocConfigured, readFdocEnv } from "@/lib/document-sign/fdoc/config.server";

/**
 * HTTP-клиент F.Doc REST API.
 *
 * Эндпоинты и тело запроса — **заглушки** под типичный REST.
 * После получения документации от fdoc.ru обновите:
 * - `FDOC_API_PATHS` ниже
 * - `buildCreatePackageBody`
 * - разбор ответа в `parseCreateResponse` / `parseStatusResponse`
 *
 * Заявка: https://fdoc.ru/integration/api/
 */
const FDOC_API_PATHS = {
  createPackage: "/api/v1/packages",
  getPackage: (id: string) => `/api/v1/packages/${encodeURIComponent(id)}`,
} as const;

function authHeaders(): HeadersInit {
  const { apiKey, login, password } = readFdocEnv();
  const basic = Buffer.from(`${login}:${password}`).toString("base64");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Basic ${basic}`,
    "X-Api-Key": apiKey,
  };
}

function normalizeStatus(raw: string | undefined): FdocPackageStatus {
  const s = raw?.trim().toLowerCase() ?? "";
  if (s === "signed" || s === "completed" || s === "done") return "signed";
  if (s === "sent" || s === "delivered") return "sent";
  if (s === "viewed" || s === "opened") return "viewed";
  if (s === "rejected" || s === "declined") return "rejected";
  if (s === "expired") return "expired";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "draft" || s === "created") return "draft";
  return "unknown";
}

function buildCreatePackageBody(input: FdocCreatePackageInput): Record<string, unknown> {
  const env = readFdocEnv();
  return {
    externalId: input.misRequestId,
    notifyBySms: true,
    testMode: env.testMode,
    callbackUrl: input.webhookUrl,
    senderEmployeeId: input.fdocEmployeeId || env.employeeId || undefined,
    organization: {
      name: input.clinicLegalName,
      inn: input.clinicInn,
    },
    recipient: {
      phone: input.recipientPhone.replace(/\D/g, ""),
      fullName: input.recipientName,
      email: input.recipientEmail,
    },
    documents: input.documents.map((d) => ({
      title: d.title,
      fileName: d.fileName ?? `${d.title}.pdf`,
      contentBase64: d.contentBase64,
    })),
  };
}

function parseCreateResponse(json: Record<string, unknown>): FdocCreatePackageResult {
  const externalId =
    (json.id as string | undefined) ??
    (json.packageId as string | undefined) ??
    (json.data as { id?: string } | undefined)?.id;
  const signUrl =
    (json.signUrl as string | undefined) ??
    (json.sign_url as string | undefined) ??
    (json.data as { signUrl?: string } | undefined)?.signUrl;
  const status = normalizeStatus(
    (json.status as string | undefined) ??
      (json.data as { status?: string } | undefined)?.status
  );
  if (!externalId) {
    return {
      ok: false,
      error: (json.error as string) ?? (json.message as string) ?? "F.Doc: нет id пакета в ответе",
      raw: json,
    };
  }
  return { ok: true, externalId, signUrl, status, raw: json };
}

function parseStatusResponse(externalId: string, json: Record<string, unknown>): FdocPackageStatusResult {
  const status = normalizeStatus(
    (json.status as string | undefined) ??
      (json.data as { status?: string } | undefined)?.status
  );
  const signedAt =
    (json.signedAt as string | undefined) ??
    (json.signed_at as string | undefined) ??
    (json.data as { signedAt?: string } | undefined)?.signedAt;
  const signedDocumentUrl =
    (json.signedDocumentUrl as string | undefined) ??
    (json.signed_document_url as string | undefined) ??
    (json.data as { signedDocumentUrl?: string } | undefined)?.signedDocumentUrl;
  return {
    ok: true,
    externalId,
    status,
    signedAt,
    signedDocumentUrl,
    raw: json,
  };
}

export async function fdocCreatePackage(
  input: FdocCreatePackageInput
): Promise<FdocCreatePackageResult> {
  if (!isFdocConfigured()) {
    return {
      ok: false,
      error:
        "F.Doc не настроен. Заполните FDOC_API_URL, FDOC_API_KEY, FDOC_LOGIN, FDOC_PASSWORD (ключ после заявки на fdoc.ru).",
    };
  }

  const { apiUrl } = readFdocEnv();
  const url = `${apiUrl}${FDOC_API_PATHS.createPackage}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(buildCreatePackageBody(input)),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error:
          (json.error as string) ??
          (json.message as string) ??
          `F.Doc HTTP ${res.status}`,
        raw: json,
      };
    }
    return parseCreateResponse(json);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "F.Doc: ошибка сети",
    };
  }
}

export async function fdocGetPackageStatus(externalId: string): Promise<FdocPackageStatusResult> {
  if (!isFdocConfigured()) {
    return { ok: false, externalId, status: "unknown", error: "F.Doc не настроен" };
  }

  const { apiUrl } = readFdocEnv();
  const url = `${apiUrl}${FDOC_API_PATHS.getPackage(externalId)}`;

  try {
    const res = await fetch(url, { headers: authHeaders() });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        externalId,
        status: "unknown",
        error: (json.error as string) ?? `F.Doc HTTP ${res.status}`,
        raw: json,
      };
    }
    return parseStatusResponse(externalId, json);
  } catch (e) {
    return {
      ok: false,
      externalId,
      status: "unknown",
      error: e instanceof Error ? e.message : "F.Doc: ошибка сети",
    };
  }
}
