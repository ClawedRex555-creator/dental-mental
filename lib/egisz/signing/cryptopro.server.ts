import "server-only";

import type { SignCdaOptions } from "@/lib/egisz/signing/interface";
import { resolveDoctorCertThumbprint } from "@/lib/egisz/signing/interface";
import type { DocumentSigner, SignedDocument } from "@/lib/egisz/signing/interface";

function normalizeThumbprint(value: string): string {
  return value.replace(/[\s:]/g, "").toUpperCase();
}

function signingServiceConfig(): { url: string; secret?: string } | null {
  const url = process.env.EGISZ_SIGNING_URL?.trim();
  if (!url) return null;
  const secret = process.env.EGISZ_SIGNING_SECRET?.trim();
  return { url, secret: secret || undefined };
}

/**
 * Подпись CDA через агент на Windows-ПК с КриптоПро (см. docs/CRYPTOPRO-WINDOWS.md).
 */
export const cryptoproDocumentSigner: DocumentSigner = {
  async signCda(xml: string, options: SignCdaOptions): Promise<SignedDocument> {
    const doctorThumbprint = resolveDoctorCertThumbprint(options);
    const orgThumbprint = options.config.orgCertThumbprint?.trim();
    if (!doctorThumbprint) {
      throw new Error(
        "CryptoPro: укажите отпечаток КЭП врача в карточке сотрудника (Сотрудники → врач → ЕГИСЗ)"
      );
    }
    if (!orgThumbprint) {
      throw new Error(
        "CryptoPro: укажите отпечаток КЭП организации в Настройки → N3 / ЕГИСЗ"
      );
    }

    const service = signingServiceConfig();
    if (!service) {
      throw new Error(
        "CryptoPro: задайте EGISZ_SIGNING_URL в .env на сервере (URL агента на Windows-ПК, см. docs/CRYPTOPRO-WINDOWS.md)"
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (service.secret) {
      headers.Authorization = `Bearer ${service.secret}`;
    }

    const res = await fetch(service.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        xml,
        doctorCertThumbprint: normalizeThumbprint(doctorThumbprint),
        orgCertThumbprint: normalizeThumbprint(orgThumbprint),
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      dataBase64?: string;
      personalSignBase64?: string;
      organizationSignBase64?: string;
    };

    if (!res.ok || !data.ok) {
      throw new Error(
        data.error ??
          `Агент подписи (${service.url}): HTTP ${res.status}. Проверьте, что агент запущен на Windows и сервер видит ПК по сети.`
      );
    }

    if (!data.dataBase64 || !data.personalSignBase64 || !data.organizationSignBase64) {
      throw new Error("Агент подписи вернул неполный ответ");
    }

    return {
      xml,
      dataBase64: data.dataBase64,
      base64: data.dataBase64,
      personalSignBase64: data.personalSignBase64,
      organizationSignBase64: data.organizationSignBase64,
      signatures: [
        { role: "doctor", stub: false },
        { role: "organization", stub: false },
      ],
    };
  },
};
