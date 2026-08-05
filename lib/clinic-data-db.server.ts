import "server-only";

import {
  CLINIC_DATA_SCHEMA_VERSION,
  createFreshPersistedState,
  hasClinicData,
  isLikelyAccidentalMassEntityLoss,
  mergeClinicDataOnWriteConflict,
  applyAllDeletionTombstones,
  isSuspiciousClinicDataDowngrade,
  mergeClinicDataForSave,
  parseClinicPersistedState,
  shouldRejectEmptyClinicOverwrite,
  type ClinicPersistedState,
} from "@/lib/clinic-persisted-state";
import { withUniqueWorkActNumbers } from "@/lib/work-act-number";
import { listStaffDb } from "@/lib/staff-db.server";
import {
  decryptClinicSnapshotPhi,
  encryptClinicSnapshotPhi,
} from "@/lib/phi-crypto.server";
import { withDb } from "@/lib/db";

export interface ClinicDataRecord {
  data: ClinicPersistedState;
  updatedAt: string;
  version: number;
  /** Оптимистичная блокировка (миграция 008). */
  revision: number;
}

export interface ClinicDataSaveResult extends ClinicDataRecord {
  mergedOnConflict: boolean;
}

export class ClinicRevisionConflictError extends Error {
  readonly code = "REVISION_CONFLICT" as const;
  constructor(public readonly serverRevision: number, public readonly serverUpdatedAt: string) {
    super("Конфликт версии снимка клиники");
  }
}

export class PatientMassLossGuardError extends Error {
  readonly code = "ACCIDENTAL_PATIENT_MASS_LOSS" as const;
  constructor() {
    super("Отклонено: вкладка пытается резко сократить список пациентов");
  }
}

export class ScheduleMassLossGuardError extends Error {
  readonly code = "ACCIDENTAL_SCHEDULE_MASS_LOSS" as const;
  constructor() {
    super("Отклонено: вкладка пытается резко сократить расписание");
  }
}

function enforceDeletedPatientsHard(
  snapshot: ClinicPersistedState,
  deletedPatientIds: Set<string>
): ClinicPersistedState {
  if (!deletedPatientIds.size) return snapshot;
  const filterByPatient = <T extends { patientId?: string }>(rows: T[]) =>
    rows.filter((row) => !row.patientId || !deletedPatientIds.has(row.patientId));
  const nextTeeth = { ...snapshot.teethByPatient };
  for (const patientId of deletedPatientIds) {
    delete nextTeeth[patientId];
  }
  return {
    ...snapshot,
    patients: snapshot.patients.filter((p) => !deletedPatientIds.has(p.id)),
    appointments: filterByPatient(snapshot.appointments),
    medicalRecords: filterByPatient(snapshot.medicalRecords),
    treatmentPlans: filterByPatient(snapshot.treatmentPlans),
    payments: filterByPatient(snapshot.payments),
    invoices: filterByPatient(snapshot.invoices),
    workActs: filterByPatient(snapshot.workActs),
    prepayments: filterByPatient(snapshot.prepayments),
    patientFiles: filterByPatient(snapshot.patientFiles),
    patientNotes: filterByPatient(snapshot.patientNotes),
    teethByPatient: nextTeeth,
  };
}

async function getClinicDataDbFromClient(
  client: import("pg").PoolClient,
  clinicId: string
): Promise<ClinicDataRecord | null> {
  const res = await client.query<{
    data: unknown;
    updated_at: Date;
    version: number | null;
    revision: number | string | null;
  }>(
    `SELECT data, updated_at, version, COALESCE(revision, 0) AS revision
     FROM clinic_snapshots WHERE clinic_id = $1 LIMIT 1`,
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
    revision: Number(row.revision ?? 0),
  };
}

