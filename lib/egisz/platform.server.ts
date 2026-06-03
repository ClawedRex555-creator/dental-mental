import "server-only";

import { withDb } from "@/lib/db";
import type { EgiszClinicConfig, EgiszConnectionMode } from "@/lib/egisz/types";
import {
  defaultEgiszConfig,
  isN3StubMode,
  parseEgiszConfig,
  resolveGatewayUrl,
  resolveSystemId,
} from "@/lib/egisz/types";

/** Общие параметры продукта Emkaro в N3 (один ИС на платформу). */
export interface PlatformEgiszSettings {
  systemId?: string;
  productName: string;
  defaultGatewayUrl?: string;
}

export interface ClinicEgiszSummary {
  clinicId: string;
  slug: string;
  name: string;
  moduleEnabled: boolean;
  integrationEnabled: boolean;
  connectionMode: EgiszConnectionMode;
  organizationOid?: string;
  inn?: string;
  n3Configured: boolean;
  stubMode: boolean;
  queuedCount: number;
  errorCount: number;
  sentCount: number;
}

export function getPlatformEgiszSettings(): PlatformEgiszSettings {
  return {
    systemId: process.env.EGISZ_SYSTEM_ID?.trim() || undefined,
    productName: process.env.EGISZ_PRODUCT_NAME?.trim() || "Emkaro",
    defaultGatewayUrl: process.env.EGISZ_GATEWAY_URL?.trim() || undefined,
  };
}

/** Слияние сохранённого конфига клиники с платформенными значениями по умолчанию. */
export function resolveClinicEgiszConfig(stored: EgiszClinicConfig): EgiszClinicConfig {
  const platform = getPlatformEgiszSettings();
  return {
    ...stored,
    systemId: stored.systemId?.trim() || platform.systemId || undefined,
    gatewayUrl:
      stored.gatewayUrl?.trim() || platform.defaultGatewayUrl || stored.gatewayUrl,
  };
}

const PASSWORD_MASK = "••••••••";

export function maskEgiszConfigForClient(config: EgiszClinicConfig): EgiszClinicConfig & {
  n3PasswordSet: boolean;
} {
  const passwordSet = Boolean(config.n3?.password?.trim());
  return {
    ...config,
    n3: {
      ...config.n3,
      password: passwordSet ? PASSWORD_MASK : "",
    },
    n3PasswordSet: passwordSet,
  };
}

export function mergeEgiszConfigForSave(
  stored: EgiszClinicConfig,
  incoming: EgiszClinicConfig
): EgiszClinicConfig {
  const next = parseEgiszConfig(incoming);
  const storedPassword = stored.n3?.password?.trim();
  const incomingPassword = incoming.n3?.password?.trim();
  const keepPassword =
    !incomingPassword ||
    incomingPassword === PASSWORD_MASK ||
    incomingPassword === storedPassword;

  return {
    ...next,
    n3: {
      ...next.n3,
      password: keepPassword ? storedPassword : incomingPassword,
    },
  };
}

export interface ClinicEgiszReadiness {
  connectionMode: EgiszConnectionMode;
  stubMode: boolean;
  systemId?: string;
  gatewayUrl: string;
  missingForLive: string[];
}

export function getClinicEgiszReadiness(
  config: EgiszClinicConfig,
  clinicMeta?: { name?: string; inn?: string }
): ClinicEgiszReadiness {
  const resolved = resolveClinicEgiszConfig(config);
  const stubMode = isN3StubMode(resolved);
  const missingForLive: string[] = [];

  if (!clinicMeta?.name?.trim()) missingForLive.push("Название клиники");
  if (!clinicMeta?.inn?.trim()) missingForLive.push("ИНН клиники");
  if (!resolved.organizationOid?.trim()) missingForLive.push("OID организации");
  if (!resolveSystemId(resolved)) missingForLive.push("ID информационной системы (Emkaro)");
  if (!resolved.n3?.guid?.trim()) missingForLive.push("GUID N3");
  if (!resolved.n3?.lpuId?.trim()) missingForLive.push("idLPU N3");
  if (!resolved.n3?.login?.trim()) missingForLive.push("Login N3");
  if (!resolved.n3?.password?.trim()) missingForLive.push("Password N3");

  return {
    connectionMode: resolved.connectionMode ?? "stub",
    stubMode,
    systemId: resolveSystemId(resolved),
    gatewayUrl: resolveGatewayUrl(resolved),
    missingForLive,
  };
}

export async function listClinicEgiszSummaries(): Promise<ClinicEgiszSummary[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        slug: string;
        name: string;
        modules: unknown;
        egisz_config: unknown;
        snapshot_data: unknown;
        queued_count: string;
        error_count: string;
        sent_count: string;
      }>(
        `SELECT c.id, c.slug, c.name, c.modules, c.egisz_config, cs.data AS snapshot_data,
                COALESCE(q.queued_count, 0)::text AS queued_count,
                COALESCE(e.error_count, 0)::text AS error_count,
                COALESCE(s.sent_count, 0)::text AS sent_count
         FROM clinics c
         LEFT JOIN clinic_snapshots cs ON cs.clinic_id = c.id
         LEFT JOIN (
           SELECT clinic_id, COUNT(*) AS queued_count
           FROM egisz_submissions WHERE status = 'queued'
           GROUP BY clinic_id
         ) q ON q.clinic_id = c.id
         LEFT JOIN (
           SELECT clinic_id, COUNT(*) AS error_count
           FROM egisz_submissions WHERE status = 'error'
           GROUP BY clinic_id
         ) e ON e.clinic_id = c.id
         LEFT JOIN (
           SELECT clinic_id, COUNT(*) AS sent_count
           FROM egisz_submissions WHERE status IN ('sent', 'accepted')
           GROUP BY clinic_id
         ) s ON s.clinic_id = c.id
         ORDER BY c.name ASC`
      );

      const { parseClinicModules } = await import("@/lib/modules");

      return res.rows.map((row) => {
        const stored = parseEgiszConfig(row.egisz_config ?? defaultEgiszConfig());
        const resolved = resolveClinicEgiszConfig(stored);
        const modules = parseClinicModules(row.modules);
        const settings =
          row.snapshot_data && typeof row.snapshot_data === "object"
            ? ((row.snapshot_data as { clinicSettings?: { inn?: string } }).clinicSettings ?? {})
            : {};
        const n3 = resolved.n3 ?? {};

        return {
          clinicId: row.id,
          slug: row.slug,
          name: row.name,
          moduleEnabled: modules.egisz !== false,
          integrationEnabled: Boolean(resolved.enabled),
          connectionMode: resolved.connectionMode ?? "stub",
          organizationOid: resolved.organizationOid,
          inn: settings.inn?.trim() || undefined,
          n3Configured: Boolean(
            n3.guid?.trim() && n3.lpuId?.trim() && n3.login?.trim() && n3.password?.trim()
          ),
          stubMode: isN3StubMode(resolved),
          queuedCount: Number(row.queued_count) || 0,
          errorCount: Number(row.error_count) || 0,
          sentCount: Number(row.sent_count) || 0,
        };
      });
    })) ?? []
  );
}
