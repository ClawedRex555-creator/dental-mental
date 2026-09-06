import "server-only";

import { withDb } from "@/lib/db";
import type { EmkaroSignTenantConfig } from "@/lib/document-sign/emkaro-sign/types";

export { verifyEmkaroSignHmac } from "@/lib/document-sign/emkaro-sign/hmac";

export function readEmkaroSignEnv() {
  return {
    apiUrl: process.env.EMKARO_SIGN_API_URL?.trim().replace(/\/$/, "") ?? "",
    apiKey: process.env.EMKARO_SIGN_API_KEY?.trim() ?? "",
    webhookSecret: process.env.EMKARO_SIGN_WEBHOOK_SECRET?.trim() ?? "",
  };
}

export function isEmkaroSignConfigured(): boolean {
  const { apiUrl, apiKey } = readEmkaroSignEnv();
  return Boolean(apiUrl && apiKey);
}

function parseTenantConfig(raw: unknown): EmkaroSignTenantConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const organizationId =
    typeof d.organizationId === "string" ? d.organizationId.trim() : "";
  const clinicId = typeof d.clinicId === "string" ? d.clinicId.trim() : "";
  if (!organizationId || !clinicId) return null;
  return { organizationId, clinicId };
}

/** Привязка клиники МИС к tenant Emkaro Sign (UUID org/clinic в sign.emkaro.ru) */
export async function getEmkaroSignTenantForClinic(
  clinicId: string
): Promise<EmkaroSignTenantConfig | null> {
  const fromDb = await withDb(async (client) => {
    const res = await client.query<{ emkaro_sign_config: unknown }>(
      `SELECT emkaro_sign_config FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId]
    );
    return parseTenantConfig(res.rows[0]?.emkaro_sign_config);
  });
  if (fromDb) return fromDb;

  const mapRaw = process.env.EMKARO_SIGN_TENANT_MAP?.trim();
  if (!mapRaw) return null;
  try {
    const map = JSON.parse(mapRaw) as Record<string, unknown>;
    const slugRes = await withDb(async (client) => {
      const res = await client.query<{ slug: string }>(
        `SELECT slug FROM clinics WHERE id = $1 LIMIT 1`,
        [clinicId]
      );
      return res.rows[0]?.slug?.toLowerCase();
    });
    if (!slugRes) return null;
    return parseTenantConfig(map[slugRes]);
  } catch {
    return null;
  }
}

/**
 * Найти клинику МИС по UUID клиники в Sign
 * (clinics.emkaro_sign_config.clinicId или EMKARO_SIGN_TENANT_MAP).
 */
export async function findMisClinicBySignClinicId(
  signClinicId: string
): Promise<{ id: string; slug: string } | null> {
  const trimmed = signClinicId.trim();
  if (!trimmed) return null;

  const fromDb = await withDb(async (client) => {
    const res = await client.query<{ id: string; slug: string }>(
      `SELECT id, slug FROM clinics
       WHERE emkaro_sign_config->>'clinicId' = $1
       LIMIT 1`,
      [trimmed]
    );
    return res.rows[0] ?? null;
  });
  if (fromDb) return fromDb;

  const mapRaw = process.env.EMKARO_SIGN_TENANT_MAP?.trim();
  if (!mapRaw) return null;
  try {
    const map = JSON.parse(mapRaw) as Record<string, unknown>;
    for (const [slug, value] of Object.entries(map)) {
      const tenant = parseTenantConfig(value);
      if (tenant?.clinicId === trimmed) {
        const row = await withDb(async (client) => {
          const res = await client.query<{ id: string; slug: string }>(
            `SELECT id, slug FROM clinics WHERE lower(slug) = $1 LIMIT 1`,
            [slug.toLowerCase()]
          );
          return res.rows[0] ?? null;
        });
        if (row) return row;
      }
    }
  } catch {
    return null;
  }
  return null;
}
