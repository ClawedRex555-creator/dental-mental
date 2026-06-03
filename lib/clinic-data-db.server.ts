import "server-only";

import {
  CLINIC_DATA_SCHEMA_VERSION,
  createFreshPersistedState,
  hasClinicData,
  isSuspiciousClinicDataDowngrade,
  mergeClinicDataForSave,
  parseClinicPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import {
  decryptClinicSnapshotPhi,
  encryptClinicSnapshotPhi,
} from "@/lib/phi-crypto.server";
import { withDb } from "@/lib/db";

export interface ClinicDataRecord {
  data: ClinicPersistedState;
  updatedAt: string;
  version: number;
}

export async function getClinicDataDb(clinicId: string): Promise<ClinicDataRecord | null> {
  return (
    (await withDb(async (client) => {
      const res = await client.query<{ data: unknown; updated_at: Date; version: number | null }>(
        `SELECT data, updated_at, version FROM clinic_snapshots WHERE clinic_id = $1 LIMIT 1`,
        [clinicId]
      );
      const row = res.rows[0];
      if (!row) return null;
      const parsed = parseClinicPersistedState(row.data);
      if (!parsed) return null;
      return {
        data: decryptClinicSnapshotPhi(parsed),
        updatedAt: row.updated_at.toISOString(),
        version: row.version ?? CLINIC_DATA_SCHEMA_VERSION,
      };
    })) ?? null
  );
}

/** Миграция: если snapshot пуст, подтянуть врачей из staff_members */
async function mergeLegacyStaff(
  client: import("pg").PoolClient,
  clinicId: string,
  data: ClinicPersistedState
): Promise<ClinicPersistedState> {
  if (data.doctors.length > 0) return data;
  const res = await client.query<{ data: unknown }>(
    `SELECT data FROM staff_members WHERE clinic_id = $1`,
    [clinicId]
  );
  const doctors = res.rows
    .map((r) => {
      const d = r.data as Record<string, unknown>;
      return d?.id && d?.name ? (r.data as ClinicPersistedState["doctors"][0]) : null;
    })
    .filter((d): d is ClinicPersistedState["doctors"][0] => d !== null);
  if (!doctors.length) return data;
  return { ...data, doctors };
}

export async function saveClinicDataDb(
  clinicId: string,
  data: ClinicPersistedState
): Promise<ClinicDataRecord> {
  const existing = await getClinicDataDb(clinicId);
  if (existing && hasClinicData(existing.data) && !hasClinicData(data)) {
    throw new Error("Нельзя перезаписать данные клиники пустым снимком");
  }
  if (existing && isSuspiciousClinicDataDowngrade(existing.data, data)) {
    throw new Error(
      "Отклонено: снимок выглядит повреждённым (подменены пациенты, врачи или услуги). Обновите страницу и повторите."
    );
  }

  const toSave =
    existing && hasClinicData(existing.data)
      ? mergeClinicDataForSave(existing.data, data)
      : data;

  const saved = await withDb(async (client) => {
    const encrypted = encryptClinicSnapshotPhi(toSave);
    const payload = {
      ...encrypted,
      _schemaVersion: CLINIC_DATA_SCHEMA_VERSION,
    };
    await client.query(
      `INSERT INTO clinic_snapshots (clinic_id, data, version, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (clinic_id) DO UPDATE
       SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = NOW()`,
      [clinicId, JSON.stringify(payload), CLINIC_DATA_SCHEMA_VERSION]
    );
    const res = await client.query<{ updated_at: Date }>(
      `SELECT updated_at FROM clinic_snapshots WHERE clinic_id = $1`,
      [clinicId]
    );
    return {
      data: toSave,
      updatedAt: res.rows[0]?.updated_at.toISOString() ?? new Date().toISOString(),
      version: CLINIC_DATA_SCHEMA_VERSION,
    };
  });
  if (!saved) throw new Error("DATABASE_URL не настроен");
  return saved;
}

export async function getClinicDataDbWithLegacyStaff(
  clinicId: string
): Promise<ClinicDataRecord | null> {
  const base = await getClinicDataDb(clinicId);
  if (!base) {
    return (
      (await withDb(async (client) => {
        const merged = await mergeLegacyStaff(client, clinicId, createFreshPersistedState());
        if (!merged.doctors.length) return null;
        return {
          data: merged,
          updatedAt: new Date(0).toISOString(),
          version: CLINIC_DATA_SCHEMA_VERSION,
        };
      })) ?? null
    );
  }
  return (
    (await withDb(async (client) => {
      const merged = await mergeLegacyStaff(client, clinicId, base.data);
      if (merged.doctors.length === base.data.doctors.length) return base;
      return { ...base, data: merged };
    })) ?? base
  );
}
