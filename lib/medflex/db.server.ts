import "server-only";

import { randomBytes } from "crypto";
import { withDb } from "@/lib/db";
import {
  defaultMedflexConfig,
  mergeMedflexConfigForSave,
  parseMedflexConfig,
  type MedflexClinicConfig,
} from "@/lib/medflex/types";

async function readRaw(clinicId: string): Promise<MedflexClinicConfig> {
  const raw = await withDb(async (client) => {
    const res = await client.query<{ medflex_config: unknown }>(
      `SELECT medflex_config FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId]
    );
    return res.rows[0]?.medflex_config;
  });
  return parseMedflexConfig(raw ?? defaultMedflexConfig());
}

export async function getMedflexConfig(clinicId: string): Promise<MedflexClinicConfig> {
  return readRaw(clinicId);
}

export async function saveMedflexConfig(
  clinicId: string,
  incoming: Partial<MedflexClinicConfig> & {
    apiToken?: string | null;
    inboundToken?: string | null;
  }
): Promise<MedflexClinicConfig> {
  const stored = await readRaw(clinicId);
  const merged = mergeMedflexConfigForSave(stored, incoming);
  if (!merged.inboundToken?.trim()) {
    merged.inboundToken = `mf_${randomBytes(24).toString("hex")}`;
  }
  if (!merged.filialId?.trim()) {
    merged.filialId = clinicId;
  }
  const updated = await withDb(async (client) => {
    const res = await client.query(
      `UPDATE clinics SET medflex_config = $2::jsonb WHERE id = $1`,
      [clinicId, JSON.stringify(merged)]
    );
    return res.rowCount;
  });
  if (updated === null) throw new Error("База данных недоступна");
  if (updated === 0) throw new Error("Клиника не найдена");
  return merged;
}

export async function patchMedflexConfigMeta(
  clinicId: string,
  patch: Partial<
    Pick<
      MedflexClinicConfig,
      | "lastSchedulePushAt"
      | "lastSchedulePushError"
      | "lastServicesPushAt"
      | "lastServicesPushError"
    >
  >
): Promise<void> {
  const stored = await readRaw(clinicId);
  const merged = { ...stored, ...patch };
  await withDb(async (client) => {
    await client.query(`UPDATE clinics SET medflex_config = $2::jsonb WHERE id = $1`, [
      clinicId,
      JSON.stringify(merged),
    ]);
  });
}

export async function listMedflexEnabledClinics(): Promise<
  Array<{ id: string; slug: string; name: string; config: MedflexClinicConfig }>
> {
  const rows = await withDb(async (client) => {
    const res = await client.query<{
      id: string;
      slug: string;
      name: string;
      medflex_config: unknown;
    }>(
      `SELECT id, slug, name, medflex_config FROM clinics
       WHERE COALESCE((medflex_config->>'enabled')::boolean, false) = true`
    );
    return res.rows;
  });
  if (!rows) return [];
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    config: parseMedflexConfig(r.medflex_config),
  }));
}

export function generateMedflexInboundToken(): string {
  return `mf_${randomBytes(24).toString("hex")}`;
}
