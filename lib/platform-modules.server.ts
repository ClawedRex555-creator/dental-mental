import "server-only";

import {
  defaultClinicModules,
  parseClinicModules,
  type ClinicModules,
} from "@/lib/modules";
import { withDb } from "@/lib/db";

export interface ClinicWithModules {
  id: string;
  slug: string;
  name: string;
  modules: ClinicModules;
  egiszEnabled: boolean;
}

export async function getClinicModules(clinicId: string): Promise<ClinicModules> {
  const raw = await withDb(async (client) => {
    const res = await client.query<{ modules: unknown }>(
      `SELECT modules FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId]
    );
    return res.rows[0]?.modules;
  });
  if (raw === undefined || raw === null) return defaultClinicModules();
  return parseClinicModules(raw);
}

export async function getClinicModulesBySlug(slug: string): Promise<ClinicModules | null> {
  const raw = await withDb(async (client) => {
    const res = await client.query<{ modules: unknown }>(
      `SELECT modules FROM clinics WHERE slug = $1 LIMIT 1`,
      [slug.toLowerCase()]
    );
    return res.rows[0]?.modules ?? null;
  });
  if (raw === null) return null;
  return parseClinicModules(raw);
}

export async function updateClinicModules(
  clinicId: string,
  modules: ClinicModules
): Promise<void> {
  await withDb(async (client) => {
    await client.query(`UPDATE clinics SET modules = $2::jsonb WHERE id = $1`, [
      clinicId,
      JSON.stringify(modules),
    ]);
  });
}

export async function listClinicsWithModules(): Promise<ClinicWithModules[]> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{
        id: string;
        slug: string;
        name: string;
        modules: unknown;
        egisz_config: unknown;
      }>(`SELECT id, slug, name, modules, egisz_config FROM clinics ORDER BY name ASC`);
      return res.rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        modules: parseClinicModules(row.modules),
        egiszEnabled: Boolean((row.egisz_config as { enabled?: boolean })?.enabled),
      }));
    })) ?? []
  );
}