export async function getClinicDataDb(clinicId: string): Promise<ClinicDataRecord | null> {
  return (
    (await withDb(async (client) => getClinicDataDbFromClient(client, clinicId))) ?? null
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

function buildSnapshotAfterStaffRemoval(
  data: ClinicPersistedState,
  staffId: string
): ClinicPersistedState {
  return {
    ...data,
    doctors: data.doctors.filter((d) => d.id !== staffId),
    doctorSchedules: (data.doctorSchedules ?? []).filter((s) => s.doctorId !== staffId),
    cabinets: data.cabinets.map((c) => ({
      ...c,
      staffIds: (c.staffIds ?? []).filter((id) => id !== staffId),
    })),
    appointments: data.appointments.map((a) => {
      if (a.doctorId === staffId) return { ...a, doctorId: undefined };
      if (a.assistantId === staffId) {
        return { ...a, assistantId: undefined, assistantHours: undefined };
      }
      return a;
    }),
    workActs: data.workActs.map((act) =>
      act.doctorId === staffId ? { ...act, doctorId: undefined } : act
    ),
  };
}

/** Убрать сотрудника из clinic_snapshots (врачи из staff_members учитываются) */
export async function removeStaffFromClinicSnapshot(
  clinicId: string,
  staffId: string
): Promise<ClinicDataRecord | null> {
  const record = await getClinicDataDbWithLegacyStaff(clinicId);
  let data: ClinicPersistedState;

  if (record) {
    data = record.data;
  } else {
    const staff = await listStaffDb(clinicId);
    if (!staff.some((s) => s.id === staffId)) return null;
    data = { ...createFreshPersistedState(), doctors: staff };
  }

  if (!data.doctors.some((d) => d.id === staffId)) {
    return record;
  }

  const next = buildSnapshotAfterStaffRemoval(data, staffId);
  return saveClinicDataDb(clinicId, next, { allowEmptyResult: true });
}

export async function saveClinicDataDb(
  clinicId: string,
  data: ClinicPersistedState,
  options?: {
    allowEmptyResult?: boolean;
    expectedUpdatedAt?: string | null;
    expectedRevision?: number | null;
    autoMergeOnVersionConflict?: boolean;
  }
): Promise<ClinicDataSaveResult> {
  const expectedUpdatedAt =
    typeof options?.expectedUpdatedAt === "string" && options.expectedUpdatedAt.trim()
      ? options.expectedUpdatedAt
      : null;
  const expectedRevision =
    typeof options?.expectedRevision === "number" && Number.isFinite(options.expectedRevision)
      ? Math.max(0, Math.floor(options.expectedRevision))
      : null;
  const shouldAutoMergeOnConflict = options?.autoMergeOnVersionConflict !== false;

  const saved = await withDb(async (client) => {
    // Сериализуем сохранения по clinicId на уровне БД:
    // это предотвращает гонки между 5+ устройствами и разными инстансами app.
    await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [clinicId]);
    try {
      const existing = await getClinicDataDbWithLegacyStaffFromClient(client, clinicId);
      const revisionConflict =
        expectedRevision != null &&
        existing != null &&
        existing.revision !== expectedRevision;
      const timestampConflict = Boolean(
        existing?.data && expectedUpdatedAt && existing.updatedAt > expectedUpdatedAt
      );
      const hasVersionConflict = revisionConflict || timestampConflict;
      if (hasVersionConflict && existing && !shouldAutoMergeOnConflict) {
        throw new ClinicRevisionConflictError(existing.revision, existing.updatedAt);
      }
      const incomingForSave =
        hasVersionConflict && existing?.data && shouldAutoMergeOnConflict
          ? mergeClinicDataOnWriteConflict(existing.data, data)
          : data;

      if (
        existing &&
        isLikelyAccidentalMassEntityLoss(existing.data.patients, incomingForSave.patients)
      ) {
        throw new PatientMassLossGuardError();
      }
      if (
        existing &&
        isLikelyAccidentalMassEntityLoss(existing.data.appointments, incomingForSave.appointments)
      ) {
        throw new ScheduleMassLossGuardError();
      }
      // Только explicit tombstones — не выводить delete из absence в snapshot.
      const deletedPatientIds = new Set<string>([
        ...(existing?.data.deletedPatientIds ?? []),
        ...(incomingForSave.deletedPatientIds ?? []),
        ...(data.deletedPatientIds ?? []),
      ]);

      const merged =
        existing && hasClinicData(existing.data)
          ? mergeClinicDataForSave(existing.data, incomingForSave)
          : withUniqueWorkActNumbers(incomingForSave);
      const toSave = applyAllDeletionTombstones(
        enforceDeletedPatientsHard(merged, deletedPatientIds)
      );

      if (
        !options?.allowEmptyResult &&
        existing &&
        shouldRejectEmptyClinicOverwrite(existing.data, incomingForSave, toSave)
      ) {
        throw new Error("Нельзя перезаписать данные клиники пустым снимком");
      }
      if (existing && isSuspiciousClinicDataDowngrade(existing.data, toSave)) {
        throw new Error(
          "Отклонено: снимок выглядит повреждённым (подменены пациенты, врачи или услуги). Обновите страницу и повторите."
        );
      }

      const encrypted = encryptClinicSnapshotPhi(toSave);
      const payload = {
        ...encrypted,
        _schemaVersion: CLINIC_DATA_SCHEMA_VERSION,
      };
      await client.query(
        `INSERT INTO clinic_snapshots (clinic_id, data, version, updated_at, revision)
         VALUES ($1, $2::jsonb, $3, NOW(), 1)
         ON CONFLICT (clinic_id) DO UPDATE
         SET data = EXCLUDED.data,
             version = EXCLUDED.version,
             updated_at = NOW(),
             revision = clinic_snapshots.revision + 1`,
        [clinicId, JSON.stringify(payload), CLINIC_DATA_SCHEMA_VERSION]
      );
      const res = await client.query<{ updated_at: Date; revision: number | string }>(
        `SELECT updated_at, COALESCE(revision, 0) AS revision
         FROM clinic_snapshots WHERE clinic_id = $1`,
        [clinicId]
      );
      return {
        data: toSave,
        updatedAt: res.rows[0]?.updated_at.toISOString() ?? new Date().toISOString(),
        version: CLINIC_DATA_SCHEMA_VERSION,
        revision: Number(res.rows[0]?.revision ?? 0),
        mergedOnConflict: hasVersionConflict && shouldAutoMergeOnConflict,
      };
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [clinicId]).catch(() => undefined);
    }
  });
  if (!saved) throw new Error("DATABASE_URL не настроен");
  return saved;
}

async function getClinicDataDbWithLegacyStaffFromClient(
  client: import("pg").PoolClient,
  clinicId: string
): Promise<ClinicDataRecord | null> {
  const base = await getClinicDataDbFromClient(client, clinicId);
  if (!base) {
    const merged = await mergeLegacyStaff(client, clinicId, createFreshPersistedState());
    if (!merged.doctors.length) return null;
    return {
      data: merged,
      updatedAt: new Date(0).toISOString(),
      version: CLINIC_DATA_SCHEMA_VERSION,
      revision: 0,
    };
  }
  const merged = await mergeLegacyStaff(client, clinicId, base.data);
  if (merged.doctors.length === base.data.doctors.length) return base;
  return { ...base, data: merged };
}

export async function getClinicDataDbWithLegacyStaff(
  clinicId: string
): Promise<ClinicDataRecord | null> {
  return (
    (await withDb(async (client) =>
      getClinicDataDbWithLegacyStaffFromClient(client, clinicId)
    )) ?? null
  );
}
