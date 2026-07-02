import "server-only";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  createFreshPersistedState,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import type { ClinicSettings } from "@/lib/types";
import { getClinicDataDb, saveClinicDataDb } from "@/lib/clinic-data-db.server";
import { withDb } from "@/lib/db";
import { parseClinicModules } from "@/lib/modules";

export interface ClinicWipeBackupMeta {
  exportedAt: string;
  clinic: {
    id: string;
    slug: string;
    name: string;
    modules: ReturnType<typeof parseClinicModules>;
  };
  snapshot: ClinicPersistedState | null;
  staffMembers: unknown[];
  patientConsents: unknown[];
  egiszSubmissions: unknown[];
  mobilePatientAccounts: unknown[];
}

function clinicBackupDir(): string {
  const configured = process.env.CLINIC_BACKUP_DIR?.trim();
  if (configured) return configured;
  return path.join(process.cwd(), "data", "backups", "clinics");
}

function preserveClinicSettings(previous?: ClinicSettings): ClinicSettings {
  const fresh = createFreshPersistedState().clinicSettings;
  if (!previous) return fresh;
  return {
    ...fresh,
    name: previous.name || fresh.name,
    address: previous.address ?? fresh.address,
    phone: previous.phone ?? fresh.phone,
    email: previous.email ?? fresh.email,
    inn: previous.inn ?? fresh.inn,
    workHours: previous.workHours ?? fresh.workHours,
    weeklySchedule: previous.weeklySchedule ?? fresh.weeklySchedule,
    logo: previous.logo ?? fresh.logo,
  };
}

export function buildWipedClinicSnapshot(
  previous: ClinicPersistedState | null
): ClinicPersistedState {
  const fresh = createFreshPersistedState();
  fresh.clinicSettings = preserveClinicSettings(previous?.clinicSettings);
  return fresh;
}

export async function getClinicMetaForWipe(
  clinicId: string
): Promise<{ id: string; slug: string; name: string }> {
  const clinicRow = await withDb(async (client) => {
    const res = await client.query<{ id: string; slug: string; name: string }>(
      `SELECT id, slug, name FROM clinics WHERE id = $1 LIMIT 1`,
      [clinicId]
    );
    return res.rows[0] ?? null;
  });
  if (!clinicRow) throw new Error("Клиника не найдена");
  return clinicRow;
}

async function collectClinicBackup(clinicId: string): Promise<ClinicWipeBackupMeta> {
  const clinicRow = await withDb(async (client) => {
    const res = await client.query<{
      id: string;
      slug: string;
      name: string;
      modules: unknown;
    }>(`SELECT id, slug, name, modules FROM clinics WHERE id = $1 LIMIT 1`, [clinicId]);
    return res.rows[0] ?? null;
  });

  if (!clinicRow) {
    throw new Error("Клиника не найдена");
  }

  const snapshot = await getClinicDataDb(clinicId);

  const related = await withDb(async (client) => {
    const [staff, consents, egisz, mobile] = await Promise.all([
      client.query<{ data: unknown }>(
        `SELECT data FROM staff_members WHERE clinic_id = $1`,
        [clinicId]
      ),
      client.query(`SELECT * FROM patient_consents WHERE clinic_id = $1`, [clinicId]),
      client.query(`SELECT * FROM egisz_submissions WHERE clinic_id = $1`, [clinicId]),
      client.query(
        `SELECT id, clinic_id, patient_id, login, created_at, updated_at
         FROM mobile_patient_accounts WHERE clinic_id = $1`,
        [clinicId]
      ),
    ]);
    return {
      staffMembers: staff.rows.map((r) => r.data),
      patientConsents: consents.rows,
      egiszSubmissions: egisz.rows,
      mobilePatientAccounts: mobile.rows,
    };
  });

  return {
    exportedAt: new Date().toISOString(),
    clinic: {
      id: clinicRow.id,
      slug: clinicRow.slug,
      name: clinicRow.name,
      modules: parseClinicModules(clinicRow.modules),
    },
    snapshot: snapshot?.data ?? null,
    staffMembers: related?.staffMembers ?? [],
    patientConsents: related?.patientConsents ?? [],
    egiszSubmissions: related?.egiszSubmissions ?? [],
    mobilePatientAccounts: related?.mobilePatientAccounts ?? [],
  };
}

async function writeClinicBackupFile(
  slug: string,
  payload: ClinicWipeBackupMeta
): Promise<{ backupPath: string; backupFileName: string }> {
  const dir = clinicBackupDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFileName = `${slug}-${stamp}.json`;
  const backupPath = path.join(dir, backupFileName);
  await writeFile(backupPath, JSON.stringify(payload, null, 2), "utf8");
  return { backupPath, backupFileName };
}

async function deleteClinicOperationalData(clinicId: string): Promise<void> {
  await withDb(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM staff_members WHERE clinic_id = $1`, [clinicId]);
      await client.query(`DELETE FROM patient_consents WHERE clinic_id = $1`, [clinicId]);
      await client.query(`DELETE FROM egisz_submissions WHERE clinic_id = $1`, [clinicId]);
      await client.query(`DELETE FROM mobile_patient_accounts WHERE clinic_id = $1`, [clinicId]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

export async function wipeClinicDataWithBackup(clinicId: string): Promise<{
  backupPath: string;
  backupFileName: string;
  clinicSlug: string;
  clinicName: string;
}> {
  const backup = await collectClinicBackup(clinicId);
  const { backupPath, backupFileName } = await writeClinicBackupFile(
    backup.clinic.slug,
    backup
  );

  const wipedSnapshot = buildWipedClinicSnapshot(backup.snapshot);
  await deleteClinicOperationalData(clinicId);
  await saveClinicDataDb(clinicId, wipedSnapshot, { allowEmptyResult: true });

  return {
    backupPath,
    backupFileName,
    clinicSlug: backup.clinic.slug,
    clinicName: backup.clinic.name,
  };
}
